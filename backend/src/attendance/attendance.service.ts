import { HttpStatus, Injectable } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { AuditService } from '../audit/audit.service.js';
import { visibleTo } from '../classes/classes.service.js';
import { ApiError, notFound } from '../common/api-error.js';
import { todayInSchool } from '../common/dates.js';
import type { AuthUser } from '../common/decorators.js';
import { addDays } from '../fees/billing.js';
import type { AttendanceStatus, Prisma } from '../generated/prisma/client.js';
import { SiteRevalidator } from '../news/site-revalidator.js';
import { escapeHtml } from '../pdf/pdf.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { CancelSessionDto, MarkDto, OpenSessionDto, PublishDto, RangeQuery } from './attendance.schemas.js';
import { announcementText, attendanceRate, type Counts, emptyCounts, weekdayOf } from './attendance.rules.js';

const isOffice = (actor: AuthUser) => actor.role !== 'TEACHER';

const teacherSelect = { id: true, title: true, firstName: true, lastName: true, gender: true } as const;

/** Enrolled on that day (ended enrollments still count for the days before they ended). */
const enrolledOn = (date: Date): Prisma.EnrollmentWhereInput => ({
  startDate: { lte: date },
  OR: [{ endDate: null }, { endDate: { gte: date } }],
});

/** Attendance per session (spec A5): teachers mark their own imla'at, staff can mark any. */
@Injectable()
export class AttendanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly site: SiteRevalidator,
  ) {}

  // ───────────── Day view ─────────────

  /** Every planned slot of the day for the actor's imla'at, with its session if opened, plus ad-hoc sessions. */
  async day(actor: AuthUser, date = todayInSchool()) {
    const db = this.prisma.forSchool(actor.schoolId);
    const weekday = weekdayOf(date);
    const classes = await db.class.findMany({
      where: { AND: [visibleTo(actor), { isActive: true, academicYear: { isCurrent: true } }] },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        scheduleSlots: { where: { day: weekday } },
        room: { select: { name: true, venue: { select: { name: true } } } },
        teachers: { where: { role: 'MAIN' }, select: { teacher: { select: teacherSelect } } },
        _count: { select: { enrollments: { where: { status: 'ACTIVE' } } } },
      },
    });
    const sessions = await db.classSession.findMany({
      where: { date, classId: { in: classes.map((c) => c.id) } },
      include: { teacher: { select: teacherSelect } },
    });
    const counts = await this.countsBySession(sessions.map((s) => s.id));

    const items = classes.flatMap((c) => {
      const base = {
        class: { id: c.id, name: c.name, students: c._count.enrollments, room: c.room, teacher: c.teachers[0]?.teacher ?? null },
      };
      const planned = c.scheduleSlots.map((slot) => {
        const session = sessions.find((s) => s.classId === c.id && s.startTime === slot.startTime);
        return { ...base, slot, startTime: slot.startTime, session: session ? { ...session, counts: counts.get(session.id) } : null };
      });
      const adHoc = sessions
        .filter((s) => s.classId === c.id && !c.scheduleSlots.some((slot) => slot.startTime === s.startTime))
        .map((s) => ({ ...base, slot: null, startTime: s.startTime, session: { ...s, counts: counts.get(s.id) } }));
      return [...planned, ...adHoc];
    });
    return {
      date,
      weekday,
      items: items.sort((a, b) => a.startTime.localeCompare(b.startTime)),
      classes: classes.map((c) => ({ id: c.id, name: c.name })),
    };
  }

  // ───────────── Sessions ─────────────

  /** Opening a class creates today's session on demand (idempotent). */
  async open(actor: AuthUser, dto: OpenSessionDto) {
    if (dto.date > todayInSchool()) throw new ApiError(HttpStatus.UNPROCESSABLE_ENTITY, 'FUTURE_SESSION');
    const session = await this.upsertSession(actor, dto, {});
    return this.get(actor, session.id);
  }

  async get(actor: AuthUser, id: string) {
    const db = this.prisma.forSchool(actor.schoolId);
    const session = await db.classSession.findUnique({
      where: { id },
      include: {
        class: { select: { id: true, name: true } },
        teacher: { select: teacherSelect },
        attendance: { select: { studentId: true, status: true, note: true, markedAt: true } },
      },
    });
    if (!session) throw notFound('ClassSession');
    await this.assertClass(actor, session.classId);

    const office = isOffice(actor);
    const enrollments = await db.enrollment.findMany({
      where: { classId: session.classId, ...enrolledOn(session.date) },
      orderBy: [{ student: { lastName: 'asc' } }, { student: { firstName: 'asc' } }],
      select: {
        student: {
          select: {
            id: true,
            code: true,
            firstName: true,
            lastName: true,
            gender: true,
            // Phones are for the office's absence messages only.
            ...(office && {
              phone: true,
              guardians: { where: { isPrimary: true }, select: { guardian: { select: { id: true, fullName: true, phone: true } } } },
            }),
          },
        },
      },
    });
    const students = new Map(enrollments.map((e) => [e.student.id, e.student]));
    return {
      ...session,
      roster: [...students.values()].map((s) => ({
        ...s,
        attendance: session.attendance.find((a) => a.studentId === s.id) ?? null,
      })),
    };
  }

  /** Saves the whole sheet at once (unlisted students keep their previous mark). */
  async mark(actor: AuthUser, id: string, dto: MarkDto) {
    const db = this.prisma.forSchool(actor.schoolId);
    const session = await this.get(actor, id);
    if (session.status === 'CANCELLED') throw new ApiError(HttpStatus.UNPROCESSABLE_ENTITY, 'SESSION_CANCELLED');
    if (session.date > todayInSchool()) throw new ApiError(HttpStatus.UNPROCESSABLE_ENTITY, 'FUTURE_SESSION');
    const roster = new Set(session.roster.map((s) => s.id));
    if (dto.entries.some((e) => !roster.has(e.studentId))) {
      throw new ApiError(HttpStatus.UNPROCESSABLE_ENTITY, 'STUDENT_NOT_IN_CLASS');
    }

    await db.$transaction(async (tx) => {
      for (const e of dto.entries) {
        await tx.attendance.upsert({
          where: { sessionId_studentId: { sessionId: id, studentId: e.studentId } },
          create: { sessionId: id, studentId: e.studentId, status: e.status, note: e.note, markedById: actor.id },
          update: { status: e.status, note: e.note ?? null, markedById: actor.id, markedAt: new Date() },
        });
      }
      await tx.classSession.update({
        where: { id },
        data: { notes: dto.notes, teacherId: session.teacherId ?? (await this.teacherFor(actor, session.classId)) },
      });
    });
    return this.get(actor, id);
  }

  /**
   * Cancels a session (opened or only planned) with a reason. It leaves the attendance
   * statistics, and the reply carries the announcement to share with the imla'.
   */
  async cancel(actor: AuthUser, dto: CancelSessionDto) {
    const session = await this.upsertSession(actor, dto, { status: 'CANCELLED', cancelReason: dto.reason });
    const full = await this.get(actor, session.id);
    await this.audit.log(actor, 'SESSION_CANCEL', 'ClassSession', session.id, undefined, { reason: dto.reason });
    const teacher = full.teacher ?? (await this.mainTeacher(actor.schoolId, dto.classId));
    return {
      session: full,
      announcement: announcementText({
        teacher,
        className: full.class.name,
        date: full.date,
        resumeDate: dto.resumeDate,
        reason: dto.reason,
      }),
    };
  }

  async reopen(actor: AuthUser, id: string) {
    await this.get(actor, id);
    await this.prisma.forSchool(actor.schoolId).classSession.update({
      where: { id },
      data: { status: 'HELD', cancelReason: null },
    });
    return this.get(actor, id);
  }

  /** The announcement as a published news post linked to the imla' (shown by the public site, Slice 7). */
  async publish(actor: AuthUser, id: string, dto: PublishDto) {
    const session = await this.get(actor, id);
    const paragraphs = dto.text.split(/\n+/).filter(Boolean);
    const post = await this.prisma.forSchool(actor.schoolId).newsPost.create({
      data: {
        schoolId: actor.schoolId,
        title: dto.title,
        slug: `${session.date.toISOString().slice(0, 10)}-${randomBytes(3).toString('hex')}`,
        excerpt: paragraphs[0].slice(0, 200),
        bodyJson: { type: 'doc', content: paragraphs.map((p) => ({ type: 'paragraph', content: [{ type: 'text', text: p }] })) },
        bodyHtml: paragraphs.map((p) => `<p>${escapeHtml(p)}</p>`).join(''),
        category: 'ANNOUNCEMENT',
        classId: session.classId,
        status: 'PUBLISHED',
        publishedAt: new Date(),
        authorId: actor.id,
      },
      select: { id: true, slug: true, title: true },
    });
    await this.audit.log(actor, 'NEWS_PUBLISH', 'NewsPost', post.id, undefined, { sessionId: id });
    await this.site.refresh();
    return post;
  }

  // ───────────── History & stats ─────────────

  /** Students × sessions grid for one imla' (default: last 30 days). */
  async classHistory(actor: AuthUser, classId: string, q: RangeQuery) {
    await this.assertClass(actor, classId);
    const db = this.prisma.forSchool(actor.schoolId);
    const { from, to } = this.range(q);
    const sessions = await db.classSession.findMany({
      where: { classId, date: { gte: from, lte: to } },
      orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
      select: {
        id: true,
        date: true,
        startTime: true,
        status: true,
        cancelReason: true,
        attendance: { select: { studentId: true, status: true } },
      },
    });
    const enrollments = await db.enrollment.findMany({
      where: { classId, startDate: { lte: to }, OR: [{ endDate: null }, { endDate: { gte: from } }] },
      orderBy: [{ student: { lastName: 'asc' } }, { student: { firstName: 'asc' } }],
      select: { student: { select: { id: true, code: true, firstName: true, lastName: true } } },
    });
    const held = sessions.filter((s) => s.status === 'HELD');
    const total = emptyCounts();
    const students = [...new Map(enrollments.map((e) => [e.student.id, e.student])).values()].map((s) => {
      const counts = emptyCounts();
      for (const session of held) {
        const a = session.attendance.find((x) => x.studentId === s.id);
        if (a) {
          counts[a.status]++;
          total[a.status]++;
        }
      }
      return { ...s, counts, rate: attendanceRate(counts) };
    });
    return {
      from,
      to,
      sessions: sessions.map((s) => ({
        ...s,
        attendance: Object.fromEntries(s.attendance.map((a) => [a.studentId, a.status])) as Record<string, AttendanceStatus>,
      })),
      students,
      counts: total,
      rate: attendanceRate(total),
    };
  }

  /** A student's marks across imla'at (office only). */
  async studentHistory(actor: AuthUser, studentId: string, q: RangeQuery) {
    const db = this.prisma.forSchool(actor.schoolId);
    if (!(await db.student.findUnique({ where: { id: studentId } }))) throw notFound('Student');
    const { from, to } = this.range(q, 90);
    const records = await this.prisma.attendance.findMany({
      where: { studentId, session: { schoolId: actor.schoolId, status: 'HELD', date: { gte: from, lte: to } } },
      orderBy: { session: { date: 'desc' } },
      select: {
        status: true,
        note: true,
        session: { select: { id: true, date: true, startTime: true, class: { select: { id: true, name: true } } } },
      },
    });
    const counts = emptyCounts();
    for (const r of records) counts[r.status]++;
    return { from, to, records, counts, rate: attendanceRate(counts) };
  }

  /** Dashboard: rate per imla' over a period and the students who miss most. */
  async summary(actor: AuthUser, q: RangeQuery) {
    const db = this.prisma.forSchool(actor.schoolId);
    const { from, to } = this.range(q);
    const classes = await db.class.findMany({
      where: { AND: [visibleTo(actor), { isActive: true, academicYear: { isCurrent: true } }] },
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    });
    const rows = await this.prisma.attendance.findMany({
      where: {
        session: { schoolId: actor.schoolId, classId: { in: classes.map((c) => c.id) }, status: 'HELD', date: { gte: from, lte: to } },
      },
      select: {
        status: true,
        session: { select: { classId: true } },
        student: { select: { id: true, firstName: true, lastName: true } },
      },
    });
    const byClass = new Map<string, Counts>(classes.map((c) => [c.id, emptyCounts()]));
    const byStudent = new Map<string, { student: (typeof rows)[number]['student']; counts: Counts }>();
    const total = emptyCounts();
    for (const r of rows) {
      byClass.get(r.session.classId)![r.status]++;
      total[r.status]++;
      const s = byStudent.get(r.student.id) ?? { student: r.student, counts: emptyCounts() };
      s.counts[r.status]++;
      byStudent.set(r.student.id, s);
    }
    // A session opened but never marked is not counted as held.
    const sessions = await db.classSession.groupBy({
      by: ['classId', 'status'],
      where: {
        classId: { in: classes.map((c) => c.id) },
        date: { gte: from, lte: to },
        OR: [{ status: 'CANCELLED' }, { attendance: { some: {} } }],
      },
      _count: true,
    });
    return {
      from,
      to,
      rate: attendanceRate(total),
      counts: total,
      classes: classes.map((c) => ({
        ...c,
        counts: byClass.get(c.id)!,
        rate: attendanceRate(byClass.get(c.id)!),
        held: sessions.find((s) => s.classId === c.id && s.status === 'HELD')?._count ?? 0,
        cancelled: sessions.find((s) => s.classId === c.id && s.status === 'CANCELLED')?._count ?? 0,
      })),
      // At least 3 counted sessions, below 75 %, worst first.
      lowStudents: [...byStudent.values()]
        .map((s) => ({ ...s.student, counts: s.counts, rate: attendanceRate(s.counts) }))
        .filter((s) => s.rate !== null && s.counts.PRESENT + s.counts.LATE + s.counts.ABSENT >= 3 && s.rate < 0.75)
        .sort((a, b) => a.rate! - b.rate!)
        .slice(0, 10),
    };
  }

  // ───────────── Internals ─────────────

  /** 404 for another school's class, 403 for a colleague's class (spec B, Slice 5). */
  private async assertClass(actor: AuthUser, classId: string) {
    const db = this.prisma.forSchool(actor.schoolId);
    const klass = await db.class.findFirst({ where: { AND: [{ id: classId }, visibleTo(actor)] }, select: { id: true } });
    if (klass) return;
    if (await db.class.findUnique({ where: { id: classId }, select: { id: true } })) {
      throw new ApiError(HttpStatus.FORBIDDEN, 'NOT_YOUR_CLASS');
    }
    throw notFound('Class');
  }

  private async upsertSession(
    actor: AuthUser,
    dto: OpenSessionDto,
    data: { status?: 'HELD' | 'CANCELLED'; cancelReason?: string },
  ) {
    await this.assertClass(actor, dto.classId);
    return this.prisma.forSchool(actor.schoolId).classSession.upsert({
      where: { classId_date_startTime: { classId: dto.classId, date: dto.date, startTime: dto.startTime } },
      create: {
        schoolId: actor.schoolId,
        classId: dto.classId,
        date: dto.date,
        startTime: dto.startTime,
        endTime: dto.endTime,
        teacherId: await this.teacherFor(actor, dto.classId),
        ...data,
      },
      update: data,
    });
  }

  /** Who taught: the teacher marking it, else the imla's main teacher. */
  private async teacherFor(actor: AuthUser, classId: string) {
    const own = await this.prisma.forSchool(actor.schoolId).teacher.findFirst({ where: { userId: actor.id }, select: { id: true } });
    return own?.id ?? (await this.mainTeacher(actor.schoolId, classId))?.id ?? null;
  }

  private async mainTeacher(schoolId: string, classId: string) {
    const link = await this.prisma.classTeacher.findFirst({
      where: { classId, role: 'MAIN', class: { schoolId } },
      select: { teacher: { select: teacherSelect } },
    });
    return link?.teacher ?? null;
  }

  private async countsBySession(ids: string[]) {
    const rows = await this.prisma.attendance.groupBy({ by: ['sessionId', 'status'], where: { sessionId: { in: ids } }, _count: true });
    const map = new Map<string, Counts>();
    for (const r of rows) {
      const c = map.get(r.sessionId) ?? emptyCounts();
      c[r.status] = r._count;
      map.set(r.sessionId, c);
    }
    return map;
  }

  private range(q: RangeQuery, days = 30) {
    const to = q.to ?? todayInSchool();
    return { from: q.from ?? addDays(to, -days + 1), to };
  }
}

