import { z } from 'zod';
import { blankToUndefined, isoDate, money, patchOf } from '../common/schemas.js';

const month = z.number().int().min(1).max(12);

export const academicYearSchema = z
  .object({
    name: z.string().trim().regex(/^\d{4}-\d{4}$/),
    startDate: isoDate,
    endDate: isoDate,
    billableMonths: z.array(month).max(12).default([9, 10, 11, 12, 1, 2, 3, 4, 5, 6]),
    isCurrent: z.boolean().default(false),
    membershipFee: blankToUndefined(money),
    membershipWindowStart: blankToUndefined(isoDate),
    membershipWindowEnd: blankToUndefined(isoDate),
  })
  .refine((y) => y.startDate < y.endDate, { path: ['endDate'], message: 'END_BEFORE_START' });

export const updateAcademicYearSchema = z.object({
  billableMonths: z.array(month).max(12).optional(),
  isCurrent: z.boolean().optional(),
  membershipFee: money.nullable().optional(),
  membershipWindowStart: isoDate.nullable().optional(),
  membershipWindowEnd: isoDate.nullable().optional(),
});

export const venueSchema = z.object({
  name: z.string().trim().min(1).max(120),
  address: blankToUndefined(z.string().trim().max(250)),
  mapEmbedUrl: blankToUndefined(z.string().url().max(1000).refine((u) => /^https:\/\//i.test(u), { message: 'HTTPS_URL_REQUIRED' })),
  isPublic: z.boolean().default(true),
});

export const updateVenueSchema = patchOf(venueSchema).extend({ isActive: z.boolean().optional() });

export const roomSchema = z.object({
  name: z.string().trim().min(1).max(80),
  capacity: blankToUndefined(z.number().int().min(1).max(1000)),
});

export const updateRoomSchema = patchOf(roomSchema).extend({ isActive: z.boolean().optional() });

export type AcademicYearDto = z.infer<typeof academicYearSchema>;
export type UpdateAcademicYearDto = z.infer<typeof updateAcademicYearSchema>;
export type VenueDto = z.infer<typeof venueSchema>;
export type UpdateVenueDto = z.infer<typeof updateVenueSchema>;
export type RoomDto = z.infer<typeof roomSchema>;
export type UpdateRoomDto = z.infer<typeof updateRoomSchema>;
