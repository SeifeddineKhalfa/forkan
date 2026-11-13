import { z } from 'zod';
import { blankToUndefined, phoneSchema } from '../common/schemas.js';

export const TEMPLATE_KINDS = ['RECEIPT', 'PAYMENT_REMINDER', 'ABSENCE', 'MEMBERSHIP_REMINDER', 'CLASS_ANNOUNCEMENT'] as const;

export const updateSettingsSchema = z.object({
  billingDay: z.number().int().min(1).max(28).optional(),
  paymentDueDays: z.number().int().min(0).max(90).optional(),
  receiptFooter: z.string().trim().max(300).nullable().optional(),
  contactPhone: phoneSchema.nullable().optional(),
  whatsappPhone: phoneSchema.nullable().optional(),
  showHijriDates: z.boolean().optional(),
  whatsappTemplates: z.partialRecord(z.enum(TEMPLATE_KINDS), z.string().trim().min(1).max(1000)).optional(),
  schoolAddress: blankToUndefined(z.string().trim().max(250)),
  /** Plain text shown on the public «about» page (one paragraph per line). */
  aboutHtml: z.string().trim().max(5000).nullable().optional(),
  mapEmbedUrl: z.string().trim().url().max(1000).refine((u) => /^https:\/\//i.test(u), { message: 'HTTPS_URL_REQUIRED' }).nullable().optional(),
  socialLinks: z
    .object({
      facebook: blankToUndefined(z.string().trim().url().max(300).refine((u) => /^https:\/\//i.test(u), { message: 'HTTPS_URL_REQUIRED' })),
      instagram: blankToUndefined(z.string().trim().url().max(300).refine((u) => /^https:\/\//i.test(u), { message: 'HTTPS_URL_REQUIRED' })),
      youtube: blankToUndefined(z.string().trim().url().max(300).refine((u) => /^https:\/\//i.test(u), { message: 'HTTPS_URL_REQUIRED' })),
    })
    .optional(),
});

export type UpdateSettingsDto = z.infer<typeof updateSettingsSchema>;
