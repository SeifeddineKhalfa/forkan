import { z } from 'zod';
import { blankToUndefined, id, isoDate, phoneSchema } from '../common/schemas.js';

/** Marks and scales with up to 2 decimals (e.g. 12.5, 4.25), passed to Prisma as strings. */
const mark = z
  .union([z.number().nonnegative(), z.string().trim().regex(/^\d+(\.\d{1,2})?$/)])
  .transform((v) => String(v))
  .refine((v) => Number(v) <= 999, { message: 'TOO_LARGE' });

const text = (max: number) => blankToUndefined(z.string().trim().max(max));

export const branchSchema = z.object({
  name: z.string().trim().min(1).max(100),
  quranScope: text(200),
  questionCount: z.number().int().min(1).max(20).default(4),
  hifzMax: mark.default('14'),
  tajwidMax: mark.default('6'),
  /** null = no pass mark. */
  passScore: mark.nullable().default(null),
  sortOrder: z.number().int().min(0).max(999).optional(),
});
export const updateBranchSchema = branchSchema.partial();

export const jurorSchema = z.object({
  teacherId: blankToUndefined(id),
  name: z.string().trim().min(1).max(150),
  isPresident: z.boolean().default(false),
});
export const jurorsSchema = z.object({ jurors: z.array(jurorSchema).max(15) });

export const createEvaluationSchema = z.object({
  kind: z.enum(['EXAM', 'COMPETITION']),
  title: z.string().trim().min(1).max(200),
  date: isoDate,
  location: text(200),
  notes: text(2000),
  classId: blankToUndefined(id),
  /** Defaults to the current academic year. */
  academicYearId: blankToUndefined(id),
  branches: z.array(branchSchema).min(1).max(30),
  jurors: z.array(jurorSchema).max(15).default([]),
});

export const updateEvaluationSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  date: isoDate.optional(),
  location: z.string().trim().max(200).nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
  classId: id.nullable().optional(),
});

export const evaluationListQuery = z.object({
  kind: z.enum(['EXAM', 'COMPETITION']).optional(),
  status: z.enum(['OPEN', 'CLOSED']).optional(),
  academicYearId: id.optional(),
});

/** Either an enrolled student or an external contestant (name required). */
export const addCandidateSchema = z
  .object({
    branchId: id,
    studentId: blankToUndefined(id),
    fullName: text(150),
    gender: z.enum(['MALE', 'FEMALE']).optional(),
    phone: blankToUndefined(phoneSchema),
  })
  .refine((v) => v.studentId || v.fullName, { message: 'STUDENT_OR_NAME_REQUIRED', path: ['fullName'] });

export const addFromClassSchema = z.object({ classId: id, branchId: id });

export const updateCandidateSchema = z.object({
  branchId: id.optional(),
  fullName: z.string().trim().min(1).max(150).optional(),
  gender: z.enum(['MALE', 'FEMALE']).nullable().optional(),
  phone: phoneSchema.nullable().optional(),
});

export const cardSchema = z.object({
  absent: z.boolean().default(false),
  hifzScore: mark.nullable().default(null),
  tajwidScore: mark.nullable().default(null),
  notes: z.string().trim().max(2000).nullable().default(null),
  questions: z
    .array(
      z.object({
        number: z.number().int().min(1).max(20),
        surahId: z.number().int().min(1).max(114).nullable().default(null),
        ayah: z.number().int().min(1).max(286).nullable().default(null),
        mistakes: z.string().trim().max(2000).nullable().default(null),
        note: z.string().trim().max(500).nullable().default(null),
      }),
    )
    .max(20)
    .default([]),
});

export type BranchDto = z.infer<typeof branchSchema>;
export type UpdateBranchDto = z.infer<typeof updateBranchSchema>;
export type JurorDto = z.infer<typeof jurorSchema>;
export type CreateEvaluationDto = z.infer<typeof createEvaluationSchema>;
export type UpdateEvaluationDto = z.infer<typeof updateEvaluationSchema>;
export type EvaluationListQuery = z.infer<typeof evaluationListQuery>;
export type AddCandidateDto = z.infer<typeof addCandidateSchema>;
export type UpdateCandidateDto = z.infer<typeof updateCandidateSchema>;
export type CardDto = z.infer<typeof cardSchema>;
