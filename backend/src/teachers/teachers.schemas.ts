import { z } from 'zod';
import { passwordSchema } from '../auth/password.schema.js';
import { blankToUndefined, id, isoDate, money, phoneSchema } from '../common/schemas.js';

const riwaya = z.enum(['QALUN', 'WARSH', 'HAFS']);

export const loginSchema = z
  .object({
    email: blankToUndefined(z.string().trim().toLowerCase().email()),
    phone: blankToUndefined(phoneSchema),
    temporaryPassword: passwordSchema,
  })
  .refine((l) => l.email || l.phone, { path: ['email'], message: 'EMAIL_OR_PHONE' });

const teacherFields = {
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  gender: z.enum(['MALE', 'FEMALE']),
  title: blankToUndefined(z.string().trim().max(40)),
  phone: blankToUndefined(phoneSchema),
  specialization: blankToUndefined(z.string().trim().max(80)),
  hireDate: blankToUndefined(isoDate),
  contractType: z.enum(['VOLUNTEER', 'PAID']).optional(),
  monthlySalary: blankToUndefined(money),
  notes: blankToUndefined(z.string().trim().max(2000)),
  studentId: blankToUndefined(id),
};

export const createTeacherSchema = z.object({
  ...teacherFields,
  /** Optional login created together with the teacher. */
  login: loginSchema.optional(),
});

export const updateTeacherSchema = z
  .object(teacherFields)
  .partial()
  .extend({
    isActive: z.boolean().optional(),
    studentId: id.nullable().optional(),
    monthlySalary: money.nullable().optional(),
  });

export const ijazaSchema = z.object({
  title: z.string().trim().min(1).max(200),
  riwaya: riwaya.optional(),
  grantedBy: blankToUndefined(z.string().trim().max(200)),
  year: blankToUndefined(z.number().int().min(1900).max(2100)),
});

export const teacherListQuery = z.object({
  q: z.string().trim().max(100).optional(),
  active: z.enum(['true', 'false', 'all']).default('true'),
});

export type CreateTeacherDto = z.infer<typeof createTeacherSchema>;
export type UpdateTeacherDto = z.infer<typeof updateTeacherSchema>;
export type IjazaDto = z.infer<typeof ijazaSchema>;
export type LoginDto = z.infer<typeof loginSchema>;
export type TeacherListQuery = z.infer<typeof teacherListQuery>;
