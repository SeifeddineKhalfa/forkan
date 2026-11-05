import { z } from 'zod';
import { blankToUndefined, hhmm, id, isoDate } from '../common/schemas.js';

export const dayQuery = z.object({ date: isoDate.optional() });

const sessionKey = {
  classId: id,
  date: isoDate,
  /** A schedule slot's start, or any time for an ad-hoc session. */
  startTime: hhmm,
  endTime: blankToUndefined(hhmm),
};

export const openSessionSchema = z.object(sessionKey);

export const markSchema = z.object({
  entries: z
    .array(
      z.object({
        studentId: id,
        status: z.enum(['PRESENT', 'ABSENT', 'LATE', 'EXCUSED']),
        note: blankToUndefined(z.string().trim().max(200)),
      }),
    )
    .max(300),
  notes: blankToUndefined(z.string().trim().max(1000)),
});

export const cancelSessionSchema = z.object({
  ...sessionKey,
  reason: z.string().trim().min(2).max(200),
  resumeDate: blankToUndefined(isoDate),
});

export const publishSchema = z.object({
  title: z.string().trim().min(2).max(160),
  text: z.string().trim().min(5).max(2000),
});

export const rangeQuery = z.object({ from: isoDate.optional(), to: isoDate.optional() });

export type OpenSessionDto = z.infer<typeof openSessionSchema>;
export type MarkDto = z.infer<typeof markSchema>;
export type CancelSessionDto = z.infer<typeof cancelSessionSchema>;
export type PublishDto = z.infer<typeof publishSchema>;
export type RangeQuery = z.infer<typeof rangeQuery>;
