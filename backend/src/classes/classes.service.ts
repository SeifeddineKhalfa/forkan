import { HttpStatus, Injectable } from '@nestjs/common';
import { AuditService } from '../audit/audit.service.js';
import { ApiError, notFound } from '../common/api-error.js';
import type { AuthUser } from '../common/decorators.js';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService, type SchoolDb } from '../prisma/prisma.service.js';
import type { ClassListQuery, CreateClassDto, UpdateClassDto } from './classes.schemas.js';

const DAY_ORDER = ['SATURDAY', 'SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'];

/** Teachers only see the imla'at they teach, assist or supervise. */
export const visibleTo = (actor: AuthUser): Prisma.ClassWhereInput =>
  actor.role === 'TEACHER' ? { teachers: { some: { teacher: { userId: actor.id } } } } : {};

const listInclude = {
  room: { include: { venue: { select: { id: true, name: true } } } },
  academicYear: { select: { id: true, name: true } },
  teachers: {
    include: { teacher: { select: { id: true, title: true, firstName: true, lastName: true } } },
  },
  scheduleSlots: true,
  _count: { select: { enrollments: { where: { status: 'ACTIVE' } } } },
} satisfies Prisma.ClassInclude;

function sortSlots<T extends { day: string; startTime: string }>(slots: T[]) {
  return [...slots].sort(
    (a, b) => DAY_ORDER.indexOf(a.day) - DAY_ORDER.indexOf(b.day) || a.startTime.localeCompare(b.startTime),
  );
}

@Injectable()
export class ClassesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(actor: AuthUser, query: ClassListQuery) {
    const db = this.prisma.forSchool(actor.schoolId);
    const academicYearId =
      query.academicYearId ?? (await db.academicYear.findFirst({ where: { isCurrent: true } }))?.id;
    const classes = await db.class.findMany({
      where: {
        AND: [
          visibleTo(actor),
          academicYearId ? { academicYearId } : {},
          query.active === 'all' ? {} : { isActive: query.active === 'true' },
          query.q
            ? { OR: [{ name: { contains: query.q, mode: 'insensitive' } }, { quranScope: { contains: query.q, mode: 'insensitive' } }] }
            : {},
        ],
      },
      orderBy: { name: 'asc' },
      include: listInclude,
    });
    return classes.map((c) => ({ ...c, scheduleSlots: sortSlots(c.scheduleSlots) }));
  }

  async get(actor: AuthUser, id: string) {
    const klass = await this.prisma.forSchool(actor.schoolId).class.findFirst({
      where: { AND: [{ id }, visibleTo(actor)] },
      include: {
        ...listInclude,
        enrollments: {
          where: { status: 'ACTIVE' },
          orderBy: { student: { lastName: 'asc' } },
          include: {
            student: {
              select: {
                id: true,
                code: true,
                firstName: true,
                lastName: true,
                gender: true,
                status: true,
                phone: true,
                // "no membership" badge (warning only, spec A5)
                memberships: {
                  where: { academicYear: { isCurrent: true } },
                  select: { memberNumber: true, charge: { select: { status: true } } },
                },
              },
            },
          },
        },
      },
    });
    if (!klass) throw notFound('Class');
    return { ...klass, scheduleSlots: sortSlots(klass.scheduleSlots) };
  }

  async create(actor: AuthUser, dto: CreateClassDto) {
    const db = this.prisma.forSchool(actor.schoolId);
    await this.assertRefs(db, dto);
    const { slots, teachers, ...fields } = dto;
    const klass = await db.$transaction(async (tx) => {
      const created = await tx.class.create({ data: { ...fields, schoolId: actor.schoolId } });
      if (slots.length) await tx.scheduleSlot.createMany({ data: slots.map((s) => ({ ...s, classId: created.id })) });
      if (teachers.length) await tx.classTeacher.createMany({ data: teachers.map((t) => ({ ...t, classId: created.id })) });
      return created;
    });
    await this.audit.log(actor, 'CLASS_CREATE', 'Class', klass.id, undefined, dto);
    return this.get(actor, klass.id);
  }

  async update(actor: AuthUser, id: string, dto: UpdateClassDto) {
    const db = this.prisma.forSchool(actor.schoolId);
    const before = await db.class.findUnique({ where: { id }, include: { scheduleSlots: true, teachers: true } });
    if (!before) throw notFound('Class');
    await this.assertRefs(db, dto);
    const { slots, teachers, ...fields } = dto;

    await db.$transaction(async (tx) => {
      await tx.class.update({ where: { id }, data: fields });
      if (slots) {
        await tx.scheduleSlot.deleteMany({ where: { classId: id } });
        await tx.scheduleSlot.createMany({ data: slots.map((s) => ({ ...s, classId: id })) });
      }
      if (teachers) {
        await tx.classTeacher.deleteMany({ where: { classId: id } });
        await tx.classTeacher.createMany({ data: teachers.map((t) => ({ ...t, classId: id })) });
      }
    });
    await this.audit.log(actor, 'CLASS_UPDATE', 'Class', id, before, dto);
    return this.get(actor, id);
  }

  /** Year, room and teachers must belong to the same school. */
  private async assertRefs(
    db: SchoolDb,
    dto: { academicYearId?: string; roomId?: string | null; teachers?: { teacherId: string }[] },
  ) {
    if (dto.academicYearId && !(await db.academicYear.findUnique({ where: { id: dto.academicYearId } }))) {
      throw notFound('AcademicYear');
    }
    if (dto.roomId && !(await db.room.findUnique({ where: { id: dto.roomId } }))) throw notFound('Room');
    if (dto.teachers?.length) {
      const ids = dto.teachers.map((t) => t.teacherId);
      const found = await db.teacher.count({ where: { id: { in: ids } } });
      if (found !== ids.length) throw new ApiError(HttpStatus.NOT_FOUND, 'NOT_FOUND', { entity: 'Teacher' });
    }
  }
}
