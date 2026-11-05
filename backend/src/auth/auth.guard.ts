import { CanActivate, ExecutionContext, HttpStatus, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { ApiError } from '../common/api-error.js';
import {
  ALLOW_PENDING_PASSWORD,
  AuthUser,
  IS_PUBLIC,
  ROLES,
} from '../common/decorators.js';
import type { UserRole } from '../generated/prisma/client.js';
import { AuthService } from './auth.service.js';
import { ACCESS_COOKIE } from './cookies.js';

/** Global guard: authentication, forced password change, then roles. */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly auth: AuthService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const targets = [ctx.getHandler(), ctx.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets)) return true;

    const req = ctx.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    const token = (req.cookies as Record<string, string | undefined>)[ACCESS_COOKIE];
    if (!token) throw new ApiError(HttpStatus.UNAUTHORIZED, 'UNAUTHENTICATED');

    try {
      req.user = await this.auth.verifyAccess(token);
    } catch {
      throw new ApiError(HttpStatus.UNAUTHORIZED, 'ACCESS_TOKEN_EXPIRED');
    }

    if (
      req.user.mustChangePassword &&
      !this.reflector.getAllAndOverride<boolean>(ALLOW_PENDING_PASSWORD, targets)
    ) {
      throw new ApiError(HttpStatus.FORBIDDEN, 'PASSWORD_CHANGE_REQUIRED');
    }

    const roles = this.reflector.getAllAndOverride<UserRole[] | undefined>(ROLES, targets);
    if (roles && req.user.role !== 'ADMIN' && !roles.includes(req.user.role)) {
      throw new ApiError(HttpStatus.FORBIDDEN, 'FORBIDDEN');
    }
    return true;
  }
}
