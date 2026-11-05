import { HttpStatus, Injectable } from '@nestjs/common';
import { AuditService } from '../audit/audit.service.js';
import { hashPassword } from '../auth/auth.service.js';
import { ApiError, notFound } from '../common/api-error.js';
import type { AuthUser } from '../common/decorators.js';
import { DOCUMENT_TYPES, FilesService } from '../files/files.service.js';
import type { Prisma, Teacher } from '../generated/prisma/client.js';
import { PrismaService, type SchoolDb, type SchoolTx } from '../prisma/prisma.service.js';
import type {
  CreateTeacherDto,
  IjazaDto,
  LoginDto,
  TeacherListQuery,
  UpdateTeacherDto,
} from './teachers.schemas.js';

const ADMIN_ONLY_FIELDS = ['contractType', 'monthlySalary'] as const;

/** Contract and salary are visible to ADMIN only (spec A3). */
function redact<T extends Partial<Teacher>>(actor: AuthUser, t: T): T {
  if (actor.role === 'ADMIN') return t;
  const copy = { ...t };
  for (const f of ADMIN_ONLY_FIELDS) delete copy[f];
  return copy;
}

function assertMayWriteAdminFields(actor: AuthUser, dto: Partial<Record<string, unknown>>) {
  if (actor.role !== 'ADMIN' && ADMIN_ONLY_FIELDS.some((f) => dto[f] !== undefined)) {
    throw new ApiError(HttpStatus.FORBIDDEN, 'FORBIDDEN');
  }
}

const loginSelect = { select: { id: true, email: true, phone: true, isActive: true } } as const;

@Injectable()
export class TeachersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly files: FilesService,
  ) {}

  async list(actor: AuthUser, query: TeacherListQuery) {
    const where: Prisma.TeacherWhereInput = {
      ...(query.active !== 'all' && { isActive: query.active === 'true' }),
      ...(query.q && {
        OR: [
          { firstName: { contains: query.q, mode: 'insensitive' } },
          { lastName: { contains: query.q, mode: 'insensitive' } },
          { phone: { contains: query.q } },
        ],
      }),
    };
    const teachers = await this.prisma.forSchool(actor.schoolId).teacher.findMany({
      where,
      orderBy: [{ isActive: 'desc' }, { lastName: 'asc' }],
      include: { user: loginSelect, _count: { select: { classes: true, ijazas: true } } },
    });
    return teachers.map((t) => redact(actor, t));
  }

  async get(actor: AuthUser, id: string) {
    const teacher = await this.prisma.forSchool(actor.schoolId).teacher.findUnique({
      where: { id },
      include: {
        user: loginSelect,
        student: { select: { id: true, code: true, firstName: true, lastName: true } },
        ijazas: { orderBy: { year: 'desc' } },
        classes: {
          include: { class: { select: { id: true, name: true, isActive: true, academicYear: { select: { name: true } } } } },
        },
      },
    });
    if (!teacher) throw notFound('Teacher');
    return redact(actor, teacher);
  }

  async create(actor: AuthUser, dto: CreateTeacherDto) {
    assertMayWriteAdminFields(actor, dto);
    const { login, ...fields } = dto;
    const db = this.prisma.forSchool(actor.schoolId);
    if (fields.studentId) await this.assertStudent(db, fields.studentId);

    const teacher = await db.$transaction(async (tx) => {
      const userId = login ? (await this.createLogin(tx, actor.schoolId, fields, login)).id : undefined;
      return tx.teacher.create({ data: { ...fields, userId, schoolId: actor.schoolId } });
    });
    await this.audit.log(actor, 'TEACHER_CREATE', 'Teacher', teacher.id, undefined, redact(actor, teacher));
    return this.get(actor, teacher.id);
  }

  async update(actor: AuthUser, id: string, dto: UpdateTeacherDto) {
    assertMayWriteAdminFields(actor, dto);
    const db = this.prisma.forSchool(actor.schoolId);
    const before = await db.teacher.findUnique({ where: { id } });
    if (!before) throw notFound('Teacher');
    if (dto.studentId) await this.assertStudent(db, dto.studentId);

    const teacher = await db.teacher.update({ where: { id }, data: dto });
    // Deactivating a teacher also blocks their login.
    if (dto.isActive === false && teacher.userId) {
      await db.user.update({ where: { id: teacher.userId }, data: { isActive: false } });
      await this.prisma.refreshToken.updateMany({
        where: { userId: teacher.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
    await this.audit.log(actor, 'TEACHER_UPDATE', 'Teacher', id, redact(actor, before), redact(actor, teacher));
    return this.get(actor, id);
  }

  /** Gives an existing teacher (e.g. created without login) access to the app. */
  async addLogin(actor: AuthUser, id: string, login: LoginDto) {
    const db = this.prisma.forSchool(actor.schoolId);
    const teacher = await db.teacher.findUnique({ where: { id } });
    if (!teacher) throw notFound('Teacher');
    if (teacher.userId) throw new ApiError(HttpStatus.CONFLICT, 'TEACHER_HAS_LOGIN');

    await db.$transaction(async (tx) => {
      const user = await this.createLogin(tx, actor.schoolId, teacher, login);
      await tx.teacher.update({ where: { id }, data: { userId: user.id } });
    });
    await this.audit.log(actor, 'TEACHER_ADD_LOGIN', 'Teacher', id);
    return this.get(actor, id);
  }

  async addIjaza(actor: AuthUser, teacherId: string, dto: IjazaDto) {
    const db = this.prisma.forSchool(actor.schoolId);
    if (!(await db.teacher.findUnique({ where: { id: teacherId } }))) throw notFound('Teacher');
    const ijaza = await this.prisma.teacherIjaza.create({ data: { ...dto, teacherId } });
    await this.audit.log(actor, 'IJAZA_CREATE', 'Teacher', teacherId, undefined, ijaza);
    return ijaza;
  }

  async removeIjaza(actor: AuthUser, teacherId: string, ijazaId: string) {
    const db = this.prisma.forSchool(actor.schoolId);
    if (!(await db.teacher.findUnique({ where: { id: teacherId } }))) throw notFound('Teacher');
    const { count } = await this.prisma.teacherIjaza.deleteMany({ where: { id: ijazaId, teacherId } });
    if (count === 0) throw notFound('TeacherIjaza');
    await this.audit.log(actor, 'IJAZA_DELETE', 'Teacher', teacherId, { ijazaId });
  }

  /** Scanned ijaza certificate (image or PDF). */
  async setIjazaDocument(actor: AuthUser, teacherId: string, ijazaId: string, buffer: Buffer | undefined) {
    const ijaza = await this.findIjaza(actor, teacherId, ijazaId);
    const documentUrl = await this.files.store(actor.schoolId, 'ijazas', buffer, DOCUMENT_TYPES);
    await this.prisma.teacherIjaza.update({ where: { id: ijazaId }, data: { documentUrl } });
    await this.files.remove(ijaza.documentUrl);
    await this.audit.log(actor, 'IJAZA_DOCUMENT_SET', 'Teacher', teacherId, undefined, { ijazaId });
    return this.get(actor, teacherId);
  }

  async ijazaDocumentPath(actor: AuthUser, teacherId: string, ijazaId: string) {
    const ijaza = await this.findIjaza(actor, teacherId, ijazaId);
    if (!ijaza.documentUrl) throw notFound('Document');
    return this.files.absolute(ijaza.documentUrl);
  }

  private async findIjaza(actor: AuthUser, teacherId: string, ijazaId: string) {
    const db = this.prisma.forSchool(actor.schoolId);
    if (!(await db.teacher.findUnique({ where: { id: teacherId } }))) throw notFound('Teacher');
    const ijaza = await this.prisma.teacherIjaza.findFirst({ where: { id: ijazaId, teacherId } });
    if (!ijaza) throw notFound('TeacherIjaza');
    return ijaza;
  }

  private createLogin(
    tx: SchoolTx,
    schoolId: string,
    person: { firstName: string; lastName: string },
    login: LoginDto,
  ) {
    return hashPassword(login.temporaryPassword).then((passwordHash) =>
      tx.user.create({
        data: {
          schoolId,
          email: login.email,
          phone: login.phone,
          role: 'TEACHER',
          firstName: person.firstName,
          lastName: person.lastName,
          passwordHash,
          mustChangePassword: true,
        },
      }),
    );
  }

  private async assertStudent(db: SchoolDb, studentId: string) {
    if (!(await db.student.findUnique({ where: { id: studentId } }))) throw notFound('Student');
  }
}
