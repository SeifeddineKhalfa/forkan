import {
  chargeState,
  decideMonthly,
  type EnrollmentForBilling,
  isBillable,
  monthlyAmount,
  monthlyDueDate,
  parsePeriod,
} from './billing.js';

const d = (s: string) => new Date(`${s}T00:00:00.000Z`);
const settings = { billingDay: 1, paymentDueDays: 10 };
const year = { startDate: d('2026-09-01'), endDate: d('2027-06-30'), billableMonths: [9, 10, 11, 12, 1, 2, 3, 4, 5, 6] };

const enrollment = (over: Partial<EnrollmentForBilling> = {}): EnrollmentForBilling => ({
  id: 'e1',
  studentId: 's1',
  startDate: d('2026-09-15'),
  endDate: null,
  monthlyFeeOverride: null,
  class: { name: 'إملاء الأطفال', monthlyFee: '15.000', academicYear: year },
  ...over,
});

describe('monthlyAmount', () => {
  it('uses the class fee, and the override wins', () => {
    expect(monthlyAmount('15', null)?.toFixed(3)).toBe('15.000');
    expect(monthlyAmount('15', '7.5')?.toFixed(3)).toBe('7.500');
  });

  it('treats null and 0 as free, including a free place in a paid imla', () => {
    expect(monthlyAmount(null, null)).toBeNull();
    expect(monthlyAmount('0', null)).toBeNull();
    expect(monthlyAmount('15', '0')).toBeNull();
  });
});

describe('isBillable', () => {
  it('follows the year months and bounds', () => {
    expect(isBillable(parsePeriod('2026-11'), year)).toBe(true);
    expect(isBillable(parsePeriod('2027-07'), year)).toBe(false); // not a billable month
    expect(isBillable(parsePeriod('2026-06'), year)).toBe(false); // before the year
    expect(isBillable(parsePeriod('2027-06'), year)).toBe(true);
  });
});

describe('decideMonthly', () => {
  it('charges a paid enrollment with an Arabic label and due date', () => {
    const r = decideMonthly(enrollment(), parsePeriod('2026-11'), settings);
    expect(r).toEqual({
      kind: 'CHARGE',
      data: {
        enrollmentId: 'e1',
        studentId: 's1',
        period: d('2026-11-01'),
        label: 'معلوم شهر نوفمبر 2026 – إملاء الأطفال',
        amount: '15.000',
        dueDate: d('2026-11-11'),
      },
    });
  });

  it('skips free imla, free places, months outside the enrollment and non-billable months', () => {
    const nov = parsePeriod('2026-11');
    expect(decideMonthly(enrollment({ class: { ...enrollment().class, monthlyFee: null } }), nov, settings).kind).toBe('FREE');
    expect(decideMonthly(enrollment({ monthlyFeeOverride: '0' }), nov, settings).kind).toBe('FREE');
    expect(decideMonthly(enrollment({ startDate: d('2026-12-02') }), nov, settings).kind).toBe('NOT_ENROLLED');
    expect(decideMonthly(enrollment({ endDate: d('2026-10-31') }), nov, settings).kind).toBe('NOT_ENROLLED');
    expect(decideMonthly(enrollment(), parsePeriod('2027-07'), settings).kind).toBe('NOT_BILLABLE');
  });

  it('charges the month an enrollment starts or ends in', () => {
    const nov = parsePeriod('2026-11');
    expect(decideMonthly(enrollment({ startDate: d('2026-11-30') }), nov, settings).kind).toBe('CHARGE');
    expect(decideMonthly(enrollment({ endDate: d('2026-11-01') }), nov, settings).kind).toBe('CHARGE');
  });
});

describe('monthlyDueDate', () => {
  it('counts from the billing day', () => {
    expect(monthlyDueDate(parsePeriod('2026-12'), { billingDay: 5, paymentDueDays: 10 })).toEqual(d('2026-12-15'));
  });
});

describe('chargeState', () => {
  const today = d('2026-11-20');
  const c = { status: 'OPEN' as const, amount: '15', paidAmount: '0', dueDate: d('2026-11-25') };
  it('derives unpaid, partial, overdue, paid and cancelled', () => {
    expect(chargeState(c, today)).toBe('UNPAID');
    expect(chargeState({ ...c, paidAmount: '5' }, today)).toBe('PARTIAL');
    expect(chargeState({ ...c, dueDate: d('2026-11-11') }, today)).toBe('OVERDUE');
    expect(chargeState({ ...c, status: 'PAID', paidAmount: '15' }, today)).toBe('PAID');
    expect(chargeState({ ...c, status: 'CANCELLED' }, today)).toBe('CANCELLED');
  });
});
