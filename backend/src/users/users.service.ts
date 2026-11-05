import { HttpStatus, Injectable } from '@nestjs/common';
import { AuditService } from '../audit/audit.service.js';
import { publicUser, hashPassword } from '../auth/auth.service.js';
import { ApiError, notFound } from '../common/api-error.js';
import type { AuthUser } from '../common/decorators.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { CreateUserDto, UpdateUserDto } from './users.schemas.js';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(actor: AuthUser) {
    const users = await this.prisma.forSchool(actor.schoolId).user.findMany({
      orderBy: [{ isActive: 'desc' }, { lastName: 'asc' }],
    });
    return users.map((u) => ({ ...publicUser(u), isActive: u.isActive, lastLoginAt: u.lastLoginAt }));
  }

  async create(actor: AuthUser, dto: CreateUserDto) {
    const { temporaryPassword, ...fields } = dto;
    const user = await this.prisma.forSchool(actor.schoolId).user.create({
      data: {
        ...fields,
        schoolId: actor.schoolId,
        passwordHash: await hashPassword(temporaryPassword),
        mustChangePassword: true,
      },
    });
    await this.audit.log(actor, 'USER_CREATE', 'User', user.id, undefined, publicUser(user));
    return publicUser(user);
  }

  async update(actor: AuthUser, id: string, dto: UpdateUserDto) {
    const db = this.prisma.forSchool(actor.schoolId);
    const before = await db.user.findUnique({ where: { id } });
    if (!before) throw notFound('User');
    if (id === actor.id && (dto.isActive === false || (dto.role && dto.role !== 'ADMIN'))) {
      // An admin must not lock themselves out.
      throw new ApiError(HttpStatus.BAD_REQUEST, 'CANNOT_DEMOTE_SELF');
    }
    const user = await db.user.update({ where: { id }, data: dto });
    if (dto.isActive === false) await this.revokeSessions(id);
    await this.audit.log(actor, 'USER_UPDATE', 'User', id, publicUser(before), {
      ...publicUser(user),
      isActive: user.isActive,
    });
    return { ...publicUser(user), isActive: user.isActive };
  }

  async resetPassword(actor: AuthUser, id: string, temporaryPassword: string) {
    const db = this.prisma.forSchool(actor.schoolId);
    if (!(await db.user.findUnique({ where: { id } }))) throw notFound('User');
    await db.user.update({
      where: { id },
      data: { passwordHash: await hashPassword(temporaryPassword), mustChangePassword: true },
    });
    await this.revokeSessions(id);
    await this.audit.log(actor, 'USER_RESET_PASSWORD', 'User', id);
  }

  private revokeSessions(userId: string) {
    return this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
