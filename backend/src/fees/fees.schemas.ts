import { z } from 'zod';
import { blankToUndefined, id, isoDate, listQuery, money } from '../common/schemas.js';

export const feeItemSchema = z.object({
  name: z.string().trim().min(1).max(120),
  defaultAmount: money,
});

export const updateFeeItemSchema = feeItemSchema.partial().extend({ isActive: z.boolean().optional() });

/** A one-off charge: from the catalog (amount defaults to the item's) or free text. */
const oneOffFields = {
  feeItemId: blankToUndefined(id),
  label: blankToUndefined(z.string().trim().min(1).max(160)),
  amount: blankToUndefined(money),
  dueDate: blankToUndefined(isoDate),
};
const needsLabel = (c: { feeItemId?: string; label?: string; amount?: string }) =>
  !!c.feeItemId || (!!c.label && c.amount !== undefined);

export const chargeSchema = z
  .object({ studentId: id, ...oneOffFields })
  .refine(needsLabel, { message: 'FEE_ITEM_OR_LABEL_AND_AMOUNT' });

export const bulkChargeSchema = z
  .object({
    classId: id,
    ...oneOffFields,
    /** Skip students who already have a live charge with the same label. */
    skipExisting: z.boolean().default(true),
  })
  .refine(needsLabel, { message: 'FEE_ITEM_OR_LABEL_AND_AMOUNT' });

export const cancelChargeSchema = z.object({ reason: z.string().trim().min(3).max(500) });

export const period = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);

export const generateMonthlySchema = z.object({ period });

export const chargeListQuery = listQuery.extend({
  state: z.enum(['OPEN', 'UNPAID', 'PARTIAL', 'OVERDUE', 'PAID', 'CANCELLED', 'ALL']).default('OPEN'),
  kind: z.enum(['MONTHLY', 'ONE_OFF', 'MEMBERSHIP']).optional(),
  studentId: id.optional(),
  classId: id.optional(),
  period: period.optional(),
});

export type FeeItemDto = z.infer<typeof feeItemSchema>;
export type UpdateFeeItemDto = z.infer<typeof updateFeeItemSchema>;
export type ChargeDto = z.infer<typeof chargeSchema>;
export type BulkChargeDto = z.infer<typeof bulkChargeSchema>;
export type ChargeListQuery = z.infer<typeof chargeListQuery>;
