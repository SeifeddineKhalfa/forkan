import type { Prisma } from '../generated/prisma/client.js';

/**
 * Next value of a per-school counter ("student:2026", "receipt:2026", …).
 * Must run inside the transaction that uses the number: the row lock serialises
 * concurrent callers and a rollback gives the number back (no gaps).
 */
export async function nextCounter(
  tx: Pick<Prisma.TransactionClient, '$queryRaw'>,
  schoolId: string,
  key: string,
): Promise<number> {
  const rows = await tx.$queryRaw<{ value: number }[]>`
    INSERT INTO "counters" ("schoolId", "key", "value") VALUES (${schoolId}, ${key}, 1)
    ON CONFLICT ("schoolId", "key") DO UPDATE SET "value" = "counters"."value" + 1
    RETURNING "value"`;
  return rows[0].value;
}
