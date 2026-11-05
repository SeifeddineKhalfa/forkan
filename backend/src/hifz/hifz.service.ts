import { HttpStatus, Injectable } from '@nestjs/common';
import { AuditService } from '../audit/audit.service.js';
import { visibleTo } from '../classes/classes.service.js';
import { ApiError, notFound } from '../common/api-error.js';
import { todayInSchool } from '../common/dates.js';
import type { AuthUser } from '../common/decorators.js';
import type { Prisma, Riwaya } from '../generated/prisma/client.js';
import { escapeHtml as e, PdfService } from '../pdf/pdf.service.js';
import { PrismaService, type SchoolTx as Tx } from '../prisma/prisma.service.js';
import { type Interval, mergeIntervals, QuranRangeError } from '../quran/quran-index.js';
import { QuranService } from '../quran/quran.service.js';
import type { HifzSessionDto } from './hifz.schemas.js';

const DAY = 86_400_000;
/** Entries that add to what the student knows by heart (revisions do not). */
const COVERING = ['NEW', 'INITIAL_LEVEL'] as const;

const thumnLabel = (n: number | null) => (n ? { hizb: Math.ceil(n / 8), thumn: ((n - 1) % 8) + 1 } : null);

/** Memorization records (spec A5): sessions of entries, a stored summary, and the views built on it. */
@Injectable()
export class HifzService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly quran: QuranService,
    private readonly audit: AuditService,
    private readonly pdf: PdfService,
  ) {}

  // ───────────── Writing ─────────────

  async record(actor: AuthUser, dto: HifzSessionDto) {
    if (dto.date > todayInSchool()) throw new ApiError(HttpStatus.UNPROCESSABLE_ENTITY, 'FUTURE_DATE');
    const student = await this.assertStudent(actor, dto.studentId);
    const riwaya = await this.riwayaOf(actor.schoolId, student.id);
    const index = await this.quran.index(riwaya);
    const entries = dto.entries.map((entry) => {
      try {
        return { ...entry, ...index.normalize(entry.range) };
      } catch (err) {
        if (err instanceof QuranRangeError) throw new ApiError(HttpStatus.UNPROCESSABLE_ENTITY, err.code);
        throw err;
      }
    });
    const teacherId = await this.teacherFor(actor, student.id, dto.teacherId);

    const session = await this.prisma.forSchool(actor.schoolId).$transaction(async (tx) => {
      const created = await tx.hifzSession.create({
        data: {
          schoolId: actor.schoolId,
          studentId: student.id,
          teacherId,
          recordedById: actor.id,
          classSessionId: dto.classSessionId,
          date: dto.date,
          notes: dto.notes,
          entries: {
            create: entries.map((x) => ({
              type: x.type,
              riwaya,
              fromSurah: x.fromSurah,
              fromAyah: x.fromAyah,
              toSurah: x.toSurah,
              toAyah: x.toAyah,
              fromIndex: x.fromIndex,
              toIndex: x.toIndex,
              fromThumn: x.fromThumn,
              toThumn: x.toThumn,
              rating: x.rating,
              note: x.note,
            })),
          },
        },
        include: { entries: true },
      });
      await this.recompute(tx, student.id, riwaya);
      return created;
    });
    return session;
  }

  /** The recorder or the office can remove a mistaken session; the summary follows. */
  async remove(actor: AuthUser, id: string) {
    const db = this.prisma.forSchool(actor.schoolId);
    const session = await db.hifzSession.findUnique({ where: { id }, include: { entries: true } });
    if (!session) throw notFound('HifzSession');
    if (actor.role === 'TEACHER' && session.recordedById !== actor.id) throw new ApiError(HttpStatus.FORBIDDEN, 'FORBIDDEN');
    const riwaya = await this.riwayaOf(actor.schoolId, session.studentId);
    await db.$transaction(async (tx) => {
      await tx.hifzSession.delete({ where: { id } });
      await this.recompute(tx, session.studentId, riwaya);
    });
    await this.audit.log(actor, 'HIFZ_SESSION_DELETE', 'HifzSession', id, session, undefined);
  }

  // ───────────── Reading ─────────────

  /** Profile view: summary, 480-thumn grid and the latest sessions. */
  async student(actor: AuthUser, studentId: string, limit = 50) {
    const student = await this.assertStudent(actor, studentId);
    const riwaya = await this.riwayaOf(actor.schoolId, studentId);
    const [summary, sessions, dataset] = await Promise.all([
      this.prisma.studentHifzSummary.findUnique({ where: { studentId } }),
      this.prisma.forSchool(actor.schoolId).hifzSession.findMany({
        where: { studentId },
        orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
        take: limit,
        include: {
          entries: { orderBy: { id: 'asc' } },
          teacher: { select: { id: true, title: true, firstName: true, lastName: true } },
          recordedBy: { select: { id: true, firstName: true, lastName: true } },
        },
      }),
      this.prisma.quranDataset.findUnique({ where: { riwaya } }),
    ]);
    let athman = '';
    if (summary && summary.riwaya === riwaya) {
      const index = await this.quran.index(riwaya);
      athman = index.coverageStats(summary.coverage as Interval[]).athman.join('');
    }
    return {
      student,
      riwaya,
      verified: dataset?.verified ?? false,
      summary: summary && summary.riwaya === riwaya ? { ...summary, position: thumnLabel(summary.currentThumn) } : null,
      athman,
      sessions,
    };
  }

  /** Imla' overview: progress and days since the last sabaq per student. */
  async classOverview(actor: AuthUser, classId: string) {
    const klass = await this.assertClass(actor, classId);
    const today = todayInSchool();
    const enrollments = await this.prisma.forSchool(actor.schoolId).enrollment.findMany({
      where: { classId, status: 'ACTIVE' },
      orderBy: [{ student: { lastName: 'asc' } }, { student: { firstName: 'asc' } }],
      select: {
        student: {
          select: {
            id: true,
            code: true,
            firstName: true,
            lastName: true,
            hifzSummary: {
              select: {
                riwaya: true,
                memorizedAyahs: true,
                memorizedAthman: true,
                completedAhzab: true,
                currentThumn: true,
                lastNewAt: true,
                lastRevisionAt: true,
              },
            },
          },
        },
      },
    });
    return {
      class: klass,
      students: enrollments.map(({ student: { hifzSummary: s, ...student } }) => ({
        ...student,
        summary: s && {
          ...s,
          position: thumnLabel(s.currentThumn),
          daysSinceNew: s.lastNewAt ? Math.round((today.getTime() - s.lastNewAt.getTime()) / DAY) : null,
        },
      })),
    };
  }

  /** Printable class report (A4) through Gotenberg. */
  async classReport(actor: AuthUser, classId: string) {
    const { class: klass, students } = await this.classOverview(actor, classId);
    const school = await this.prisma.school.findUniqueOrThrow({ where: { id: actor.schoolId }, select: { name: true } });
    const today = todayInSchool();
    const date = new Intl.DateTimeFormat('ar-TN', { day: 'numeric', month: 'long', year: 'numeric', numberingSystem: 'latn', timeZone: 'UTC' }).format(today);
    const rows = students
      .map((s, i) => {
        const m = s.summary;
        const pos = m?.position ? `الحزب ${m.position.hizb} – الثمن ${m.position.thumn}` : '—';
        return `<tr><td>${i + 1}</td><td>${e(`${s.firstName} ${s.lastName}`)}</td><td class="n">${m?.completedAhzab ?? 0}</td><td class="n">${m?.memorizedAthman ?? 0}</td><td>${pos}</td><td class="n">${m?.daysSinceNew ?? '—'}</td></tr>`;
      })
      .join('');
    const html = `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><style>
${this.pdf.fontCss}
@page { size: A4; }
body { margin: 0; font-size: 11pt; }
h1 { font-size: 15pt; margin: 0; } p { margin: 2px 0 10px; color: #444; }
table { width: 100%; border-collapse: collapse; } th, td { border: 1px solid #bbb; padding: 4px 6px; text-align: start; }
th { background: #eee; } td.n { text-align: center; }
</style></head><body>
<p>${e(school.name)}</p>
<h1>تقرير الحفظ — ${e(klass.name)}</h1>
<p>${date}</p>
<table><thead><tr><th>#</th><th>الطالب(ة)</th><th>الأحزاب المكتملة</th><th>الأثمان المحفوظة</th><th>الموضع الحالي</th><th>أيام منذ آخر حفظ</th></tr></thead>
<tbody>${rows}</tbody></table>
</body></html>`;
    return { buffer: await this.pdf.render(html, { width: 8.27, height: 11.69 }), name: klass.name };
  }

  // ───────────── Internals ─────────────

  /**
   * Coverage = merged NEW + INITIAL_LEVEL ranges in the student's riwaya; the rest of the
   * summary is derived from it. Lists read this row, never the entries.
   */
  private async recompute(tx: Tx, studentId: string, riwaya: Riwaya) {
    const index = await this.quran.index(riwaya);
    const entries = await tx.hifzEntry.findMany({
      where: { riwaya, session: { studentId } },
      select: { type: true, fromIndex: true, toIndex: true, toThumn: true, session: { select: { date: true, createdAt: true } } },
      orderBy: [{ session: { date: 'asc' } }, { session: { createdAt: 'asc' } }, { id: 'asc' }],
    });
    const covering = entries.filter((x) => (COVERING as readonly string[]).includes(x.type));
    const coverage = mergeIntervals(covering.map((x): Interval => [x.fromIndex, x.toIndex]));
    const stats = index.coverageStats(coverage);
    const news = entries.filter((x) => x.type === 'NEW');
    const revisions = entries.filter((x) => x.type === 'RECENT_REVISION' || x.type === 'OLD_REVISION');
    const data = {
      riwaya,
      memorizedAyahs: stats.memorizedAyahs,
      memorizedAthman: stats.memorizedAthman,
      completedAhzab: stats.completedAhzab,
      coverage: coverage as Prisma.InputJsonValue,
      currentThumn: (news.at(-1) ?? covering.at(-1))?.toThumn ?? null,
      lastNewAt: news.at(-1)?.session.date ?? null,
      lastRevisionAt: revisions.at(-1)?.session.date ?? null,
    };
    await tx.studentHifzSummary.upsert({ where: { studentId }, create: { studentId, ...data }, update: data });
  }

  /** Student → class riwaya → school default (spec A5). */
  private async riwayaOf(schoolId: string, studentId: string): Promise<Riwaya> {
    const student = await this.prisma.forSchool(schoolId).student.findUnique({
      where: { id: studentId },
      select: {
        riwaya: true,
        enrollments: { where: { status: 'ACTIVE', class: { riwaya: { not: null } } }, select: { class: { select: { riwaya: true } } }, take: 1 },
      },
    });
    if (student?.riwaya) return student.riwaya;
    if (student?.enrollments[0]?.class.riwaya) return student.enrollments[0].class.riwaya;
    const settings = await this.prisma.schoolSettings.findUnique({ where: { schoolId } });
    return settings?.defaultRiwaya ?? 'QALUN';
  }

  /** Office: any student. Teacher: students of their own imla'at (403 otherwise). */
  private async assertStudent(actor: AuthUser, studentId: string) {
    const db = this.prisma.forSchool(actor.schoolId);
    const student = await db.student.findUnique({
      where: { id: studentId },
      select: { id: true, code: true, firstName: true, lastName: true, declaredHifz: true },
    });
    if (!student) throw notFound('Student');
    if (actor.role === 'TEACHER') {
      const mine = await db.enrollment.count({ where: { studentId, status: 'ACTIVE', class: visibleTo(actor) } });
      if (!mine) throw new ApiError(HttpStatus.FORBIDDEN, 'NOT_YOUR_STUDENT');
    }
    return student;
  }

  private async assertClass(actor: AuthUser, classId: string) {
    const db = this.prisma.forSchool(actor.schoolId);
    const klass = await db.class.findFirst({ where: { AND: [{ id: classId }, visibleTo(actor)] }, select: { id: true, name: true } });
    if (klass) return klass;
    if (await db.class.findUnique({ where: { id: classId }, select: { id: true } })) throw new ApiError(HttpStatus.FORBIDDEN, 'NOT_YOUR_CLASS');
    throw notFound('Class');
  }

  /** Who listened: chosen by the office, else the teacher typing, else the student's main teacher. */
  private async teacherFor(actor: AuthUser, studentId: string, chosen?: string) {
    const db = this.prisma.forSchool(actor.schoolId);
    if (chosen && actor.role !== 'TEACHER') {
      if (!(await db.teacher.findUnique({ where: { id: chosen }, select: { id: true } }))) throw notFound('Teacher');
      return chosen;
    }
    const own = await db.teacher.findFirst({ where: { userId: actor.id }, select: { id: true } });
    if (own) return own.id;
    const main = await this.prisma.classTeacher.findFirst({
      where: { role: 'MAIN', class: { schoolId: actor.schoolId, enrollments: { some: { studentId, status: 'ACTIVE' } } } },
      select: { teacherId: true },
    });
    if (!main) throw new ApiError(HttpStatus.UNPROCESSABLE_ENTITY, 'TEACHER_REQUIRED');
    return main.teacherId;
  }
}
