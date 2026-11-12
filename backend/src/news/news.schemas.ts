import { z } from 'zod';
import { blankToUndefined, id, listQuery, patchOf } from '../common/schemas.js';
import type { TiptapNode } from './tiptap-html.js';

const category = z.enum(['ANNOUNCEMENT', 'ACTIVITY', 'THANKS', 'CONDOLENCE', 'ASSOCIATION']);

/** A Tiptap document (rendered through a whitelist, so only the size is limited here). */
const tiptapDoc = z
  .custom<TiptapNode>((v) => typeof v === 'object' && v !== null && (v as TiptapNode).type === 'doc', { message: 'INVALID_DOCUMENT' })
  .refine((v) => JSON.stringify(v).length <= 200_000, { message: 'DOCUMENT_TOO_LARGE' });

export const newsSchema = z.object({
  title: z.string().trim().min(2).max(160),
  excerpt: blankToUndefined(z.string().trim().max(300)),
  bodyJson: tiptapDoc,
  category: category.default('ANNOUNCEMENT'),
  classId: blankToUndefined(id),
});

export const updateNewsSchema = patchOf(newsSchema)
  .extend({ excerpt: z.string().trim().max(300).nullable().optional(), classId: id.nullable().optional() });

export const newsListQuery = listQuery.extend({
  status: z.enum(['ALL', 'DRAFT', 'PUBLISHED']).default('ALL'),
  category: category.optional(),
});

export const publicNewsQuery = z.object({
  category: category.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(1000).default(12),
});

export type NewsDto = z.infer<typeof newsSchema>;
export type UpdateNewsDto = z.infer<typeof updateNewsSchema>;
export type NewsListQuery = z.infer<typeof newsListQuery>;
export type PublicNewsQuery = z.infer<typeof publicNewsQuery>;
