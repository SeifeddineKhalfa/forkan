import { HttpStatus } from '@nestjs/common';
import { ApiError } from '../common/api-error.js';
import { Prisma } from '../generated/prisma/client.js';

type Decimal = Prisma.Decimal;

export interface OpenCharge {
  id: string;
  /** amount − paidAmount */
  remaining: Decimal;
}

export interface Allocation {
  chargeId: string;
  amount: Decimal;
}

const ZERO = new Prisma.Decimal(0);

/**
 * Splits a payment over open charges. Without `manual`, oldest first (callers pass the
 * charges sorted by due date). With `manual`, checks the staff's split. Whatever is not
 * allocated stays on the payment as family credit.
 */
export function allocate(
  amount: Decimal,
  charges: OpenCharge[],
  manual?: { chargeId: string; amount: Decimal }[],
): { allocations: Allocation[]; unallocated: Decimal } {
  if (manual) {
    const byId = new Map(charges.map((c) => [c.id, c]));
    let total = ZERO;
    const seen = new Set<string>();
    for (const m of manual) {
      const charge = byId.get(m.chargeId);
      if (!charge || seen.has(m.chargeId)) throw new ApiError(HttpStatus.UNPROCESSABLE_ENTITY, 'CHARGE_NOT_OPEN');
      if (m.amount.lte(0) || m.amount.gt(charge.remaining)) {
        throw new ApiError(HttpStatus.UNPROCESSABLE_ENTITY, 'ALLOCATION_EXCEEDS_CHARGE');
      }
      seen.add(m.chargeId);
      total = total.add(m.amount);
    }
    if (total.gt(amount)) throw new ApiError(HttpStatus.UNPROCESSABLE_ENTITY, 'ALLOCATION_EXCEEDS_AMOUNT');
    return { allocations: manual.map((m) => ({ chargeId: m.chargeId, amount: m.amount })), unallocated: amount.sub(total) };
  }

  let left = amount;
  const allocations: Allocation[] = [];
  for (const c of charges) {
    if (left.lte(0)) break;
    if (c.remaining.lte(0)) continue;
    const part = Prisma.Decimal.min(left, c.remaining);
    allocations.push({ chargeId: c.id, amount: part });
    left = left.sub(part);
  }
  return { allocations, unallocated: left };
}
