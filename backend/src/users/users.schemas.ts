import { z } from 'zod';
import { passwordSchema } from '../auth/password.schema.js';

const e164 = z.string().regex(/^\+[1-9]\d{7,14}$/, 'E164');
const role = z.enum(['ADMIN', 'STAFF', 'TEACHER']);

export const createUserSchema = z
  .object({
    email: z.string().trim().toLowerCase().email().optional(),
    phone: e164.optional(),
    role,
    firstName: z.string().trim().min(1).max(80),
    lastName: z.string().trim().min(1).max(80),
    temporaryPassword: passwordSchema,
  })
  .refine((u) => u.email || u.phone, { message: 'EMAIL_OR_PHONE', path: ['email'] });

export const updateUserSchema = z.object({
  role: role.optional(),
  firstName: z.string().trim().min(1).max(80).optional(),
  lastName: z.string().trim().min(1).max(80).optional(),
  isActive: z.boolean().optional(),
});

export const resetPasswordSchema = z.object({ temporaryPassword: passwordSchema });

export type CreateUserDto = z.infer<typeof createUserSchema>;
export type UpdateUserDto = z.infer<typeof updateUserSchema>;
