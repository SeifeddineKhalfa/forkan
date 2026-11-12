import { z } from 'zod';
import { blankToUndefined, id, isoDate, listQuery, money, patchOf, phoneSchema } from '../common/schemas.js';

const name = z.string().trim().min(1).max(80);
const relation = z.enum(['FATHER', 'MOTHER', 'BROTHER', 'SISTER', 'GRANDPARENT', 'UNCLE', 'AUNT', 'OTHER']);

export const guardianSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  phone: phoneSchema,
  phone2: blankToUndefined(phoneSchema),
  notes: blankToUndefined(z.string().trim().max(1000)),
});

export const updateGuardianSchema = patchOf(guardianSchema).extend({ phone2: phoneSchema.nullable().optional() });

export const guardianSearchQuery = z.object({
  phone: z.string().trim().max(30).optional(),
  q: z.string().trim().max(100).optional(),
});

/** Link an existing guardian (guardianId) or create one inline (guardian). */
export const guardianLinkSchema = z
  .object({
    guardianId: id.optional(),
    guardian: guardianSchema.optional(),
    relation,
    isPrimary: z.boolean().default(false),
    isPayer: z.boolean().default(false),
  })
  .refine((l) => !!l.guardianId !== !!l.guardian, { message: 'GUARDIAN_ID_OR_NEW' });

const studentFields = {
  firstName: name,
  lastName: name,
  firstNameLatin: blankToUndefined(z.string().trim().max(80)),
  lastNameLatin: blankToUndefined(z.string().trim().max(80)),
  gender: z.enum(['MALE', 'FEMALE']),
  dateOfBirth: blankToUndefined(isoDate),
  phone: blankToUndefined(phoneSchema),
  address: blankToUndefined(z.string().trim().max(250)),
  riwaya: blankToUndefined(z.enum(['QALUN', 'WARSH', 'HAFS'])),
  photoConsent: z.boolean().default(false),
  notes: blankToUndefined(z.string().trim().max(2000)),
};

export const createStudentSchema = z.object({
  ...studentFields,
  joinedAt: blankToUndefined(isoDate),
  guardians: z
    .array(guardianLinkSchema)
    .max(4)
    .default([])
    .refine((gs) => gs.filter((g) => g.isPrimary).length <= 1, { message: 'ONE_PRIMARY_GUARDIAN' }),
  /** Optional: enroll right away in this imla'. */
  classId: blankToUndefined(id),
});

export const updateStudentSchema = patchOf(z.object(studentFields))
  .extend({
    status: z.enum(['ACTIVE', 'INACTIVE', 'GRADUATED', 'LEFT']).optional(),
    dateOfBirth: isoDate.nullable().optional(),
    phone: phoneSchema.nullable().optional(),
    riwaya: z.enum(['QALUN', 'WARSH', 'HAFS']).nullable().optional(),
  });

export const studentListQuery = listQuery.extend({
  classId: id.optional(),
  status: z.enum(['ACTIVE', 'INACTIVE', 'GRADUATED', 'LEFT', 'ALL']).default('ACTIVE'),
  gender: z.enum(['MALE', 'FEMALE']).optional(),
});

export const enrollSchema = z.object({
  studentId: id,
  classId: id,
  startDate: blankToUndefined(isoDate),
  monthlyFeeOverride: blankToUndefined(money),
  /** ADMIN only: enroll even when the imla' is full. */
  overrideCapacity: z.boolean().default(false),
});

export const endEnrollmentSchema = z.object({ endDate: blankToUndefined(isoDate) });

export type GuardianDto = z.infer<typeof guardianSchema>;
export type UpdateGuardianDto = z.infer<typeof updateGuardianSchema>;
export type GuardianSearchQuery = z.infer<typeof guardianSearchQuery>;
export type GuardianLinkDto = z.infer<typeof guardianLinkSchema>;
export type CreateStudentDto = z.infer<typeof createStudentSchema>;
export type UpdateStudentDto = z.infer<typeof updateStudentSchema>;
export type StudentListQuery = z.infer<typeof studentListQuery>;
export type EnrollDto = z.infer<typeof enrollSchema>;
