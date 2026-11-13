import { HttpStatus, Injectable } from '@nestjs/common';
import { AuditService } from '../audit/audit.service.js';
import { ApiError, notFound } from '../common/api-error.js';
import { nextCounter } from '../common/counters.js';
import { ageOn, todayInSchool } from '../common/dates.js';
import type { AuthUser } from '../common/decorators.js';
import { normalizePhone } from '../common/schemas.js';
import { FilesService, IMAGE_TYPES } from '../files/files.service.js';
import type { Prisma, Student } from '../generated/prisma/client.js';
import { PrismaService, type SchoolDb, type SchoolTx as Tx } from '../prisma/prisma.service.js';
import { checkCapacity, checkGenderPolicy } from './enrollment.rules.js';
import type {
  CreateStudentDto,
  EnrollDto,
  GuardianDto,
  GuardianLinkDto,
  GuardianSearchQuery,
  StudentListQuery,
  UpdateGuardianDto,
  UpdateStudentDto,
} from './people.schemas.js';

const studentDetail = {
  guardians: { include: { guardian: true }, orderBy: { isPrimary: 'desc' } },
  enrollments: {
    orderBy: [{ status: 'asc' }, { startDate: 'desc' }],
    include: {
      class: {
        select: { id: true, name: true, monthlyFee: true, isActive: true, academicYear: { select: { name: true } } },
      },
    },
  },
  teacherProfile: { select: { id: true, title: true } },
} satisfies Prisma.StudentInclude;

@Injectable()
export class PeopleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly files: FilesService,
  ) {}

  // ───────────── Photos (only with consent, spec A5) ─────────────

  async setPhoto(actor: AuthUser, id: string, buffer: Buffer | undefined) {
    const db = this.prisma.forSchool(actor.schoolId);
    const student = await db.student.findUnique({ where: { id } });
    if (!student) throw notFound('Student');
    if (!student.photoConsent) throw new ApiError(HttpStatus.UNPROCESSABLE_ENTITY, 'PHOTO_CONSENT_REQUIRED');
    const photoUrl = await this.files.store(actor.schoolId, 'students', buffer, IMAGE_TYPES);
    await db.student.update({ where: { id }, data: { photoUrl } });
    await this.files.remove(student.photoUrl);
    await this.audit.log(actor, 'STUDENT_PHOTO_SET', 'Student', id);
    return this.getStudent(actor, id);
  }

  async removePhoto(actor: AuthUser, id: string) {
    const db = this.prisma.forSchool(actor.schoolId);
    const student = await db.student.findUnique({ where: { id } });
    if (!student) throw notFound('Student');
    await db.student.update({ where: { id }, data: { photoUrl: null } });
    await this.files.remove(student.photoUrl);
    await this.audit.log(actor, 'STUDENT_PHOTO_REMOVE', 'Student', id);
    return this.getStudent(actor, id);
  }

  async photoPath(actor: AuthUser, id: string) {
    const student = await this.prisma.forSchool(actor.schoolId).student.findUnique({ where: { id } });
    if (!student?.photoUrl) throw notFound('Photo');
    return this.files.absolute(student.photoUrl);
  }

  // ───────────── Guardians ─────────────

  /** Phone lookup powers the "this number is already registered for…" warning. */
  searchGuardians(actor: AuthUser, query: GuardianSearchQuery) {
    const phone = query.phone ? normalizePhone(query.phone) : null;
    if (!phone && !query.q) return [];
    return this.prisma.forSchool(actor.schoolId).guardian.findMany({
      where: {
        OR: [
          ...(phone ? [{ phone }, { phone2: phone }] : []),
          ...(query.q ? [{ fullName: { contains: query.q, mode: 'insensitive' as const } }] : []),
        ],
      },
      take: 20,
      orderBy: { fullName: 'asc' },
      include: {
        students: {
          include: { student: { select: { id: true, code: true, firstName: true, lastName: true, status: true } } },
        },
      },
    });
  }

  async createGuardian(actor: AuthUser, dto: GuardianDto) {
    const guardian = await this.prisma.forSchool(actor.schoolId).guardian.create({
      data: { ...dto, schoolId: actor.schoolId },
    });
    await this.audit.log(actor, 'GUARDIAN_CREATE', 'Guardian', guardian.id, undefined, guardian);
    return guardian;
  }

  async updateGuardian(actor: AuthUser, id: string, dto: UpdateGuardianDto) {
    const db = this.prisma.forSchool(actor.schoolId);
    const before = await db.guardian.findUnique({ where: { id } });
    if (!before) throw notFound('Guardian');
    const guardian = await db.guardian.update({ where: { id }, data: dto });
    await this.audit.log(actor, 'GUARDIAN_UPDATE', 'Guardian', id, before, guardian);
    return guardian;
  }

  // ───────────── Students ─────────────

  async listStudents(actor: AuthUser, query: StudentListQuery) {
    const db = this.prisma.forSchool(actor.schoolId);
    const phone = query.q ? normalizePhone(query.q) : null;
    const where: Prisma.StudentWhereInput = {
      ...(query.status !== 'ALL' && { status: query.status }),
      ...(query.gender && { gender: query.gender }),
      ...(query.classId && { enrollments: { some: { classId: query.classId, status: 'ACTIVE' } } }),
      ...(query.q && {
        OR: [
          { firstName: { contains: query.q, mode: 'insensitive' } },
          { lastName: { contains: query.q, mode: 'insensitive' } },
          { firstNameLatin: { contains: query.q, mode: 'insensitive' } },
          { lastNameLatin: { contains: query.q, mode: 'insensitive' } },
          { code: { contains: query.q } },
          ...(phone ? [{ phone }, { guardians: { some: { guardian: { OR: [{ phone }, { phone2: phone }] } } } }] : []),
        ],
      }),
    };
    const [items, total] = await Promise.all([
      db.student.findMany({
        where,
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: {
          guardians: { where: { isPrimary: true }, include: { guardian: { select: { fullName: true, phone: true } } } },
          enrollments: { where: { status: 'ACTIVE' }, include: { class: { select: { id: true, name: true } } } },
        },
      }),
      db.student.count({ where }),
    ]);
    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  async getStudent(actor: AuthUser, id: string) {
    const student = await this.prisma.forSchool(actor.schoolId).student.findUnique({
      where: { id },
      include: studentDetail,
    });
    if (!student) throw notFound('Student');
    return student;
  }

  async createStudent(actor: AuthUser, dto: CreateStudentDto) {
    const db = this.prisma.forSchool(actor.schoolId);
    const { guardians, classId, joinedAt, ...fields } = dto;
    const joined = joinedAt ?? todayInSchool();
    await this.assertGuardianRule(actor.schoolId, fields.dateOfBirth, guardians.length);
    if (classId) await this.loadEnrollmentTarget(db, classId);

    const student = await db.$transaction(async (tx) => {
      const n = await nextCounter(tx, actor.schoolId, `student:${joined.getUTCFullYear()}`);
      const created = await tx.student.create({
        data: {
          ...fields,
          schoolId: actor.schoolId,
          joinedAt: joined,
          code: `${joined.getUTCFullYear()}-${String(n).padStart(4, '0')}`,
        },
      });
      await this.linkGuardians(tx, actor.schoolId, created.id, guardians);
      if (classId) await this.enrollInTx(tx, actor, created, classId, { startDate: joined });
      return created;
    });
    await this.audit.log(actor, 'STUDENT_CREATE', 'Student', student.id, undefined, { ...student, guardians, classId });
    return this.getStudent(actor, student.id);
  }

  async updateStudent(actor: AuthUser, id: string, dto: UpdateStudentDto) {
    const db = this.prisma.forSchool(actor.schoolId);
    const before = await db.student.findUnique({ where: { id }, include: { _count: { select: { guardians: true } } } });
    if (!before) throw notFound('Student');
    if (dto.dateOfBirth) await this.assertGuardianRule(actor.schoolId, dto.dateOfBirth, before._count.guardians);

    // Withdrawing consent deletes the photo.
    const dropPhoto = dto.photoConsent === false && !!before.photoUrl;
    const student = await db.$transaction(async (tx) => {
      const updated = await tx.student.update({
        where: { id },
        data: { ...dto, ...(dropPhoto && { photoUrl: null }) },
      });
      // Leaving the school ends every active enrollment.
      if (dto.status && dto.status !== 'ACTIVE') {
        await tx.enrollment.updateMany({
          where: { studentId: id, status: 'ACTIVE' },
          data: { status: 'ENDED', endDate: todayInSchool() },
        });
      }
      return updated;
    });
    if (dropPhoto) await this.files.remove(before.photoUrl);
    await this.audit.log(actor, 'STUDENT_UPDATE', 'Student', id, before, student);
    return this.getStudent(actor, id);
  }

  async addGuardian(actor: AuthUser, studentId: string, link: GuardianLinkDto) {
    const db = this.prisma.forSchool(actor.schoolId);
    if (!(await db.student.findUnique({ where: { id: studentId } }))) throw notFound('Student');
    await db.$transaction((tx) => this.linkGuardians(tx, actor.schoolId, studentId, [link]));
    await this.audit.log(actor, 'STUDENT_GUARDIAN_ADD', 'Student', studentId, undefined, link);
    return this.getStudent(actor, studentId);
  }

  async removeGuardian(actor: AuthUser, studentId: string, guardianId: string) {
    const db = this.prisma.forSchool(actor.schoolId);
    const student = await db.student.findUnique({
      where: { id: studentId },
      include: { guardians: true },
    });
    if (!student) throw notFound('Student');
    const link = student.guardians.find((g) => g.guardianId === guardianId);
    if (!link) throw notFound('StudentGuardian');
    await this.assertGuardianRule(actor.schoolId, student.dateOfBirth ?? undefined, student.guardians.length - 1);

    await db.$transaction(async (tx) => {
      await tx.studentGuardian.delete({ where: { studentId_guardianId: { studentId, guardianId } } });
      // Keep exactly one primary contact when someone is left.
      if (link.isPrimary) {
        const next = student.guardians.find((g) => g.guardianId !== guardianId);
        if (next) {
          await tx.studentGuardian.update({
            where: { studentId_guardianId: { studentId, guardianId: next.guardianId } },
            data: { isPrimary: true },
          });
        }
      }
    });
    await this.audit.log(actor, 'STUDENT_GUARDIAN_REMOVE', 'Student', studentId, { guardianId });
    return this.getStudent(actor, studentId);
  }

  // ───────────── Enrollments ─────────────

  async enroll(actor: AuthUser, dto: EnrollDto) {
    const db = this.prisma.forSchool(actor.schoolId);
    const student = await db.student.findUnique({ where: { id: dto.studentId } });
    if (!student) throw notFound('Student');
    if (student.status !== 'ACTIVE') throw new ApiError(HttpStatus.UNPROCESSABLE_ENTITY, 'STUDENT_NOT_ACTIVE');
    if (dto.overrideCapacity && actor.role !== 'ADMIN') throw new ApiError(HttpStatus.FORBIDDEN, 'FORBIDDEN');

    const enrollment = await db.$transaction((tx) =>
      this.enrollInTx(tx, actor, student, dto.classId, {
        startDate: dto.startDate,
        monthlyFeeOverride: dto.monthlyFeeOverride,
        overrideCapacity: dto.overrideCapacity,
      }),
    );
    await this.audit.log(actor, 'ENROLLMENT_CREATE', 'Enrollment', enrollment.id, undefined, enrollment);
    return enrollment;
  }

  async endEnrollment(actor: AuthUser, id: string, endDate?: Date) {
    const db = this.prisma.forSchool(actor.schoolId);
    const before = await db.enrollment.findUnique({ where: { id } });
    if (!before) throw notFound('Enrollment');
    if (before.status === 'ENDED') return before;
    if (endDate && endDate < before.startDate) throw new ApiError(HttpStatus.UNPROCESSABLE_ENTITY, 'END_BEFORE_START');
    // Ending today an enrollment that starts later: close it on its own start date.
    const today = todayInSchool();
    const enrollment = await db.enrollment.update({
      where: { id },
      data: { status: 'ENDED', endDate: endDate ?? (today < before.startDate ? before.startDate : today) },
    });
    await this.audit.log(actor, 'ENROLLMENT_END', 'Enrollment', id, before, enrollment);
    return enrollment;
  }

  // ───────────── Internals ─────────────

  private async enrollInTx(
    tx: Tx,
    actor: AuthUser,
    student: Pick<Student, 'id' | 'gender'>,
    classId: string,
    opts: { startDate?: Date; monthlyFeeOverride?: string; overrideCapacity?: boolean },
  ) {
    const klass = await this.loadEnrollmentTarget(tx, classId);
    checkGenderPolicy(klass.genderPolicy, student.gender);
    const already = await tx.enrollment.findFirst({ where: { studentId: student.id, classId, status: 'ACTIVE' } });
    if (already) throw new ApiError(HttpStatus.CONFLICT, 'ALREADY_ENROLLED');
    const active = await tx.enrollment.count({ where: { classId, status: 'ACTIVE' } });
    checkCapacity(active, klass.capacity, !!opts.overrideCapacity);

    return tx.enrollment.create({
      data: {
        schoolId: actor.schoolId,
        studentId: student.id,
        classId,
        startDate: opts.startDate ?? todayInSchool(),
        monthlyFeeOverride: opts.monthlyFeeOverride,
      },
    });
  }

  private async loadEnrollmentTarget(db: SchoolDb | Tx, classId: string) {
    const klass = await db.class.findUnique({ where: { id: classId } });
    if (!klass) throw notFound('Class');
    if (!klass.isActive) throw new ApiError(HttpStatus.UNPROCESSABLE_ENTITY, 'CLASS_NOT_ACTIVE');
    return klass;
  }

  /** Students under the configured age need at least one guardian (spec A4). */
  private async assertGuardianRule(schoolId: string, dateOfBirth: Date | undefined | null, guardianCount: number) {
    if (!dateOfBirth || guardianCount > 0) return;
    const settings = await this.prisma.schoolSettings.findUnique({ where: { schoolId } });
    const limit = settings?.guardianRequiredUnderAge ?? 18;
    if (ageOn(dateOfBirth, todayInSchool()) < limit) {
      throw new ApiError(HttpStatus.UNPROCESSABLE_ENTITY, 'GUARDIAN_REQUIRED', { underAge: limit });
    }
  }

  private async linkGuardians(tx: Tx, schoolId: string, studentId: string, links: GuardianLinkDto[]) {
    if (!links.length) return;
    const existing = await tx.studentGuardian.findMany({ where: { studentId } });
    const hasPrimary = existing.some((g) => g.isPrimary);
    const wantsPrimary = links.some((l) => l.isPrimary);

    for (const [i, link] of links.entries()) {
      let guardianId = link.guardianId;
      if (guardianId) {
        if (!(await tx.guardian.findUnique({ where: { id: guardianId } }))) throw notFound('Guardian');
      } else {
        guardianId = (await tx.guardian.create({ data: { ...link.guardian!, schoolId } })).id;
      }
      // First guardian becomes primary (and payer) when nobody was chosen.
      const isPrimary = link.isPrimary || (!hasPrimary && !wantsPrimary && i === 0);
      if (isPrimary && hasPrimary) {
        await tx.studentGuardian.updateMany({ where: { studentId }, data: { isPrimary: false } });
      }
      await tx.studentGuardian.create({
        data: {
          studentId,
          guardianId,
          relation: link.relation,
          isPrimary,
          isPayer: link.isPayer || (isPrimary && !links.some((l) => l.isPayer) && !existing.some((g) => g.isPayer)),
        },
      });
    }
  }
}
