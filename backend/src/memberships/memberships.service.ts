import { HttpStatus, Injectable } from '@nestjs/common';
import { AuditService } from '../audit/audit.service.js';
import { ApiError, notFound } from '../common/api-error.js';
import { nextCounter } from '../common/counters.js';
import { todayInSchool } from '../common/dates.js';
import type { AuthUser } from '../common/decorators.js';
import { addDays, chargeState } from '../fees/billing.js';
import { CreditService } from '../fees/credit.service.js';
import { FeesService } from '../fees/fees.service.js';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { MembershipListQuery, RegisterMembershipDto } from './memberships.schemas.js';

const studentSelect = {
  id: true,
  code: true,
  firstName: true,
  lastName: true,
  gender: true,
  dateOfBirth: true,
  phone: true,
  status: true,
  guardians: { where: { isPrimary: true }, select: { guardian: { select: { fullName: true, phone: true } } } },
} satisfies Prisma.StudentSelect;

/** The association's yearly membership register (الانخراط), spec A5. */
@Injectable()
export class MembershipsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly fees: FeesService,
    private readonly audit: AuditService,
    private readonly credit: CreditService,
  ) {}

  async list(actor: AuthUser, q: MembershipListQuery) {
    const db = this.prisma.forSchool(actor.schoolId);
    const year = await this.year(actor.schoolId, q.academicYearId);
    const today = todayInSchool();
    const where: Prisma.MembershipWhereInput = {
      AND: [
        { academicYearId: year.id },
        q.type === 'NEW' ? { isNew: true } : q.type === 'RENEWAL' ? { isNew: false } : {},
        q.state === 'PAID' ? { charge: { status: 'PAID' } } : q.state === 'UNPAID' ? { charge: { status: 'OPEN' } } : {},
        q.q
          ? {
              OR: [
                { memberNumber: { contains: q.q } },
                { student: { code: { contains: q.q } } },
                { student: { firstName: { contains: q.q, mode: 'insensitive' } } },
                { student: { lastName: { contains: q.q, mode: 'insensitive' } } },
              ],
            }
          : {},
      ],
    };
    const [items, all, missing] = await Promise.all([
      db.membership.findMany({
        where,
        orderBy: { memberNumber: 'asc' },
        include: {
          student: { select: studentSelect },
          charge: { select: { id: true, amount: true, paidAmount: true, status: true, dueDate: true } },
        },
      }),
      db.membership.findMany({
        where: { academicYearId: year.id },
        select: { isNew: true, charge: { select: { amount: true, paidAmount: true, status: true } } },
      }),
      db.student.count({ where: missingWhere(year.id) }),
    ]);
    const sum = (f: (m: (typeof all)[number]) => Prisma.Decimal) =>
      all.reduce((acc, m) => acc.add(f(m)), new Prisma.Decimal(0));
    return {
      year: {
        id: year.id,
        name: year.name,
        membershipFee: year.membershipFee,
        windowStart: year.membershipWindowStart,
        windowEnd: year.membershipWindowEnd,
      },
      summary: {
        total: all.length,
        paid: all.filter((m) => m.charge.status === 'PAID').length,
        isNew: all.filter((m) => m.isNew).length,
        expected: sum((m) => m.charge.amount),
        collected: sum((m) => m.charge.paidAmount),
        missing,
      },
      items: items.map((m) => ({ ...m, state: chargeState(m.charge, today) })),
    };
  }

  /** Active students of an imla' that requires membership, still without one that year. */
  async missing(actor: AuthUser, academicYearId?: string) {
    const year = await this.year(actor.schoolId, academicYearId);
    return this.prisma.forSchool(actor.schoolId).student.findMany({
      where: missingWhere(year.id),
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      select: {
        ...studentSelect,
        memberships: { select: { id: true }, take: 1 }, // a membership in an earlier year → renewal
        enrollments: {
          where: { status: 'ACTIVE', class: { academicYearId: year.id } },
          select: { class: { select: { id: true, name: true } } },
        },
      },
    });
  }

  async register(actor: AuthUser, dto: RegisterMembershipDto) {
    const db = this.prisma.forSchool(actor.schoolId);
    const year = await this.year(actor.schoolId, dto.academicYearId);
    const fee = year.membershipFee;
    if (!fee || fee.lte(0)) throw new ApiError(HttpStatus.UNPROCESSABLE_ENTITY, 'NO_MEMBERSHIP_THIS_YEAR');
    const student = await db.student.findUnique({ where: { id: dto.studentId } });
    if (!student) throw notFound('Student');
    if (student.status === 'LEFT') throw new ApiError(HttpStatus.UNPROCESSABLE_ENTITY, 'STUDENT_NOT_ACTIVE');
    if (await db.membership.findFirst({ where: { academicYearId: year.id, studentId: student.id } })) {
      throw new ApiError(HttpStatus.CONFLICT, 'ALREADY_MEMBER', { year: year.name });
    }
    const isNew = dto.isNew ?? !(await db.membership.findFirst({ where: { studentId: student.id } }));

    // Due at the end of the campaign window, or the usual delay once it is over.
    const today = todayInSchool();
    const { paymentDueDays } = await this.fees.billingSettings(actor.schoolId);
    const windowEnd = year.membershipWindowEnd;
    const dueDate = windowEnd && windowEnd >= today ? windowEnd : addDays(today, paymentDueDays);

    const membership = await db.$transaction(async (tx) => {
      const charge = await tx.charge.create({
        data: {
          schoolId: actor.schoolId,
          studentId: student.id,
          kind: 'MEMBERSHIP',
          label: `معلوم الانخراط ${year.name}`,
          amount: fee,
          dueDate,
        },
      });
      const n = await nextCounter(tx, actor.schoolId, `member:${year.name}`);
      return tx.membership.create({
        data: {
          schoolId: actor.schoolId,
          academicYearId: year.id,
          studentId: student.id,
          memberNumber: String(n).padStart(3, '0'),
          isNew,
          formReceived: dto.formReceived,
          chargeId: charge.id,
        },
        include: { charge: true },
      });
    });
    await this.audit.log(actor, 'MEMBERSHIP_CREATE', 'Membership', membership.id, undefined, {
      studentId: student.id,
      year: year.name,
      memberNumber: membership.memberNumber,
    });
    await this.credit.applyForStudents(actor.schoolId, [student.id]);
    return membership;
  }

  async update(actor: AuthUser, id: string, formReceived: boolean) {
    const db = this.prisma.forSchool(actor.schoolId);
    if (!(await db.membership.findUnique({ where: { id } }))) throw notFound('Membership');
    return db.membership.update({ where: { id }, data: { formReceived } });
  }

  private async year(schoolId: string, id?: string) {
    const year = await this.prisma.forSchool(schoolId).academicYear.findFirst({
      where: id ? { id } : { isCurrent: true },
    });
    if (!year) throw notFound('AcademicYear');
    return year;
  }
}

function missingWhere(academicYearId: string): Prisma.StudentWhereInput {
  return {
    status: 'ACTIVE',
    enrollments: { some: { status: 'ACTIVE', class: { academicYearId, requiresMembership: true } } },
    memberships: { none: { academicYearId } },
  };
}
