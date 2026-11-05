import { z } from 'zod';
import { blankToUndefined, id, isoDate } from '../common/schemas.js';

const n = (max: number) => z.number().int().min(1).max(max);

/** The three ways of entering a range (spec A5); all are normalised to surah:ayah + indexes. */
export const rangeSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('THUMN'), fromThumn: n(480), toThumn: n(480) }),
  z.object({ mode: z.literal('SURAH'), fromSurah: n(114), toSurah: n(114) }),
  z.object({ mode: z.literal('AYAH'), fromSurah: n(114), fromAyah: n(300), toSurah: n(114), toAyah: n(300) }),
]);

export const hifzSessionSchema = z.object({
  studentId: id,
  date: isoDate,
  /** Who listened; defaults to the teacher typing it, else the student's main teacher. */
  teacherId: blankToUndefined(id),
  classSessionId: blankToUndefined(id),
  notes: blankToUndefined(z.string().trim().max(1000)),
  entries: z
    .array(
      z.object({
        type: z.enum(['NEW', 'RECENT_REVISION', 'OLD_REVISION', 'INITIAL_LEVEL']),
        range: rangeSchema,
        rating: z.number().int().min(1).max(5).optional(),
        note: blankToUndefined(z.string().trim().max(300)),
      }),
    )
    .min(1)
    .max(20),
});

export const timelineQuery = z.object({ limit: z.coerce.number().int().min(1).max(200).default(50) });

export type HifzSessionDto = z.infer<typeof hifzSessionSchema>;
