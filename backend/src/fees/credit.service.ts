import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import { allocate } from '../payments/allocation.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { applyAllocations, lockOpenCharges, type Payer, payerOf, studentsOf } from './ledger.js';

/**
 * Family credit (spec A5): money left on earlier payments is applied to new charges,
 * oldest payment first, without a new receipt (`fromCredit = true`).
 */
@Injectable()
export class CreditService {
  private readonly logger = new Logger(CreditService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Called after charges are created or reopened for these students. Never throws. */
  async applyForStudents(schoolId: string, studentIds: string[]) {
    if (!studentIds.length) return 0;
    try {
      return await this.prisma.forSchool(schoolId).$transaction(async (tx) => {
        const payers = new Map<string, Payer>();
        for (const id of new Set(studentIds)) {
          const p = await payerOf(tx, id);
          payers.set(JSON.stringify(p), p);
        }
        let applied = 0;
        for (const payer of payers.values()) {
          const payments = await tx.$queryRaw<{ id: string; unallocatedAmount: Prisma.Decimal }[]>`
            SELECT "id", "unallocatedAmount" FROM "payments"
            WHERE "schoolId" = ${schoolId} AND "voidedAt" IS NULL AND "unallocatedAmount" > 0
              AND ${'payerGuardianId' in payer ? Prisma.sql`"payerGuardianId" = ${payer.payerGuardianId}` : Prisma.sql`"payerStudentId" = ${payer.payerStudentId}`}
            ORDER BY "paidAt", "id"
            FOR UPDATE`;
          if (!payments.length) continue;
          const charges = await lockOpenCharges(tx, schoolId, await studentsOf(tx, payer));
          for (const p of payments) {
            const { allocations, unallocated } = allocate(new Prisma.Decimal(p.unallocatedAmount), charges);
            if (!allocations.length) break;
            await applyAllocations(tx, p.id, allocations, true);
            await tx.payment.update({ where: { id: p.id }, data: { unallocatedAmount: unallocated } });
            for (const a of allocations) {
              const c = charges.find((x) => x.id === a.chargeId)!;
              c.remaining = c.remaining.sub(a.amount);
            }
            applied += allocations.length;
          }
        }
        return applied;
      });
    } catch (err) {
      // The charges are created either way; credit can be applied again on the next charge.
      this.logger.error({ err, schoolId }, 'credit application failed');
      return 0;
    }
  }
}
