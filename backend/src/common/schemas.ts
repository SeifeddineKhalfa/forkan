import { parsePhoneNumberFromString } from 'libphonenumber-js';
import { z } from 'zod';

/** Accepts "22 123 456", "0021622123456", "+216 22 123 456"… and returns E.164. Tunisia by default. */
export function normalizePhone(raw: string): string | null {
  const p = parsePhoneNumberFromString(raw.trim(), 'TN');
  return p?.isValid() ? p.number : null;
}

export const phoneSchema = z
  .string()
  .trim()
  .min(6)
  .transform((v, ctx) => {
    const e164 = normalizePhone(v);
    if (!e164) {
      ctx.addIssue({ code: 'custom', message: 'INVALID_PHONE' });
      return z.NEVER;
    }
    return e164;
  });

/** "2026-11-03" → Date at UTC midnight (stored in @db.Date columns). */
export const isoDate = z.iso.date().transform((v) => new Date(`${v}T00:00:00.000Z`));

/** TND amounts with up to 3 decimals (millimes), passed to Prisma as strings. */
export const money = z
  .union([z.number().nonnegative(), z.string().trim().regex(/^\d+(\.\d{1,3})?$/)])
  .transform((v) => String(v));

export const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

export const id = z.string().uuid();

export const listQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  q: z.string().trim().max(100).optional(),
});

/** Treats "" from HTML forms as "not provided". */
export const blankToUndefined = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((v) => (v === '' || v === null ? undefined : v), schema.optional());
