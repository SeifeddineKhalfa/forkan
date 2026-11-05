import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { AuditService } from '../audit/audit.service.js';
import { ApiError, notFound } from '../common/api-error.js';
import { nextCounter } from '../common/counters.js';
import { todayInSchool } from '../common/dates.js';
import type { AuthUser } from '../common/decorators.js';
import { chargeState } from '../fees/billing.js';
import { CreditService } from '../fees/credit.service.js';
import { applyAllocations, lockOpenCharges, type Payer, reverseAllocations, studentsOf } from '../fees/ledger.js';
import { FilesService } from '../files/files.service.js';
import { Prisma } from '../generated/prisma/client.js';
import { PdfService } from '../pdf/pdf.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { allocate } from './allocation.js';
import type { PaymentListQuery, PayerQuery, RecordPaymentDto } from './payments.schemas.js';
import { receiptHtml } from './receipt.template.js';

const studentName = { select: { id: true, code: true, firstName: true, lastName: true } } as const;

const paymentDetail = {
  allocations: {
    orderBy: { allocatedAt: 'asc' },
    include: { charge: { select: { id: true, label: true, kind: true, amount: true, student: studentName } } },
  },
  receivedBy: { select: { firstName: true, lastName: true } },
  voidedBy: { select: { firstName: true, lastName: true } },
  payerGuardian: { select: { id: true, fullName: true, phone: true } },
  payerStudent: { select: { id: true, code: true, firstName: true, lastName: true, phone: true } },
} satisfies Prisma.PaymentInclude;

type PaymentWithDetail = Prisma.PaymentGetPayload<{ include: typeof paymentDetail }>;

/** Tunis is UTC+1 all year (no DST since 2009). */
const monthStartInTunis = (period: string) => new Date(`${period}-01T00:00:00+01:00`);

/** Money received, receipts and voids (spec A5). */
@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly files: FilesService,
    private readonly pdf: PdfService,
    private readonly credit: CreditService,
  ) {}

  // ───────────── Recording ─────────────

  /** What the payment screen shows for a payer: their students' open charges, oldest first. */
  async openCharges(actor: AuthUser, q: PayerQuery) {
    const db = this.prisma.forSchool(actor.schoolId);
    const payer = await this.loadPayer(actor.schoolId, q);
    const studentIds = await db.$transaction((tx) => studentsOf(tx, payer.ref));
    const today = todayInSchool();
    const [charges, credit] = await Promise.all([
      db.charge.findMany({
        where: { studentId: { in: studentIds }, status: 'OPEN' },
        orderBy: [{ dueDate: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
        include: { student: studentName },
      }),
      db.payment.aggregate({ where: { ...payer.ref, voidedAt: null }, _sum: { unallocatedAmount: true } }),
    ]);
    return {
      payer: payer.info,
      charges: charges.map((c) => ({ ...c, remaining: c.amount.sub(c.paidAmount), state: chargeState(c, today) })),
      credit: credit._sum.unallocatedAmount ?? new Prisma.Decimal(0),
    };
  }

  async record(actor: AuthUser, dto: RecordPaymentDto) {
    const db = this.prisma.forSchool(actor.schoolId);
    const payer = await this.loadPayer(actor.schoolId, dto);
    const paidAt = this.paidAt(dto.paidAt);
    const amount = new Prisma.Decimal(dto.amount);

    const payment = await db.$transaction(async (tx) => {
      const charges = await lockOpenCharges(tx, actor.schoolId, await studentsOf(tx, payer.ref));
      const { allocations, unallocated } = allocate(
        amount,
        charges,
        dto.allocations?.map((a) => ({ chargeId: a.chargeId, amount: new Prisma.Decimal(a.amount) })),
      );
      // Gap-free per calendar year of the payment in Tunis (spec A6).
      const year = todayInSchool(paidAt).getUTCFullYear();
      const n = await nextCounter(tx, actor.schoolId, `receipt:${year}`);
      const created = await tx.payment.create({
        data: {
          schoolId: actor.schoolId,
          receiptNumber: `${year}-${String(n).padStart(5, '0')}`,
          ...payer.ref,
          payerName: payer.info.name,
          amount,
          unallocatedAmount: unallocated,
          method: dto.method,
          reference: dto.reference,
          notes: dto.notes,
          paidAt,
          receivedById: actor.id,
          publicToken: randomBytes(24).toString('base64url'), // 192 bits
        },
      });
      await applyAllocations(tx, created.id, allocations, false);
      return created;
    });

    await this.audit.log(actor, 'PAYMENT_CREATE', 'Payment', payment.id, undefined, {
      receiptNumber: payment.receiptNumber,
      amount: payment.amount,
      payer: payer.ref,
    });
    // Ready before staff opens or shares it; failures are retried on first download.
    if (process.env.NODE_ENV !== 'test') {
      void this.receiptFile(actor.schoolId, payment.id).catch((err: unknown) =>
        this.logger.warn({ err, paymentId: payment.id }, 'receipt PDF not generated yet'),
      );
    }
    return this.get(actor, payment.id);
  }

  /** ADMIN only. The receipt number stays; its charges reopen; the PDF is redone with a «ملغى» stamp. */
  async void(actor: AuthUser, id: string, reason: string) {
    const db = this.prisma.forSchool(actor.schoolId);
    const before = await db.payment.findUnique({ where: { id } });
    if (!before) throw notFound('Payment');
    if (before.voidedAt) throw new ApiError(HttpStatus.CONFLICT, 'PAYMENT_ALREADY_VOIDED');

    const allocations = await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "payments" WHERE "id" = ${id} FOR UPDATE`;
      const reversed = await reverseAllocations(tx, id);
      await tx.payment.update({
        where: { id },
        data: { voidedAt: new Date(), voidedById: actor.id, voidReason: reason, unallocatedAmount: 0, pdfPath: null },
      });
      return reversed;
    });
    await this.files.remove(before.pdfPath);
    await this.audit.log(actor, 'PAYMENT_VOID', 'Payment', id, before, { reason, allocations });

    // Reopened charges may be covered by the family's other credit.
    const charges = await db.charge.findMany({
      where: { id: { in: allocations.map((a) => a.chargeId) } },
      select: { studentId: true },
    });
    await this.credit.applyForStudents(actor.schoolId, charges.map((c) => c.studentId));
    return this.get(actor, id);
  }

  // ───────────── Reading ─────────────

  async list(actor: AuthUser, q: PaymentListQuery) {
    const db = this.prisma.forSchool(actor.schoolId);
    const where: Prisma.PaymentWhereInput = {
      AND: [
        q.from ? { paidAt: { gte: new Date(q.from.getTime() - 3_600_000) } } : {},
        q.to ? { paidAt: { lt: new Date(q.to.getTime() + 86_400_000 - 3_600_000) } } : {},
        q.method ? { method: q.method } : {},
        q.payerGuardianId ? { payerGuardianId: q.payerGuardianId } : {},
        q.studentId
          ? { OR: [{ payerStudentId: q.studentId }, { allocations: { some: { charge: { studentId: q.studentId } } } }] }
          : {},
        q.voided === 'ONLY' ? { voidedAt: { not: null } } : q.voided === 'NONE' ? { voidedAt: null } : {},
        q.q
          ? {
              OR: [
                { receiptNumber: { contains: q.q } },
                { payerName: { contains: q.q, mode: 'insensitive' } },
                { reference: { contains: q.q } },
              ],
            }
          : {},
      ],
    };
    const [items, total, sums] = await Promise.all([
      db.payment.findMany({
        where,
        orderBy: [{ paidAt: 'desc' }, { receiptNumber: 'desc' }],
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        include: { receivedBy: { select: { firstName: true, lastName: true } } },
        omit: { publicToken: true, pdfPath: true },
      }),
      db.payment.count({ where }),
      db.payment.aggregate({ where: { AND: [where, { voidedAt: null }] }, _sum: { amount: true } }),
    ]);
    return { items, total, page: q.page, pageSize: q.pageSize, totals: { amount: sums._sum.amount ?? new Prisma.Decimal(0) } };
  }

  async get(actor: AuthUser, id: string) {
    const payment = await this.prisma.forSchool(actor.schoolId).payment.findUnique({ where: { id }, include: paymentDetail });
    if (!payment) throw notFound('Payment');
    const { pdfPath: _pdf, ...rest } = payment;
    return { ...rest, publicPath: `/r/${payment.publicToken}`, phone: payment.payerGuardian?.phone ?? payment.payerStudent?.phone ?? null };
  }

  /** The receipt PDF, generated on first use and kept (immutable once issued). */
  async receiptFile(schoolId: string, id: string): Promise<{ path: string; receiptNumber: string }> {
    const payment = await this.prisma.forSchool(schoolId).payment.findUnique({ where: { id }, include: paymentDetail });
    if (!payment) throw notFound('Payment');
    if (payment.pdfPath) return { path: this.files.absolute(payment.pdfPath), receiptNumber: payment.receiptNumber };

    const buffer = await this.pdf.render(receiptHtml(await this.receiptData(schoolId, payment), this.pdf.fontCss));
    const suffix = payment.voidedAt ? '-void' : '';
    const relative = `${schoolId}/receipts/${payment.receiptNumber}${suffix}.pdf`;
    const absolute = this.files.absolute(relative);
    await mkdir(dirname(absolute), { recursive: true });
    await writeFile(absolute, buffer);
    await this.prisma.forSchool(schoolId).payment.update({ where: { id }, data: { pdfPath: relative } });
    return { path: absolute, receiptNumber: payment.receiptNumber };
  }

  /** `GET /r/:token`: no login, the token is the secret. */
  async publicReceipt(token: string) {
    const payment = await this.prisma.payment.findUnique({ where: { publicToken: token }, select: { id: true, schoolId: true } });
    if (!payment) throw notFound('Payment');
    return this.receiptFile(payment.schoolId, payment.id);
  }

  // ───────────── Reminders & finance ─────────────

  /**
   * Families (or adult students) to remind, one WhatsApp message each:
   * OVERDUE = open charges past due; MEMBERSHIP = this year's unpaid membership fees.
   */
  async reminders(actor: AuthUser, type: 'OVERDUE' | 'MEMBERSHIP') {
    const db = this.prisma.forSchool(actor.schoolId);
    const today = todayInSchool();
    const charges = await db.charge.findMany({
      where:
        type === 'OVERDUE'
          ? { status: 'OPEN', dueDate: { lt: today } }
          : { status: 'OPEN', kind: 'MEMBERSHIP', membership: { academicYear: { isCurrent: true } } },
      orderBy: [{ dueDate: 'asc' }],
      include: {
        student: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            phone: true,
            guardians: { include: { guardian: { select: { id: true, fullName: true, phone: true } } } },
          },
        },
      },
    });

    type Group = {
      key: string;
      payer: { type: 'GUARDIAN' | 'STUDENT'; id: string; name: string; phone: string | null };
      students: string[];
      charges: { id: string; label: string; remaining: Prisma.Decimal; dueDate: Date; student: string }[];
      total: Prisma.Decimal;
      lastReminderAt: Date | null;
    };
    const groups = new Map<string, Group>();
    for (const c of charges) {
      const links = c.student.guardians;
      const link = links.find((l) => l.isPayer) ?? links.find((l) => l.isPrimary) ?? links[0];
      const payer = link
        ? { type: 'GUARDIAN' as const, id: link.guardian.id, name: link.guardian.fullName, phone: link.guardian.phone }
        : { type: 'STUDENT' as const, id: c.student.id, name: `${c.student.firstName} ${c.student.lastName}`, phone: c.student.phone };
      const key = `${payer.type}:${payer.id}`;
      const g = groups.get(key) ?? { key, payer, students: [], charges: [], total: new Prisma.Decimal(0), lastReminderAt: null };
      const name = `${c.student.firstName} ${c.student.lastName}`;
      if (!g.students.includes(name)) g.students.push(name);
      const remaining = c.amount.sub(c.paidAmount);
      g.charges.push({ id: c.id, label: c.label, remaining, dueDate: c.dueDate, student: name });
      g.total = g.total.add(remaining);
      groups.set(key, g);
    }

    const kind = type === 'OVERDUE' ? 'PAYMENT_REMINDER' : 'MEMBERSHIP_REMINDER';
    const logs = await db.messageLog.groupBy({
      by: ['guardianId', 'studentId'],
      where: { kind },
      _max: { preparedAt: true },
    });
    for (const g of groups.values()) {
      const log = logs.find((l) => (g.payer.type === 'GUARDIAN' ? l.guardianId === g.payer.id : l.studentId === g.payer.id && !l.guardianId));
      g.lastReminderAt = log?._max.preparedAt ?? null;
    }
    return [...groups.values()].sort((a, b) => b.total.cmp(a.total));
  }

  /** Finance dashboard for one month (default: this month). */
  async finance(actor: AuthUser, period?: string) {
    const db = this.prisma.forSchool(actor.schoolId);
    const today = todayInSchool();
    const p = period ?? today.toISOString().slice(0, 7);
    const start = monthStartInTunis(p);
    const [y, m] = p.split('-').map(Number);
    const end = monthStartInTunis(`${m === 12 ? y + 1 : y}-${String(m === 12 ? 1 : m + 1).padStart(2, '0')}`);
    const zero = new Prisma.Decimal(0);

    const [collected, byMethod, open, overdue, credit, monthly] = await Promise.all([
      db.payment.aggregate({ where: { voidedAt: null, paidAt: { gte: start, lt: end } }, _sum: { amount: true }, _count: true }),
      db.payment.groupBy({ by: ['method'], where: { voidedAt: null, paidAt: { gte: start, lt: end } }, _sum: { amount: true } }),
      db.charge.aggregate({ where: { status: 'OPEN' }, _sum: { amount: true, paidAmount: true } }),
      db.charge.aggregate({ where: { status: 'OPEN', dueDate: { lt: today } }, _sum: { amount: true, paidAmount: true } }),
      db.payment.aggregate({ where: { voidedAt: null }, _sum: { unallocatedAmount: true } }),
      db.charge.findMany({
        where: { kind: 'MONTHLY', period: new Date(`${p}-01T00:00:00.000Z`), status: { not: 'CANCELLED' } },
        select: { amount: true, paidAmount: true, enrollment: { select: { class: { select: { id: true, name: true } } } } },
      }),
    ]);

    const classes = new Map<string, { id: string; name: string; billed: Prisma.Decimal; paid: Prisma.Decimal; count: number }>();
    for (const c of monthly) {
      const k = c.enrollment!.class;
      const row = classes.get(k.id) ?? { ...k, billed: zero, paid: zero, count: 0 };
      row.billed = row.billed.add(c.amount);
      row.paid = row.paid.add(c.paidAmount);
      row.count++;
      classes.set(k.id, row);
    }
    const billed = monthly.reduce((a, c) => a.add(c.amount), zero);
    const paid = monthly.reduce((a, c) => a.add(c.paidAmount), zero);
    const owed = (s: { _sum: { amount: Prisma.Decimal | null; paidAmount: Prisma.Decimal | null } }) =>
      (s._sum.amount ?? zero).sub(s._sum.paidAmount ?? zero);

    return {
      period: p,
      collected: collected._sum.amount ?? zero,
      payments: collected._count,
      byMethod: byMethod.map((r) => ({ method: r.method, amount: r._sum.amount ?? zero })),
      outstanding: owed(open),
      overdue: owed(overdue),
      credit: credit._sum.unallocatedAmount ?? zero,
      month: { billed, paid, rate: billed.gt(0) ? Number(paid.div(billed).toFixed(4)) : null },
      byClass: [...classes.values()].sort((a, b) => a.name.localeCompare(b.name, 'ar')),
    };
  }

  // ───────────── Internals ─────────────

  private async loadPayer(schoolId: string, q: { payerGuardianId?: string; payerStudentId?: string }) {
    const db = this.prisma.forSchool(schoolId);
    if (q.payerGuardianId) {
      const g = await db.guardian.findUnique({ where: { id: q.payerGuardianId } });
      if (!g) throw notFound('Guardian');
      return { ref: { payerGuardianId: g.id } as Payer, info: { type: 'GUARDIAN' as const, id: g.id, name: g.fullName, phone: g.phone } };
    }
    const s = await db.student.findUnique({ where: { id: q.payerStudentId } });
    if (!s) throw notFound('Student');
    return {
      ref: { payerStudentId: s.id } as Payer,
      info: { type: 'STUDENT' as const, id: s.id, name: `${s.firstName} ${s.lastName}`, phone: s.phone },
    };
  }

  /** Now, or noon (Tunis) of a past day typed from a paper receipt. */
  private paidAt(day?: Date): Date {
    const now = new Date();
    if (!day) return now;
    const today = todayInSchool(now);
    if (day > today) throw new ApiError(HttpStatus.UNPROCESSABLE_ENTITY, 'PAID_AT_IN_FUTURE');
    return day.getTime() === today.getTime() ? now : new Date(day.getTime() + 11 * 3_600_000);
  }

  private async receiptData(schoolId: string, p: PaymentWithDetail) {
    const school = await this.prisma.school.findUniqueOrThrow({ where: { id: schoolId }, include: { settings: true } });
    return {
      school: {
        name: school.name,
        address: school.address,
        phone: school.settings?.contactPhone ?? school.phone,
        footer: school.settings?.receiptFooter ?? null,
        hijri: school.settings?.showHijriDates ?? true,
      },
      receiptNumber: p.receiptNumber,
      paidAt: p.paidAt,
      payerName: p.payerName,
      amount: p.amount,
      method: p.method,
      reference: p.reference,
      notes: p.notes,
      receivedBy: `${p.receivedBy.firstName} ${p.receivedBy.lastName}`,
      // What the money paid when the receipt was issued; later credit applications are not on it.
      lines: p.allocations
        .filter((a) => !a.fromCredit)
        .map((a) => ({ student: `${a.charge.student.firstName} ${a.charge.student.lastName}`, label: a.charge.label, amount: a.amount })),
      voided: p.voidedAt ? { at: p.voidedAt, reason: p.voidReason } : null,
    };
  }
}
