import { z } from 'zod';
import { blankToUndefined, id, isoDate, listQuery, money } from '../common/schemas.js';
import { period } from '../fees/fees.schemas.js';

const payer = {
  payerGuardianId: blankToUndefined(id),
  payerStudentId: blankToUndefined(id),
};
const onePayer = (p: { payerGuardianId?: string; payerStudentId?: string }) => !!p.payerGuardianId !== !!p.payerStudentId;

export const payerQuery = z.object(payer).refine(onePayer, { message: 'ONE_PAYER' });

export const recordPaymentSchema = z
  .object({
    ...payer,
    amount: money.refine((v) => Number(v) > 0, { message: 'AMOUNT_MUST_BE_POSITIVE' }),
    method: z.enum(['CASH', 'BANK_TRANSFER', 'CHECK', 'MOBILE', 'OTHER']).default('CASH'),
    reference: blankToUndefined(z.string().trim().max(100)),
    notes: blankToUndefined(z.string().trim().max(500)),
    /** Date written on a paper receipt being entered late; defaults to now. */
    paidAt: blankToUndefined(isoDate),
    /** Staff's own split; omitted = oldest charges first. */
    allocations: z
      .array(z.object({ chargeId: id, amount: money }))
      .max(200)
      .optional(),
  })
  .refine(onePayer, { message: 'ONE_PAYER' });

export const voidPaymentSchema = z.object({ reason: z.string().trim().min(3).max(500) });

export const paymentListQuery = listQuery.extend({
  from: isoDate.optional(),
  to: isoDate.optional(),
  method: z.enum(['CASH', 'BANK_TRANSFER', 'CHECK', 'MOBILE', 'OTHER']).optional(),
  studentId: id.optional(),
  payerGuardianId: id.optional(),
  voided: z.enum(['ALL', 'ONLY', 'NONE']).default('ALL'),
});

export const remindersQuery = z.object({ type: z.enum(['OVERDUE', 'MEMBERSHIP']).default('OVERDUE') });

export const financeQuery = z.object({ period: period.optional() });

export type PayerQuery = z.infer<typeof payerQuery>;
export type RecordPaymentDto = z.infer<typeof recordPaymentSchema>;
export type PaymentListQuery = z.infer<typeof paymentListQuery>;
