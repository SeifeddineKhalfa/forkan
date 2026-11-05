import { Prisma } from '../generated/prisma/client.js';
import type { SchoolTx as Tx } from '../prisma/prisma.service.js';
import type { Allocation, OpenCharge } from '../payments/allocation.js';

/**
 * Low-level ledger steps shared by payments, voids and credit application.
 * Everything here runs inside the caller's transaction; raw SQL is scoped by hand.
 */

export type Payer = { payerGuardianId: string } | { payerStudentId: string };

/** Who pays for a student: the payer guardian, else the primary one, else the student. */
export async function payerOf(tx: Tx, studentId: string): Promise<Payer> {
  const links = await tx.studentGuardian.findMany({ where: { studentId } });
  const link = links.find((l) => l.isPayer) ?? links.find((l) => l.isPrimary) ?? links[0];
  return link ? { payerGuardianId: link.guardianId } : { payerStudentId: studentId };
}

/** The students a payer's money can go to: the whole family, or the student alone. */
export async function studentsOf(tx: Tx, payer: Payer): Promise<string[]> {
  if ('payerStudentId' in payer) return [payer.payerStudentId];
  const links = await tx.studentGuardian.findMany({ where: { guardianId: payer.payerGuardianId } });
  return links.map((l) => l.studentId);
}

/** Open charges, oldest due first, locked until the end of the transaction. */
export async function lockOpenCharges(tx: Tx, schoolId: string, studentIds: string[]): Promise<OpenCharge[]> {
  if (!studentIds.length) return [];
  const rows = await tx.$queryRaw<{ id: string; amount: Prisma.Decimal; paidAmount: Prisma.Decimal }[]>`
    SELECT "id", "amount", "paidAmount" FROM "charges"
    WHERE "schoolId" = ${schoolId} AND "studentId" = ANY(${studentIds}) AND "status" = 'OPEN'
    ORDER BY "dueDate", "createdAt", "id"
    FOR UPDATE`;
  return rows.map((r) => ({ id: r.id, remaining: new Prisma.Decimal(r.amount).sub(r.paidAmount) }));
}

/** Writes allocations and moves the charges' paid amounts (PAID once fully covered). */
export async function applyAllocations(tx: Tx, paymentId: string, allocations: Allocation[], fromCredit: boolean) {
  for (const a of allocations) {
    // A payment can reach the same charge twice (at save, then later from its credit).
    await tx.paymentAllocation.upsert({
      where: { paymentId_chargeId: { paymentId, chargeId: a.chargeId } },
      create: { paymentId, chargeId: a.chargeId, amount: a.amount, fromCredit },
      update: { amount: { increment: a.amount } },
    });
    await tx.$executeRaw`
      UPDATE "charges" SET
        "paidAmount" = "paidAmount" + ${a.amount},
        "status" = CASE WHEN "paidAmount" + ${a.amount} >= "amount" THEN 'PAID'::"ChargeStatus" ELSE "status" END
      WHERE "id" = ${a.chargeId}`;
  }
}

/** Undoes a payment's allocations on its charges (the allocation rows stay as history). */
export async function reverseAllocations(tx: Tx, paymentId: string) {
  const allocations = await tx.paymentAllocation.findMany({ where: { paymentId } });
  for (const a of allocations) {
    await tx.$executeRaw`
      UPDATE "charges" SET
        "paidAmount" = "paidAmount" - ${a.amount},
        "status" = CASE WHEN "status" = 'PAID' THEN 'OPEN'::"ChargeStatus" ELSE "status" END
      WHERE "id" = ${a.chargeId}`;
  }
  return allocations;
}
