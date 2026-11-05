import { HttpStatus, Injectable } from '@nestjs/common';
import { AuditService } from '../audit/audit.service.js';
import { ApiError, notFound } from '../common/api-error.js';
import { nextCounter } from '../common/counters.js';
import { todayInSchool } from '../common/dates.js';
import type { AuthUser } from '../common/decorators.js';
import { FilesService } from '../files/files.service.js';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { cellText } from './cells.js';
import { type Mapping, STUDENT_FIELDS, suggestMapping, TEACHER_FIELDS } from './fields.js';
import { normalize, personKey } from './normalize.js';
import { type Decisions, type ImportPlan, type PlanContext, planImport } from './plan.js';
import { buildTemplate } from './template.js';
import { readWorkbook, type SheetData } from './workbook.js';

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const MAX_ROWS = 3000;

export interface RunOptions {
  studentMapping: Mapping;
  teacherMapping: Mapping;
  decisions: Decisions;
  skipErrors?: boolean;
}

const preview = (sheet: SheetData | null, fields: typeof STUDENT_FIELDS) =>
  sheet && {
    name: sheet.name,
    headers: sheet.headers,
    rowCount: sheet.rows.length,
    sample: sheet.rows.slice(0, 5).map((r) => r.cells.map((c) => cellText(c))),
    mapping: suggestMapping(fields, sheet.headers),
  };

/** Plans contain Dates; the report column stores JSON. */
const toJson = (v: unknown) => JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue;

@Injectable()
export class ImportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly files: FilesService,
    private readonly audit: AuditService,
  ) {}

  async template(actor: AuthUser) {
    const db = this.prisma.forSchool(actor.schoolId);
    const classes = await db.class.findMany({
      where: { isActive: true, academicYear: { isCurrent: true } },
      orderBy: { name: 'asc' },
      select: { name: true },
    });
    return buildTemplate(classes.map((c) => c.name));
  }

  async upload(actor: AuthUser, file: { originalname: string; buffer: Buffer } | undefined) {
    if (!file?.buffer?.length) throw new ApiError(HttpStatus.BAD_REQUEST, 'FILE_REQUIRED');
    // Multer decodes multipart file names as Latin-1; Arabic names arrive as UTF-8 bytes.
    const decoded = Buffer.from(file.originalname, 'latin1').toString('utf8');
    file = { ...file, originalname: decoded.includes('�') ? file.originalname : decoded };
    const isCsv = /\.csv$/i.test(file.originalname);
    const filePath = isCsv
      ? await this.files.storeRaw(actor.schoolId, 'imports', file.buffer, 'csv')
      : await this.files.store(actor.schoolId, 'imports', file.buffer, [XLSX_MIME]);

    let wb;
    try {
      wb = await readWorkbook(file.buffer, file.originalname);
    } catch {
      await this.files.remove(filePath);
      throw new ApiError(HttpStatus.UNPROCESSABLE_ENTITY, 'UNREADABLE_FILE');
    }
    if (!wb.students?.rows.length) {
      await this.files.remove(filePath);
      throw new ApiError(HttpStatus.UNPROCESSABLE_ENTITY, 'EMPTY_FILE');
    }
    if (wb.students.rows.length + (wb.teachers?.rows.length ?? 0) > MAX_ROWS) {
      await this.files.remove(filePath);
      throw new ApiError(HttpStatus.UNPROCESSABLE_ENTITY, 'TOO_MANY_ROWS', { max: MAX_ROWS });
    }

    const result = {
      students: preview(wb.students, STUDENT_FIELDS),
      teachers: preview(wb.teachers, TEACHER_FIELDS),
    };
    const job = await this.prisma.forSchool(actor.schoolId).importJob.create({
      data: {
        schoolId: actor.schoolId,
        fileName: file.originalname.slice(0, 200),
        filePath,
        status: 'UPLOADED',
        mapping: toJson({ studentMapping: result.students?.mapping, teacherMapping: result.teachers?.mapping ?? {} }),
        createdById: actor.id,
      },
    });
    return { jobId: job.id, fileName: job.fileName, ...result };
  }

  list(actor: AuthUser) {
    return this.prisma.forSchool(actor.schoolId).importJob.findMany({
      orderBy: { createdAt: 'desc' },
      take: 30,
      select: { id: true, fileName: true, status: true, createdAt: true, updatedAt: true, report: true, createdBy: { select: { firstName: true, lastName: true } } },
    });
  }

  async validate(actor: AuthUser, id: string, opts: RunOptions) {
    const job = await this.openJob(actor, id);
    const plan = await this.plan(actor, job.filePath!, job.fileName, opts);
    await this.prisma.forSchool(actor.schoolId).importJob.update({
      where: { id },
      data: { status: 'VALIDATED', mapping: toJson(opts), report: toJson({ dryRun: true, counts: plan.counts }) },
    });
    return plan;
  }

  async commit(actor: AuthUser, id: string, opts: RunOptions) {
    const job = await this.openJob(actor, id);
    const plan = await this.plan(actor, job.filePath!, job.fileName, opts);
    const errors = plan.counts.students.error + plan.counts.teachers.error;
    if (errors > 0 && !opts.skipErrors) {
      throw new ApiError(HttpStatus.UNPROCESSABLE_ENTITY, 'IMPORT_HAS_ERRORS', { errors });
    }
    const created = await this.apply(actor, plan);
    const report = { counts: plan.counts, created, skippedRows: plan.students.filter((s) => s.status === 'ERROR').map((s) => s.row) };
    await this.prisma.forSchool(actor.schoolId).importJob.update({
      where: { id },
      data: { status: 'COMMITTED', mapping: toJson(opts), report: toJson(report) },
    });
    await this.audit.log(actor, 'IMPORT_COMMIT', 'ImportJob', id, undefined, report);
    return { ...report, plan };
  }

  // ───────────── Internals ─────────────

  private async openJob(actor: AuthUser, id: string) {
    const job = await this.prisma.forSchool(actor.schoolId).importJob.findUnique({ where: { id } });
    if (!job || !job.filePath) throw notFound('ImportJob');
    if (job.status === 'COMMITTED') throw new ApiError(HttpStatus.CONFLICT, 'IMPORT_ALREADY_COMMITTED');
    return job;
  }

  private async plan(actor: AuthUser, filePath: string, fileName: string, opts: RunOptions): Promise<ImportPlan> {
    const wb = await readWorkbook(await this.files.read(filePath), fileName);
    const ctx = await this.context(actor.schoolId);
    return planImport(wb.students, opts.studentMapping, wb.teachers, opts.teacherMapping, ctx, opts.decisions);
  }

  private async context(schoolId: string): Promise<PlanContext> {
    const db = this.prisma.forSchool(schoolId);
    const [settings, classes, students, guardians, teachers] = await Promise.all([
      this.prisma.schoolSettings.findUnique({ where: { schoolId } }),
      db.class.findMany({
        where: { academicYear: { isCurrent: true } },
        include: { _count: { select: { enrollments: { where: { status: 'ACTIVE' } } } } },
      }),
      db.student.findMany({
        select: { code: true, firstName: true, lastName: true, dateOfBirth: true, guardians: { select: { guardian: { select: { phone: true } } } } },
      }),
      db.guardian.findMany({
        select: { id: true, fullName: true, phone: true, students: { select: { student: { select: { firstName: true, lastName: true } } } } },
      }),
      db.teacher.findMany({ select: { firstName: true, lastName: true } }),
    ]);

    const existingStudentKeys = new Map<string, string>();
    for (const s of students) {
      if (s.dateOfBirth) existingStudentKeys.set(personKey(s.firstName, s.lastName, s.dateOfBirth), s.code);
      for (const g of s.guardians) existingStudentKeys.set(`${normalize(s.firstName)}|${normalize(s.lastName)}|${g.guardian.phone}`, s.code);
    }
    const guardiansByPhone = new Map<string, { id: string; fullName: string; students: string[] }[]>();
    for (const g of guardians) {
      const list = guardiansByPhone.get(g.phone) ?? [];
      list.push({ id: g.id, fullName: g.fullName, students: g.students.map((x) => `${x.student.firstName} ${x.student.lastName}`) });
      guardiansByPhone.set(g.phone, list);
    }

    return {
      today: todayInSchool(),
      guardianRequiredUnderAge: settings?.guardianRequiredUnderAge ?? 18,
      classes: new Map(
        classes.map((c) => [
          normalize(c.name),
          { id: c.id, name: c.name, genderPolicy: c.genderPolicy, capacity: c.capacity, activeCount: c._count.enrollments, isActive: c.isActive },
        ]),
      ),
      existingCodes: new Set(students.map((s) => s.code)),
      existingStudentKeys,
      guardiansByPhone,
      existingTeacherKeys: new Set(teachers.map((t) => `${normalize(t.firstName)}|${normalize(t.lastName)}`)),
    };
  }

  /** Everything or nothing: one transaction for the whole file. */
  private apply(actor: AuthUser, plan: ImportPlan) {
    const schoolId = actor.schoolId;
    const db = this.prisma.forSchool(schoolId);
    return db.$transaction(
      async (tx) => {
        const created = { students: 0, teachers: 0, guardians: 0, enrollments: 0, charges: 0 };

        for (const t of plan.teachers) {
          if (t.status !== 'CREATE' || !t.data) continue;
          await tx.teacher.create({ data: { ...t.data, schoolId } });
          created.teachers++;
        }

        // Imported "YYYY-NNNN" codes push the counter forward so generated codes never collide.
        const maxPerYear = new Map<string, number>();
        for (const s of plan.students) {
          const m = s.status === 'CREATE' ? /^(\d{4})-(\d+)$/.exec(s.data?.code ?? '') : null;
          if (m) maxPerYear.set(m[1], Math.max(maxPerYear.get(m[1]) ?? 0, Number(m[2])));
        }
        for (const [year, n] of maxPerYear) {
          await tx.$executeRaw`
            INSERT INTO "counters" ("schoolId", "key", "value") VALUES (${schoolId}, ${`student:${year}`}, ${n})
            ON CONFLICT ("schoolId", "key") DO UPDATE SET "value" = GREATEST("counters"."value", ${n})`;
        }

        const newGuardianIds = new Map<string, string>();
        const today = todayInSchool();
        for (const s of plan.students) {
          if (s.status !== 'CREATE' || !s.data) continue;
          const joined = s.data.joinedAt ?? today;
          const code =
            s.data.code ??
            `${joined.getUTCFullYear()}-${String(await nextCounter(tx, schoolId, `student:${joined.getUTCFullYear()}`)).padStart(4, '0')}`;
          const student = await tx.student.create({ data: { ...s.data, code, joinedAt: joined, schoolId } });
          created.students++;

          for (const [i, g] of s.guardians.entries()) {
            let guardianId = g.guardianId ?? (g.newKey ? newGuardianIds.get(g.newKey) : undefined);
            if (!guardianId) {
              guardianId = (await tx.guardian.create({ data: { schoolId, fullName: g.fullName, phone: g.phone } })).id;
              if (g.newKey) newGuardianIds.set(g.newKey, guardianId);
              created.guardians++;
            }
            await tx.studentGuardian.create({
              data: { studentId: student.id, guardianId, relation: g.relation, isPrimary: i === 0, isPayer: i === 0 },
            });
          }
          if (s.classId) {
            await tx.enrollment.create({ data: { schoolId, studentId: student.id, classId: s.classId, startDate: joined } });
            created.enrollments++;
          }
          if (s.openingBalance) {
            await tx.charge.create({
              data: { schoolId, studentId: student.id, kind: 'ONE_OFF', label: 'رصيد سابق', amount: s.openingBalance, dueDate: today },
            });
            created.charges++;
          }
        }
        return created;
      },
      { timeout: 120_000, maxWait: 10_000 },
    );
  }
}
