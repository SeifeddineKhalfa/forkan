import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { Env } from '../config/env.js';
import { ApiError } from '../common/api-error.js';
import type { AuthUser } from '../common/decorators.js';
import type { User } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ACCESS_TTL_MS, REFRESH_TTL_MS } from './cookies.js';

export interface AccessPayload {
  sub: string;
  sid: string; // schoolId
  role: User['role'];
  mcp: boolean; // must change password
}

export interface IssuedTokens {
  accessToken: string;
  refreshToken: string;
}

const invalidCredentials = () =>
  new ApiError(HttpStatus.UNAUTHORIZED, 'INVALID_CREDENTIALS');
const invalidSession = () => new ApiError(HttpStatus.UNAUTHORIZED, 'SESSION_EXPIRED');

const hashToken = (raw: string) => createHash('sha256').update(raw).digest('hex');

export function publicUser(u: User) {
  return {
    id: u.id,
    email: u.email,
    phone: u.phone,
    role: u.role,
    firstName: u.firstName,
    lastName: u.lastName,
    mustChangePassword: u.mustChangePassword,
  };
}

@Injectable()
export class AuthService {
  // Used to keep timing similar when the login does not exist.
  private dummyHash?: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async login(login: string, password: string, userAgent?: string) {
    const school = await this.prisma.school.findUnique({
      where: { slug: this.config.get('SCHOOL_SLUG') },
    });
    if (!school) throw invalidCredentials();

    const identifier = login.trim();
    const user = await this.prisma.forSchool(school.id).user.findFirst({
      where: {
        isActive: true,
        OR: [{ email: identifier.toLowerCase() }, { phone: identifier }],
      },
    });

    this.dummyHash ??= await argon2.hash('timing-equaliser');
    const ok = await argon2.verify(user?.passwordHash ?? this.dummyHash, password);
    if (!user || !ok) throw invalidCredentials();

    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    return { user: publicUser(user), tokens: await this.issue(user, randomUUID(), userAgent) };
  }

  async refresh(rawToken: string | undefined, userAgent?: string) {
    if (!rawToken) throw invalidSession();
    const token = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: hashToken(rawToken) },
      include: { user: true },
    });
    if (!token) throw invalidSession();

    if (token.revokedAt) {
      // A rotated token was presented again: assume theft, end the whole session family.
      await this.revokeFamily(token.familyId);
      throw invalidSession();
    }
    if (token.expiresAt < new Date() || !token.user.isActive) throw invalidSession();

    // Atomic rotation: of two concurrent refreshes with the same token, only one wins.
    const rotated = await this.prisma.refreshToken.updateMany({
      where: { id: token.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (rotated.count !== 1) throw invalidSession();
    return {
      user: publicUser(token.user),
      tokens: await this.issue(token.user, token.familyId, userAgent),
    };
  }

  async logout(rawToken: string | undefined) {
    if (!rawToken) return;
    const token = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: hashToken(rawToken) },
    });
    if (token) await this.revokeFamily(token.familyId);
  }

  async me(auth: AuthUser) {
    const user = await this.prisma.forSchool(auth.schoolId).user.findUnique({
      where: { id: auth.id },
    });
    if (!user || !user.isActive) throw invalidSession();
    return publicUser(user);
  }

  async changePassword(auth: AuthUser, current: string, next: string, userAgent?: string) {
    const user = await this.prisma.forSchool(auth.schoolId).user.findUnique({
      where: { id: auth.id },
    });
    if (!user || !(await argon2.verify(user.passwordHash, current))) {
      throw new ApiError(HttpStatus.BAD_REQUEST, 'WRONG_CURRENT_PASSWORD');
    }
    if (current === next) throw new ApiError(HttpStatus.BAD_REQUEST, 'PASSWORD_UNCHANGED');

    const updated = await this.prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await hashPassword(next), mustChangePassword: false },
    });
    await this.prisma.refreshToken.updateMany({
      where: { userId: user.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return {
      user: publicUser(updated),
      tokens: await this.issue(updated, randomUUID(), userAgent),
    };
  }

  async verifyAccess(token: string): Promise<AuthUser> {
    const p = await this.jwt.verifyAsync<AccessPayload>(token, {
      secret: this.config.get('JWT_ACCESS_SECRET'),
    });
    // Re-read the user so that deactivation, a role change or an admin password reset
    // takes effect now, not when the 15-minute access token expires (one PK lookup).
    const user = await this.prisma.forSchool(p.sid).user.findUnique({
      where: { id: p.sub },
      select: { isActive: true, role: true, mustChangePassword: true },
    });
    if (!user?.isActive) throw invalidSession();
    return { id: p.sub, schoolId: p.sid, role: user.role, mustChangePassword: user.mustChangePassword };
  }

  private async issue(user: User, familyId: string, userAgent?: string): Promise<IssuedTokens> {
    const payload: AccessPayload = {
      sub: user.id,
      sid: user.schoolId,
      role: user.role,
      mcp: user.mustChangePassword,
    };
    const accessToken = await this.jwt.signAsync(payload, {
      secret: this.config.get('JWT_ACCESS_SECRET'),
      expiresIn: Math.floor(ACCESS_TTL_MS / 1000),
    });
    const refreshToken = randomBytes(32).toString('base64url');
    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        familyId,
        tokenHash: hashToken(refreshToken),
        expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
        userAgent: userAgent?.slice(0, 255),
      },
    });
    return { accessToken, refreshToken };
  }

  private revokeFamily(familyId: string) {
    return this.prisma.refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}

export const hashPassword = (password: string) =>
  argon2.hash(password, { type: argon2.argon2id });
