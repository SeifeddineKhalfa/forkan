import { z } from 'zod';
import { blankToUndefined, hhmm, id, money } from '../common/schemas.js';

export const slotSchema = z
  .object({
    day: z.enum(['SATURDAY', 'SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY']),
    kind: z.enum(['MEMORIZATION', 'REVISION', 'MIXED']).default('MEMORIZATION'),
    startTime: hhmm,
    endTime: hhmm,
    timeLabel: blankToUndefined(z.string().trim().max(40)),
  })
  .refine((s) => s.startTime < s.endTime, { path: ['endTime'], message: 'END_BEFORE_START' });

export const classTeacherSchema = z.object({
  teacherId: id,
  role: z.enum(['MAIN', 'ASSISTANT', 'SUPERVISOR']),
});

const teachersList = z
  .array(classTeacherSchema)
  .max(10)
  .refine((ts) => ts.filter((t) => t.role === 'MAIN').length <= 1, { message: 'ONE_MAIN_TEACHER' })
  .refine((ts) => new Set(ts.map((t) => t.teacherId)).size === ts.length, { message: 'DUPLICATE_TEACHER' });

const classFields = {
  academicYearId: id,
  name: z.string().trim().min(1).max(120),
  level: blankToUndefined(z.string().trim().max(60)),
  quranScope: blankToUndefined(z.string().trim().max(200)),
  audience: z.enum(['CHILDREN', 'TEENS', 'ADULTS']),
  genderPolicy: z.enum(['MIXED', 'MALE_ONLY', 'FEMALE_ONLY']).default('MIXED'),
  capacity: z.number().int().min(1).max(500).default(25),
  riwaya: blankToUndefined(z.enum(['QALUN', 'WARSH', 'HAFS'])),
  /** null / "" / 0 = free imla'. */
  monthlyFee: z.preprocess((v) => (v === '' ? null : v), money.nullable()).default(null),
  requiresMembership: z.boolean().default(true),
  isPublic: z.boolean().default(true),
  roomId: blankToUndefined(id),
};

export const createClassSchema = z.object({
  ...classFields,
  slots: z.array(slotSchema).max(14).default([]),
  teachers: teachersList.default([]),
});

export const updateClassSchema = z
  .object(classFields)
  .omit({ academicYearId: true })
  .partial()
  .extend({
    roomId: id.nullable().optional(),
    isActive: z.boolean().optional(),
    slots: z.array(slotSchema).max(14).optional(),
    teachers: teachersList.optional(),
  });

export const classListQuery = z.object({
  academicYearId: id.optional(),
  active: z.enum(['true', 'false', 'all']).default('true'),
  q: z.string().trim().max(100).optional(),
});

export type CreateClassDto = z.infer<typeof createClassSchema>;
export type UpdateClassDto = z.infer<typeof updateClassSchema>;
export type ClassListQuery = z.infer<typeof classListQuery>;
