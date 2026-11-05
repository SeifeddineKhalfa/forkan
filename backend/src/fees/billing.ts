import { Prisma } from '../generated/prisma/client.js';

/** Tunisian month names, as written on receipts and announcements. */
export const MONTHS_AR = [
  'جانفي',
  'فيفري',
  'مارس',
  'أفريل',
  'ماي',
  'جوان',
  'جويلية',
  'أوت',
  'سبتمبر',
  'أكتوبر',
  'نوفمبر',
  'ديسمبر',
] as const;

const DAY = 86_400_000;

/** "2026-11" → 2026-11-01 at UTC midnight (the `period` column format). */
export function parsePeriod(value: string): Date {
  return new Date(`${value}-01T00:00:00.000Z`);
}

export function formatPeriod(period: Date): string {
  return period.toISOString().slice(0, 7);
}

export function periodOf(day: Date): Date {
  return new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), 1));
}

export function lastDayOf(period: Date): Date {
  return new Date(Date.UTC(period.getUTCFullYear(), period.getUTCMonth() + 1, 0));
}

export const addDays = (d: Date, days: number) => new Date(d.getTime() + days * DAY);

export interface BillingSettings {
  billingDay: number;
  paymentDueDays: number;
}

/** Charges are issued on `billingDay` of the month and due `paymentDueDays` later. */
export function monthlyDueDate(period: Date, s: BillingSettings): Date {
  const issued = new Date(Date.UTC(period.getUTCFullYear(), period.getUTCMonth(), Math.min(s.billingDay, 28)));
  return addDays(issued, s.paymentDueDays);
}

export interface YearBilling {
  startDate: Date;
  endDate: Date;
  billableMonths: number[];
}

/** The month lies inside the academic year and is one of its billable months. */
export function isBillable(period: Date, year: YearBilling): boolean {
  return (
    year.billableMonths.includes(period.getUTCMonth() + 1) &&
    period >= periodOf(year.startDate) &&
    period <= year.endDate
  );
}

type Money = Prisma.Decimal | string | number | null | undefined;

/** The enrollment's monthly amount, or null when the place is free. Override wins (0 = free place). */
export function monthlyAmount(classFee: Money, override: Money): Prisma.Decimal | null {
  const raw = override ?? classFee;
  if (raw === null || raw === undefined) return null;
  const amount = new Prisma.Decimal(raw);
  return amount.gt(0) ? amount : null;
}

export interface EnrollmentForBilling {
  id: string;
  studentId: string;
  startDate: Date;
  endDate: Date | null;
  monthlyFeeOverride: Money;
  class: { name: string; monthlyFee: Money; academicYear: YearBilling };
}

export type MonthlyDecision =
  | { kind: 'CHARGE'; data: { enrollmentId: string; studentId: string; period: Date; label: string; amount: string; dueDate: Date } }
  | { kind: 'FREE' | 'NOT_BILLABLE' | 'NOT_ENROLLED' };

/** What the monthly job does for one enrollment and one month. Pure: the job only persists the result. */
export function decideMonthly(e: EnrollmentForBilling, period: Date, s: BillingSettings): MonthlyDecision {
  const overlaps = e.startDate <= lastDayOf(period) && (!e.endDate || e.endDate >= period);
  if (!overlaps) return { kind: 'NOT_ENROLLED' };
  if (!isBillable(period, e.class.academicYear)) return { kind: 'NOT_BILLABLE' };
  const amount = monthlyAmount(e.class.monthlyFee, e.monthlyFeeOverride);
  if (!amount) return { kind: 'FREE' };
  return {
    kind: 'CHARGE',
    data: {
      enrollmentId: e.id,
      studentId: e.studentId,
      period,
      label: `معلوم شهر ${MONTHS_AR[period.getUTCMonth()]} ${period.getUTCFullYear()} – ${e.class.name}`,
      amount: amount.toFixed(3),
      dueDate: monthlyDueDate(period, s),
    },
  };
}

export type ChargeState = 'UNPAID' | 'PARTIAL' | 'OVERDUE' | 'PAID' | 'CANCELLED';

/** Display state (spec: derived, never stored). */
export function chargeState(
  c: { status: 'OPEN' | 'PAID' | 'CANCELLED'; amount: Money; paidAmount: Money; dueDate: Date },
  today: Date,
): ChargeState {
  if (c.status === 'CANCELLED') return 'CANCELLED';
  const paid = new Prisma.Decimal(c.paidAmount ?? 0);
  if (c.status === 'PAID' || paid.gte(c.amount ?? 0)) return 'PAID';
  if (c.dueDate < today) return 'OVERDUE';
  return paid.gt(0) ? 'PARTIAL' : 'UNPAID';
}

/** Prisma filter for a display state. OPEN charges are never fully paid (payments flip them to PAID). */
export function chargeStateWhere(state: ChargeState | 'OPEN', today: Date): Prisma.ChargeWhereInput {
  switch (state) {
    case 'OPEN':
      return { status: 'OPEN' };
    case 'UNPAID':
      return { status: 'OPEN', paidAmount: 0, dueDate: { gte: today } };
    case 'PARTIAL':
      return { status: 'OPEN', paidAmount: { gt: 0 }, dueDate: { gte: today } };
    case 'OVERDUE':
      return { status: 'OPEN', dueDate: { lt: today } };
    default:
      return { status: state };
  }
}
