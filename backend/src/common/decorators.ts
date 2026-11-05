import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { UserRole } from '../generated/prisma/client.js';

export interface AuthUser {
  id: string;
  schoolId: string;
  role: UserRole;
  mustChangePassword: boolean;
}

export const IS_PUBLIC = 'isPublic';
/** Route needs no authentication. */
export const Public = () => SetMetadata(IS_PUBLIC, true);

export const ROLES = 'roles';
/** Route is limited to these roles (ADMIN always passes). */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES, roles);

export const ALLOW_PENDING_PASSWORD = 'allowPendingPassword';
/** Route stays reachable while the user still has to change their password. */
export const AllowPendingPassword = () => SetMetadata(ALLOW_PENDING_PASSWORD, true);

export const CurrentUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): AuthUser =>
    ctx.switchToHttp().getRequest<{ user: AuthUser }>().user,
);
