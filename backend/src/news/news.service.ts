import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'node:crypto';
import { AuditService } from '../audit/audit.service.js';
import { ApiError, notFound } from '../common/api-error.js';
import { todayInSchool } from '../common/dates.js';
import type { AuthUser } from '../common/decorators.js';
import type { Env } from '../config/env.js';
import { FilesService, IMAGE_TYPES } from '../files/files.service.js';
import type { NewsPost, Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { NewsDto, NewsListQuery, PublicNewsQuery, UpdateNewsDto } from './news.schemas.js';
import { SiteRevalidator } from './site-revalidator.js';
import { tiptapToHtml, tiptapToText, type TiptapNode } from './tiptap-html.js';

/** `coverUrl` holds the private file path; clients get a flag and a cache-busting version. */
const present = ({ coverUrl, ...post }: NewsPost & Record<string, unknown>) => ({
  ...post,
  hasCover: !!coverUrl,
  coverVersion: coverUrl ? post.updatedAt.getTime() : null,
});

const DAY_ORDER = ['SATURDAY', 'SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'];

/** News CMS for the office, and everything the public site may read (spec A5: no student data). */
@Injectable()
export class NewsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly files: FilesService,
    private readonly revalidate: SiteRevalidator,
    private readonly config: ConfigService<Env, true>,
  ) {}

  // ───────────── Office ─────────────

  async list(actor: AuthUser, q: NewsListQuery) {
    const db = this.prisma.forSchool(actor.schoolId);
    const where: Prisma.NewsPostWhereInput = {
      AND: [
        q.status === 'ALL' ? {} : { status: q.status },
        q.category ? { category: q.category } : {},
        q.q ? { title: { contains: q.q, mode: 'insensitive' } } : {},
      ],
    };
    const [items, total] = await Promise.all([
      db.newsPost.findMany({
        where,
        orderBy: [{ updatedAt: 'desc' }],
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        omit: { bodyJson: true, bodyHtml: true },
        include: { author: { select: { firstName: true, lastName: true } }, class: { select: { id: true, name: true } } },
      }),
      db.newsPost.count({ where }),
    ]);
    return { items: items.map((p) => present(p as unknown as NewsPost)), total, page: q.page, pageSize: q.pageSize };
  }

  async get(actor: AuthUser, id: string) {
    const post = await this.prisma.forSchool(actor.schoolId).newsPost.findUnique({
      where: { id },
      include: { class: { select: { id: true, name: true } } },
    });
    if (!post) throw notFound('NewsPost');
    return present(post);
  }

  async create(actor: AuthUser, dto: NewsDto) {
    await this.assertClass(actor.schoolId, dto.classId);
    const post = await this.prisma.forSchool(actor.schoolId).newsPost.create({
      data: {
        schoolId: actor.schoolId,
        authorId: actor.id,
        slug: `${todayInSchool().toISOString().slice(0, 10)}-${randomBytes(3).toString('hex')}`,
        title: dto.title,
        excerpt: dto.excerpt ?? this.excerpt(dto.bodyJson),
        bodyJson: dto.bodyJson as unknown as Prisma.InputJsonValue,
        bodyHtml: tiptapToHtml(dto.bodyJson),
        category: dto.category,
        classId: dto.classId,
      },
    });
    await this.audit.log(actor, 'NEWS_CREATE', 'NewsPost', post.id, undefined, { title: post.title });
    return present(post);
  }

  async update(actor: AuthUser, id: string, dto: UpdateNewsDto) {
    const before = await this.get(actor, id);
    await this.assertClass(actor.schoolId, dto.classId ?? undefined);
    const post = await this.prisma.forSchool(actor.schoolId).newsPost.update({
      where: { id },
      data: {
        title: dto.title,
        category: dto.category,
        classId: dto.classId,
        excerpt: dto.excerpt === undefined ? undefined : (dto.excerpt ?? (dto.bodyJson ? this.excerpt(dto.bodyJson) : null)),
        ...(dto.bodyJson && { bodyJson: dto.bodyJson as unknown as Prisma.InputJsonValue, bodyHtml: tiptapToHtml(dto.bodyJson) }),
      },
    });
    if (before.status === 'PUBLISHED') await this.revalidate.refresh();
    return present(post);
  }

  async setStatus(actor: AuthUser, id: string, status: 'DRAFT' | 'PUBLISHED') {
    const before = await this.get(actor, id);
    const post = await this.prisma.forSchool(actor.schoolId).newsPost.update({
      where: { id },
      // The first publication date is kept when a post is unpublished and published again.
      data: { status, publishedAt: status === 'PUBLISHED' ? (before.publishedAt ?? new Date()) : before.publishedAt },
    });
    await this.audit.log(actor, status === 'PUBLISHED' ? 'NEWS_PUBLISH' : 'NEWS_UNPUBLISH', 'NewsPost', id, undefined, { title: post.title });
    await this.revalidate.refresh();
    return present(post);
  }

  async remove(actor: AuthUser, id: string) {
    const db = this.prisma.forSchool(actor.schoolId);
    const post = await db.newsPost.findUnique({ where: { id } });
    if (!post) throw notFound('NewsPost');
    await db.newsPost.delete({ where: { id } });
    await this.files.remove(post.coverUrl);
    await this.audit.log(actor, 'NEWS_DELETE', 'NewsPost', id, { title: post.title, status: post.status }, undefined);
    if (post.status === 'PUBLISHED') await this.revalidate.refresh();
  }

  async setCover(actor: AuthUser, id: string, buffer: Buffer | undefined) {
    const db = this.prisma.forSchool(actor.schoolId);
    const before = await db.newsPost.findUnique({ where: { id } });
    if (!before) throw notFound('NewsPost');
    const path = await this.files.store(actor.schoolId, 'news', buffer, IMAGE_TYPES);
    const post = await db.newsPost.update({ where: { id }, data: { coverUrl: path } });
    await this.files.remove(before.coverUrl);
    if (post.status === 'PUBLISHED') await this.revalidate.refresh();
    return present(post);
  }

  async removeCover(actor: AuthUser, id: string) {
    const db = this.prisma.forSchool(actor.schoolId);
    const before = await db.newsPost.findUnique({ where: { id } });
    if (!before) throw notFound('NewsPost');
    const post = await db.newsPost.update({ where: { id }, data: { coverUrl: null } });
    await this.files.remove(before.coverUrl);
    if (post.status === 'PUBLISHED') await this.revalidate.refresh();
    return present(post);
  }

  async coverPath(actor: AuthUser, id: string) {
    const post = await this.prisma.forSchool(actor.schoolId).newsPost.findUnique({ where: { id }, select: { coverUrl: true } });
    if (!post?.coverUrl) throw notFound('Cover');
    return this.files.absolute(post.coverUrl);
  }

  // ───────────── Public (no login, published content only) ─────────────

  async publicSite() {
    const school = await this.publicSchool();
    const db = this.prisma.forSchool(school.id);
    const [year, venues] = await Promise.all([
      db.academicYear.findFirst({
        where: { isCurrent: true },
        select: { name: true, membershipFee: true, membershipWindowStart: true, membershipWindowEnd: true },
      }),
      db.venue.findMany({
        where: { isPublic: true, isActive: true },
        orderBy: { name: 'asc' },
        select: { id: true, name: true, address: true, mapEmbedUrl: true },
      }),
    ]);
    const s = school.settings;
    return {
      name: school.name,
      address: school.address,
      about: s?.aboutHtml ?? null,
      contactPhone: s?.contactPhone ?? school.phone,
      whatsappPhone: s?.whatsappPhone ?? null,
      mapEmbedUrl: s?.mapEmbedUrl ?? null,
      socialLinks: (s?.socialLinks as Record<string, string> | null) ?? {},
      membership: year,
      venues,
    };
  }

  /** Public imla'at of the current year with their weekly slots and teachers' names. */
  async publicSchedule() {
    const school = await this.publicSchool();
    const classes = await this.prisma.forSchool(school.id).class.findMany({
      where: { isPublic: true, isActive: true, academicYear: { isCurrent: true } },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        quranScope: true,
        audience: true,
        genderPolicy: true,
        scheduleSlots: { select: { day: true, kind: true, startTime: true, endTime: true, timeLabel: true } },
        room: { select: { name: true, venue: { select: { id: true, name: true, isPublic: true } } } },
        teachers: {
          where: { role: { in: ['MAIN', 'SUPERVISOR'] } },
          select: { role: true, teacher: { select: { title: true, firstName: true, lastName: true } } },
        },
      },
    });
    return classes.map(({ room, ...c }) => ({
      ...c,
      venue: room?.venue.isPublic ? { id: room.venue.id, name: room.venue.name, room: room.name } : null,
      scheduleSlots: [...c.scheduleSlots].sort(
        (a, b) => DAY_ORDER.indexOf(a.day) - DAY_ORDER.indexOf(b.day) || a.startTime.localeCompare(b.startTime),
      ),
    }));
  }

  async publicNews(q: PublicNewsQuery) {
    const school = await this.publicSchool();
    const db = this.prisma.forSchool(school.id);
    const where: Prisma.NewsPostWhereInput = { status: 'PUBLISHED', ...(q.category && { category: q.category }) };
    const [items, total] = await Promise.all([
      db.newsPost.findMany({
        where,
        orderBy: { publishedAt: 'desc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        select: {
          slug: true,
          title: true,
          excerpt: true,
          category: true,
          publishedAt: true,
          updatedAt: true,
          coverUrl: true,
          class: { select: { name: true } },
        },
      }),
      db.newsPost.count({ where }),
    ]);
    return {
      items: items.map(({ coverUrl, ...p }) => ({ ...p, hasCover: !!coverUrl, coverVersion: coverUrl ? p.updatedAt.getTime() : null })),
      total,
      page: q.page,
      pageSize: q.pageSize,
    };
  }

  async publicPost(slug: string) {
    const school = await this.publicSchool();
    const post = await this.prisma.forSchool(school.id).newsPost.findFirst({
      where: { slug, status: 'PUBLISHED' },
      select: {
        slug: true,
        title: true,
        excerpt: true,
        bodyHtml: true,
        bodyJson: true,
        category: true,
        publishedAt: true,
        updatedAt: true,
        coverUrl: true,
        class: { select: { name: true } },
      },
    });
    // Drafts answer exactly like missing posts.
    if (!post) throw notFound('NewsPost');
    const { coverUrl, bodyJson, ...rest } = post;
    return {
      ...rest,
      text: tiptapToText(bodyJson as unknown as TiptapNode).trim(),
      hasCover: !!coverUrl,
      coverVersion: coverUrl ? post.updatedAt.getTime() : null,
    };
  }

  async publicCover(slug: string) {
    const school = await this.publicSchool();
    const post = await this.prisma.forSchool(school.id).newsPost.findFirst({
      where: { slug, status: 'PUBLISHED' },
      select: { coverUrl: true },
    });
    if (!post?.coverUrl) throw notFound('Cover');
    return this.files.absolute(post.coverUrl);
  }

  // ───────────── Internals ─────────────

  /** v1 serves one school, chosen by SCHOOL_SLUG. */
  private async publicSchool() {
    const school = await this.prisma.school.findUnique({
      where: { slug: this.config.get('SCHOOL_SLUG') },
      include: { settings: true },
    });
    if (!school) throw notFound('School');
    return school;
  }

  private excerpt(doc: TiptapNode) {
    const text = tiptapToText(doc).replace(/\s+/g, ' ').trim();
    return text.length > 200 ? `${text.slice(0, 197)}…` : text || null;
  }

  private async assertClass(schoolId: string, classId?: string | null) {
    if (!classId) return;
    const klass = await this.prisma.forSchool(schoolId).class.findUnique({ where: { id: classId }, select: { id: true } });
    if (!klass) throw new ApiError(HttpStatus.UNPROCESSABLE_ENTITY, 'CLASS_NOT_FOUND');
  }
}
