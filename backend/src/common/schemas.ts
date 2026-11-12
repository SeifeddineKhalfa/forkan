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
  .union([z.number().nonnegative(), z.string().trim()])
  .transform((v) => String(v))
  // Checked after String(): a JSON number like 0.0004 must not slip past the 3-decimal rule.
  .pipe(z.string().regex(/^\d+(\.\d{1,3})?$/));

type NoDefault<T> = T extends z.ZodDefault<infer Inner> ? Inner : T;
type PatchShape<S extends z.ZodRawShape> = { [K in keyof S]: z.ZodOptional<NoDefault<S[K]>> };

/**
 * `.partial()` for PATCH bodies. Zod's own `.partial()` still applies `.default()`s, so a body
 * like `{ isActive: false }` would come out with every create-time default filled in and
 * silently reset fields the client never sent. Here a field that is not sent stays undefined.
 */
export function patchOf<S extends z.ZodRawShape>(schema: z.ZodObject<S>): z.ZodObject<PatchShape<S>> {
  const shape: Record<string, z.ZodType> = {};
  for (const [key, field] of Object.entries(schema.shape)) {
    const inner = field instanceof z.ZodDefault ? (field.unwrap() as z.ZodType) : (field as z.ZodType);
    shape[key] = inner.optional();
  }
  return z.object(shape) as unknown as z.ZodObject<PatchShape<S>>;
}

export const hhmm =z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

export const id = z.string().uuid();

export const listQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  q: z.string().trim().max(100).optional(),
});

/** Treats "" from HTML forms as "not provided". */
export const blankToUndefined = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((v) => (v === '' || v === null ? undefined : v), schema.optional());
