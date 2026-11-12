import { HttpStatus, Injectable } from '@nestjs/common';
import { AuditService } from '../audit/audit.service.js';
import { ApiError, notFound } from '../common/api-error.js';
import { todayInSchool } from '../common/dates.js';
import type { AuthUser } from '../common/decorators.js';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService, type SchoolDb } from '../prisma/prisma.service.js';
import { CreditService } from './credit.service.js';
import {
  addDays,
  type BillingSettings,
  chargeState,
  chargeStateWhere,
  decideMonthly,
  formatPeriod,
  lastDayOf,
} from './billing.js';
import type {
  BulkChargeDto,
  ChargeDto,
  ChargeListQuery,
  FeeItemDto,
  UpdateFeeItemDto,
} from './fees.schemas.js';

const chargeInclude = {
  student: { select: { id: true, code: true, firstName: true, lastName: true } },
  enrollment: { select: { class: { select: { id: true, name: true } } } },
  feeItem: { select: { id: true, name: true } },
} satisfies Prisma.ChargeInclude;

export interface GenerationResult {
  period: string;
  created: number;
  existing: number;
  free: number;
  notBillable: number;
}

/** Fee catalog, charges (what is owed) and balances. Payments come in Slice 4. */
@Injectable()
export class FeesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly credit: CreditService,
  ) {}

  // ───────────── Fee items ─────────────

  listFeeItems(actor: AuthUser) {
    return this.prisma.forSchool(actor.schoolId).feeItem.findMany({ orderBy: [{ isActive: 'desc' }, { name: 'asc' }] });
  }

  createFeeItem(actor: AuthUser, dto: FeeItemDto) {
    return this.prisma.forSchool(actor.schoolId).feeItem.create({ data: { ...dto, schoolId: actor.schoolId } });
  }

  async updateFeeItem(actor: AuthUser, id: string, dto: UpdateFeeItemDto) {
    const db = this.prisma.forSchool(actor.schoolId);
    if (!(await db.feeItem.findUnique({ where: { id } }))) throw notFound('FeeItem');
    return db.feeItem.update({ where: { id }, data: dto });
  }

  // ───────────── Charges ─────────────

  async listCharges(actor: AuthUser, q: ChargeListQuery) {
    const db = this.prisma.forSchool(actor.schoolId);
    const today = todayInSchool();
    const where: Prisma.ChargeWhereInput = {
      AND: [
        q.state === 'ALL' ? {} : chargeStateWhere(q.state, today),
        q.kind ? { kind: q.kind } : {},
        q.studentId ? { studentId: q.studentId } : {},
        q.classId ? { student: { enrollments: { some: { classId: q.classId } } } } : {},
        q.period ? { period: new Date(`${q.period}-01T00:00:00.000Z`) } : {},
        q.q
          ? {
              OR: [
                { label: { contains: q.q, mode: 'insensitive' } },
                { student: { code: { contains: q.q } } },
                { student: { firstName: { contains: q.q, mode: 'insensitive' } } },
                { student: { lastName: { contains: q.q, mode: 'insensitive' } } },
              ],
            }
          : {},
      ],
    };
    const [items, total, sums] = await Promise.all([
      db.charge.findMany({
        where,
        orderBy: [{ dueDate: 'desc' }, { createdAt: 'desc' }],
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        include: chargeInclude,
      }),
      db.charge.count({ where }),
      db.charge.aggregate({ where, _sum: { amount: true, paidAmount: true } }),
    ]);
    return {
      items: items.map((c) => ({ ...c, state: chargeState(c, today) })),
      total,
      page: q.page,
      pageSize: q.pageSize,
      totals: { amount: sums._sum.amount ?? new Prisma.Decimal(0), paid: sums._sum.paidAmount ?? new Prisma.Decimal(0) },
    };
  }

  async createCharge(actor: AuthUser, dto: ChargeDto) {
    const db = this.prisma.forSchool(actor.schoolId);
    const student = await db.student.findUnique({ where: { id: dto.studentId } });
    if (!student) throw notFound('Student');
    const data = await this.oneOffData(actor.schoolId, dto);
    const charge = await db.charge.create({
      data: { ...data, schoolId: actor.schoolId, studentId: student.id, kind: 'ONE_OFF' },
      include: chargeInclude,
    });
    await this.audit.log(actor, 'CHARGE_CREATE', 'Charge', charge.id, undefined, data);
    await this.credit.applyForStudents(actor.schoolId, [student.id]);
    return charge;
  }

  /** The same one-off charge for every active student of an imla'. */
  async bulkCharge(actor: AuthUser, dto: BulkChargeDto) {
    const db = this.prisma.forSchool(actor.schoolId);
    const klass = await db.class.findUnique({ where: { id: dto.classId } });
    if (!klass) throw notFound('Class');
    const data = await this.oneOffData(actor.schoolId, dto);
    const enrollments = await db.enrollment.findMany({
      where: { classId: klass.id, status: 'ACTIVE' },
      select: { studentId: true },
    });
    let studentIds = enrollments.map((e) => e.studentId);
    let skipped = 0;
    if (dto.skipExisting && studentIds.length) {
      const already = await db.charge.findMany({
        where: { studentId: { in: studentIds }, label: data.label, status: { not: 'CANCELLED' } },
        select: { studentId: true },
      });
      const done = new Set(already.map((c) => c.studentId));
      skipped = studentIds.filter((s) => done.has(s)).length;
      studentIds = studentIds.filter((s) => !done.has(s));
    }
    const { count } = await db.charge.createMany({
      data: studentIds.map((studentId) => ({ ...data, schoolId: actor.schoolId, studentId, kind: 'ONE_OFF' as const })),
    });
    await this.audit.log(actor, 'CHARGE_BULK_CREATE', 'Class', klass.id, undefined, { ...data, created: count, skipped });
    await this.credit.applyForStudents(actor.schoolId, studentIds);
    return { created: count, skipped };
  }

  /** ADMIN only. A paid (even partly) charge cannot be cancelled: void the payment first. */
  async cancelCharge(actor: AuthUser, id: string, reason: string) {
    const db = this.prisma.forSchool(actor.schoolId);
    const before = await db.charge.findUnique({ where: { id }, include: { membership: true } });
    if (!before) throw notFound('Charge');
    if (before.status === 'CANCELLED') return before;
    if (before.status === 'PAID' || before.paidAmount.gt(0)) {
      throw new ApiError(HttpStatus.UNPROCESSABLE_ENTITY, 'CHARGE_HAS_PAYMENTS');
    }
    const charge = await db.$transaction(async (tx) => {
      // Re-check under the lock: a payment may have landed on this charge meanwhile.
      const [locked] = await tx.$queryRaw<{ paidAmount: Prisma.Decimal }[]>`
        SELECT "paidAmount" FROM "charges" WHERE "id" = ${id} AND "schoolId" = ${actor.schoolId} FOR UPDATE`;
      if (!locked || new Prisma.Decimal(locked.paidAmount).gt(0)) {
        throw new ApiError(HttpStatus.UNPROCESSABLE_ENTITY, 'CHARGE_HAS_PAYMENTS');
      }
      // A cancelled membership fee means the student is not a member that year.
      if (before.membership) await tx.membership.delete({ where: { id: before.membership.id } });
      return tx.charge.update({ where: { id }, data: { status: 'CANCELLED', cancelReason: reason } });
    });
    await this.audit.log(actor, 'CHARGE_CANCEL', 'Charge', id, before, charge);
    return charge;
  }

  /**
   * Creates the month's charges for every enrollment that overlaps it. Idempotent:
   * `@@unique([enrollmentId, period])` makes a second run create nothing, and a
   * cancelled monthly charge is never recreated.
   */
  async generateMonthly(schoolId: string, period: Date, actor?: AuthUser): Promise<GenerationResult> {
    const db = this.prisma.forSchool(schoolId);
    const settings = await this.billingSettings(schoolId);
    const enrollments = await db.enrollment.findMany({
      where: {
        startDate: { lte: lastDayOf(period) },
        OR: [{ endDate: null }, { endDate: { gte: period } }],
        student: { status: { not: 'LEFT' } },
      },
      select: {
        id: true,
        studentId: true,
        startDate: true,
        endDate: true,
        monthlyFeeOverride: true,
        class: {
          select: {
            name: true,
            monthlyFee: true,
            academicYear: { select: { startDate: true, endDate: true, billableMonths: true } },
          },
        },
      },
    });

    const result: GenerationResult = { period: formatPeriod(period), created: 0, existing: 0, free: 0, notBillable: 0 };
    const rows: Prisma.ChargeCreateManyInput[] = [];
    for (const e of enrollments) {
      const d = decideMonthly(e, period, settings);
      if (d.kind === 'CHARGE') rows.push({ ...d.data, schoolId, kind: 'MONTHLY' });
      else if (d.kind === 'FREE') result.free++;
      else if (d.kind === 'NOT_BILLABLE') result.notBillable++;
    }
    if (rows.length) {
      const { count } = await db.charge.createMany({ data: rows, skipDuplicates: true });
      result.created = count;
      result.existing = rows.length - count;
      if (count) await this.credit.applyForStudents(schoolId, rows.map((r) => r.studentId));
    }
    if (actor) await this.audit.log(actor, 'CHARGES_GENERATE_MONTHLY', 'School', schoolId, undefined, result);
    return result;
  }

  // ───────────── Balances ─────────────

  /** Charges, balance and family view for a student's "payments" tab. */
  async studentAccount(actor: AuthUser, studentId: string) {
    const db = this.prisma.forSchool(actor.schoolId);
    const today = todayInSchool();
    const student = await db.student.findUnique({
      where: { id: studentId },
      include: { guardians: { include: { guardian: { select: { id: true, fullName: true } } } } },
    });
    if (!student) throw notFound('Student');

    const charges = await db.charge.findMany({
      where: { studentId },
      orderBy: [{ dueDate: 'desc' }, { createdAt: 'desc' }],
      include: chargeInclude,
    });
    const payer = student.guardians.find((g) => g.isPayer) ?? student.guardians.find((g) => g.isPrimary);
    const family = payer ? await this.familySummary(db, payer.guardian.id, today) : null;
    const credit = await this.creditOf(db, payer ? { payerGuardianId: payer.guardian.id } : { payerStudentId: studentId });
    const year = await db.academicYear.findFirst({
      where: { isCurrent: true },
      select: { id: true, name: true, membershipFee: true },
    });
    const membership = year
      ? await db.membership.findFirst({
          where: { studentId, academicYearId: year.id },
          select: { id: true, memberNumber: true, isNew: true, formReceived: true, charge: true },
        })
      : null;

    return {
      charges: charges.map((c) => ({ ...c, state: chargeState(c, today) })),
      ...(await this.balance(db, { studentId }, today)),
      credit,
      family: family && { guardian: payer!.guardian, ...family },
      membership: {
        year,
        current: membership && { ...membership, charge: undefined, state: chargeState(membership.charge, today) },
      },
    };
  }

  async guardianAccount(actor: AuthUser, guardianId: string) {
    const db = this.prisma.forSchool(actor.schoolId);
    const guardian = await db.guardian.findUnique({ where: { id: guardianId }, select: { id: true, fullName: true, phone: true } });
    if (!guardian) throw notFound('Guardian');
    return { guardian, ...(await this.familySummary(db, guardianId, todayInSchool())) };
  }

  // ───────────── Internals ─────────────

  private async familySummary(db: SchoolDb, guardianId: string, today: Date) {
    const links = await db.studentGuardian.findMany({
      where: { guardianId },
      include: { student: { select: { id: true, code: true, firstName: true, lastName: true, status: true } } },
    });
    const students = await Promise.all(
      links.map(async (l) => ({ ...l.student, ...(await this.balance(db, { studentId: l.student.id }, today)) })),
    );
    const sum = (k: 'balance' | 'overdue') => students.reduce((acc, s) => acc.add(s[k]), new Prisma.Decimal(0));
    return {
      students,
      balance: sum('balance'),
      overdue: sum('overdue'),
      credit: await this.creditOf(db, { payerGuardianId: guardianId }),
    };
  }

  /** Still owed (open charges) and the overdue part of it. */
  private async balance(db: SchoolDb, where: Prisma.ChargeWhereInput, today: Date) {
    const owed = async (w: Prisma.ChargeWhereInput) => {
      const s = await db.charge.aggregate({ where: { AND: [where, w] }, _sum: { amount: true, paidAmount: true } });
      return (s._sum.amount ?? new Prisma.Decimal(0)).sub(s._sum.paidAmount ?? 0);
    };
    const [balance, overdue] = await Promise.all([
      owed({ status: 'OPEN' }),
      owed({ status: 'OPEN', dueDate: { lt: today } }),
    ]);
    return { balance, overdue };
  }

  /** Family credit = unallocated money of the payer's non-voided payments (spec A5). */
  private async creditOf(db: SchoolDb, payer: Prisma.PaymentWhereInput) {
    const s = await db.payment.aggregate({ where: { ...payer, voidedAt: null }, _sum: { unallocatedAmount: true } });
    return s._sum.unallocatedAmount ?? new Prisma.Decimal(0);
  }

  private async oneOffData(schoolId: string, dto: { feeItemId?: string; label?: string; amount?: string; dueDate?: Date }) {
    let { label, amount } = dto;
    if (dto.feeItemId) {
      const item = await this.prisma.forSchool(schoolId).feeItem.findUnique({ where: { id: dto.feeItemId } });
      if (!item) throw notFound('FeeItem');
      if (!item.isActive) throw new ApiError(HttpStatus.UNPROCESSABLE_ENTITY, 'FEE_ITEM_INACTIVE');
      label ??= item.name;
      amount ??= item.defaultAmount.toFixed(3);
    }
    if (!label || amount === undefined) throw new ApiError(HttpStatus.BAD_REQUEST, 'FEE_ITEM_OR_LABEL_AND_AMOUNT');
    if (new Prisma.Decimal(amount).lte(0)) throw new ApiError(HttpStatus.BAD_REQUEST, 'AMOUNT_MUST_BE_POSITIVE');
    const settings = await this.billingSettings(schoolId);
    return {
      feeItemId: dto.feeItemId,
      label,
      amount,
      dueDate: dto.dueDate ?? addDays(todayInSchool(), settings.paymentDueDays),
    };
  }

  async billingSettings(schoolId: string): Promise<BillingSettings> {
    const s = await this.prisma.schoolSettings.findUnique({ where: { schoolId } });
    return { billingDay: s?.billingDay ?? 1, paymentDueDays: s?.paymentDueDays ?? 10 };
  }
}
