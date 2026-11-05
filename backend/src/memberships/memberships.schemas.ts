import { z } from 'zod';
import { id } from '../common/schemas.js';

export const registerMembershipSchema = z.object({
  studentId: id,
  /** Defaults to the current academic year. */
  academicYearId: id.optional(),
  /** Defaults to "new" unless the student was a member in another year. */
  isNew: z.boolean().optional(),
  formReceived: z.boolean().default(false),
});

export const updateMembershipSchema = z.object({ formReceived: z.boolean() });

export const membershipListQuery = z.object({
  academicYearId: id.optional(),
  state: z.enum(['ALL', 'PAID', 'UNPAID']).default('ALL'),
  type: z.enum(['ALL', 'NEW', 'RENEWAL']).default('ALL'),
  q: z.string().trim().max(100).optional(),
});

export const yearQuery = z.object({ academicYearId: id.optional() });

export type RegisterMembershipDto = z.infer<typeof registerMembershipSchema>;
export type MembershipListQuery = z.infer<typeof membershipListQuery>;
