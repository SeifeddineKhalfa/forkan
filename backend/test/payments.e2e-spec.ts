import type { INestApplication } from '@nestjs/common';
import type { PrismaClient } from '../src/generated/prisma/client.js';
import { type Agent, bootApp, createUser, ensureSchool, H, loginAs, newPrisma } from './helpers.js';

/** Slice 4 acceptance rules (spec B, Slice 4 "Done when") and the ledger rules of spec A5. */
describe('Payments and receipts (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let admin: Agent;
  let staff: Agent;
  let yearId: string;

  beforeAll(async () => {
    prisma = newPrisma();
    const { school, year } = await ensureSchool(prisma);
    yearId = year.id;
    await createUser(prisma, school.id, 'admin-s4@e2e.local', 'ADMIN');
    await createUser(prisma, school.id, 'staff-s4@e2e.local', 'STAFF');
    app = await bootApp();
    admin = await loginAs(app, 'admin-s4@e2e.local');
    staff = await loginAs(app, 'staff-s4@e2e.local');
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  let guardianId: string;
  let older: string;
  let younger: string;
  let adult: string;

  const charges = (studentId: string) =>
    prisma.charge.findMany({ where: { studentId, status: { not: 'CANCELLED' } }, orderBy: [{ dueDate: 'asc' }, { createdAt: 'asc' }] });

  it('sets up a family of two with November charges and an adult student', async () => {
    const klass = await staff
      .post('/api/classes')
      .set(H)
      .send({ academicYearId: yearId, name: 'إملاء الأحد (S4)', audience: 'CHILDREN', monthlyFee: '15' })
      .expect(201);
    const a = await staff
      .post('/api/students')
      .set(H)
      .send({
        firstName: 'سارة',
        lastName: 'القاسمي',
        gender: 'FEMALE',
        dateOfBirth: '2014-01-01',
        guardians: [{ guardian: { fullName: 'نور الدين القاسمي', phone: '25 111 222' }, relation: 'FATHER', isPrimary: true, isPayer: true }],
      })
      .expect(201);
    older = a.body.id;
    guardianId = a.body.guardians[0].guardianId;
    const b = await staff
      .post('/api/students')
      .set(H)
      .send({
        firstName: 'يحيى',
        lastName: 'القاسمي',
        gender: 'MALE',
        dateOfBirth: '2016-01-01',
        guardians: [{ guardianId, relation: 'FATHER', isPrimary: true, isPayer: true }],
      })
      .expect(201);
    younger = b.body.id;
    const c = await staff
      .post('/api/students')
      .set(H)
      .send({ firstName: 'هالة', lastName: 'الكبيرة', gender: 'FEMALE', dateOfBirth: '1980-01-01', phone: '50 333 444' })
      .expect(201);
    adult = c.body.id;

    for (const s of [older, younger]) {
      await staff.post('/api/enrollments').set(H).send({ studentId: s, classId: klass.body.id, startDate: '2026-09-01' }).expect(201);
    }
    await staff.post('/api/charges/generate-monthly').set(H).send({ period: '2026-10' }).expect(200);
    await staff.post('/api/charges/generate-monthly').set(H).send({ period: '2026-11' }).expect(200);
    expect(await charges(older)).toHaveLength(2);
  });

  it('records a family payment oldest charges first, with a receipt number', async () => {
    const open = await staff.get(`/api/payments/open-charges?payerGuardianId=${guardianId}`).expect(200);
    expect(open.body.charges).toHaveLength(4);
    expect(open.body.payer).toMatchObject({ type: 'GUARDIAN', name: 'نور الدين القاسمي' });

    const res = await staff.post('/api/payments').set(H).send({ payerGuardianId: guardianId, amount: '40' }).expect(201);
    expect(res.body.receiptNumber).toMatch(/^\d{4}-\d{5}$/);
    expect(res.body.unallocatedAmount).toBe('0');
    expect(res.body.publicPath).toMatch(/^\/r\/[\w-]{32}$/);
    // Both October charges (15 + 15), then 10 on the oldest November one.
    const all = [...(await charges(older)), ...(await charges(younger))].sort((x, y) => +x.dueDate - +y.dueDate);
    expect(all.map((c) => [c.status, c.paidAmount.toFixed(0)])).toEqual(
      expect.arrayContaining([
        ['PAID', '15'],
        ['PAID', '15'],
        ['OPEN', '10'],
        ['OPEN', '0'],
      ]),
    );
    const account = await staff.get(`/api/students/${older}/account`).expect(200);
    expect(account.body.family.balance).toBe('20');
  });

  it('keeps an overpayment as family credit and applies it to the next charge', async () => {
    const res = await staff.post('/api/payments').set(H).send({ payerGuardianId: guardianId, amount: '30', method: 'MOBILE', reference: 'D17-778' }).expect(201);
    expect(res.body.unallocatedAmount).toBe('10');
    let account = await staff.get(`/api/students/${younger}/account`).expect(200);
    expect(account.body).toMatchObject({ credit: '10' });
    expect(account.body.family.balance).toBe('0');

    // A new one-off charge is paid from the credit, with no new receipt.
    const before = await prisma.payment.count();
    await staff.post('/api/charges').set(H).send({ studentId: younger, label: 'رحلة', amount: '12' }).expect(201);
    expect(await prisma.payment.count()).toBe(before);
    const trip = (await charges(younger)).find((c) => c.label === 'رحلة')!;
    expect(trip.paidAmount.toFixed(0)).toBe('10');
    const alloc = await prisma.paymentAllocation.findFirstOrThrow({ where: { chargeId: trip.id } });
    expect(alloc.fromCredit).toBe(true);
    account = await staff.get(`/api/students/${younger}/account`).expect(200);
    expect(account.body.credit).toBe('0');
    expect(account.body.balance).toBe('2');
  });

  it('accepts a manual split and rejects an impossible one', async () => {
    const trip = (await charges(younger)).find((c) => c.label === 'رحلة')!;
    const bad = await staff
      .post('/api/payments')
      .set(H)
      .send({ payerGuardianId: guardianId, amount: '5', allocations: [{ chargeId: trip.id, amount: '3' }] })
      .expect(422);
    expect(bad.body.code).toBe('ALLOCATION_EXCEEDS_CHARGE');
    const ok = await staff
      .post('/api/payments')
      .set(H)
      .send({ payerGuardianId: guardianId, amount: '2', allocations: [{ chargeId: trip.id, amount: '2' }] })
      .expect(201);
    expect(ok.body.allocations).toHaveLength(1);
    expect((await prisma.charge.findUniqueOrThrow({ where: { id: trip.id } })).status).toBe('PAID');
  });

  it('lets only ADMIN void a payment: charges reopen and the number stays', async () => {
    const first = await prisma.payment.findFirstOrThrow({ where: { payerGuardianId: guardianId }, orderBy: { paidAt: 'asc' } });
    await staff.post(`/api/payments/${first.id}/void`).set(H).send({ reason: 'خطأ في المبلغ' }).expect(403);
    const res = await admin.post(`/api/payments/${first.id}/void`).set(H).send({ reason: 'خطأ في المبلغ' }).expect(200);
    expect(res.body).toMatchObject({ receiptNumber: first.receiptNumber, voidReason: 'خطأ في المبلغ' });
    expect(res.body.voidedAt).toBeTruthy();
    await admin.post(`/api/payments/${first.id}/void`).set(H).send({ reason: 'مرة ثانية' }).expect(409);

    // The 40 TND are owed again (October charges reopened).
    const account = await staff.get(`/api/students/${older}/account`).expect(200);
    expect(account.body.family.balance).toBe('40');
  });

  it('gives 20 concurrent payments 20 consecutive receipt numbers', async () => {
    const results = await Promise.all(
      Array.from({ length: 20 }, () => staff.post('/api/payments').set(H).send({ payerStudentId: adult, amount: '1' })),
    );
    expect(results.map((r) => r.status)).toEqual(Array(20).fill(201));
    const numbers = results.map((r) => Number(r.body.receiptNumber.split('-')[1])).sort((a, b) => a - b);
    expect(new Set(numbers).size).toBe(20);
    expect(numbers[19] - numbers[0]).toBe(19);
  });

  it('voids a payment only once when two voids race (no double reversal)', async () => {
    const paid = await staff.post('/api/payments').set(H).send({ payerStudentId: adult, amount: '2' }).expect(201);
    const results = await Promise.all(
      Array.from({ length: 3 }, () => admin.post(`/api/payments/${paid.body.id}/void`).set(H).send({ reason: 'سباق' })),
    );
    expect(results.map((r) => r.status).sort()).toEqual([200, 409, 409]);
    const allocations = await prisma.paymentAllocation.findMany({ where: { paymentId: paid.body.id } });
    for (const a of allocations) {
      const c = await prisma.charge.findUniqueOrThrow({ where: { id: a.chargeId } });
      expect(Number(c.paidAmount)).toBeGreaterThanOrEqual(0);
    }
  });

  it('keeps an imla\'s fee, capacity and policy when only deactivating it', async () => {
    const klass = await staff
      .post('/api/classes')
      .set(H)
      .send({ academicYearId: yearId, name: 'إملاء الإيقاف (S4)', audience: 'ADULTS', monthlyFee: '12', capacity: 40, genderPolicy: 'FEMALE_ONLY' })
      .expect(201);
    await staff.patch(`/api/classes/${klass.body.id}`).set(H).send({ isActive: false }).expect(200);
    const row = await prisma.class.findUniqueOrThrow({ where: { id: klass.body.id } });
    expect({ fee: Number(row.monthlyFee), capacity: row.capacity, policy: row.genderPolicy, active: row.isActive }).toEqual({
      fee: 12,
      capacity: 40,
      policy: 'FEMALE_ONLY',
      active: false,
    });
  });

  it('serves the receipt PDF to staff and through the public link only', { timeout: 30_000 }, async () => {
    const payment = await prisma.payment.findFirstOrThrow({ where: { payerGuardianId: guardianId, voidedAt: null } });
    const pdf = await staff.get(`/api/payments/${payment.id}/receipt.pdf`).responseType('blob').expect(200);
    expect(pdf.headers['content-type']).toBe('application/pdf');
    expect(pdf.body.subarray(0, 4).toString()).toBe('%PDF');

    const anonymous = (await import('supertest')).default(app.getHttpServer());
    const pub = await anonymous.get(`/api/r/${payment.publicToken}`).responseType('blob').expect(200);
    expect(pub.body.subarray(0, 4).toString()).toBe('%PDF');
    await anonymous.get('/api/r/not-a-real-token').expect(404);
    await anonymous.get(`/api/payments/${payment.id}/receipt.pdf`).expect(401);
  });

  it('lists overdue families for reminders and logs prepared messages', async () => {
    await staff.post('/api/charges').set(H).send({ studentId: older, label: 'كتب متأخّرة', amount: '6', dueDate: '2026-10-01' }).expect(201);
    const list = await staff.get('/api/payments/reminders?type=OVERDUE').expect(200);
    const family = list.body.find((g: { key: string }) => g.key === `GUARDIAN:${guardianId}`);
    expect(family.payer.phone).toBe('+21625111222');
    expect(family.students).toContain('سارة القاسمي');
    expect(family.lastReminderAt).toBeNull();

    await staff
      .post('/api/messages')
      .set(H)
      .send({ kind: 'PAYMENT_REMINDER', phone: family.payer.phone, body: 'تذكير', guardianId })
      .expect(201);
    const again = await staff.get('/api/payments/reminders?type=OVERDUE').expect(200);
    expect(again.body.find((g: { key: string }) => g.key === family.key).lastReminderAt).toBeTruthy();
  });

  it('summarises the month for the finance dashboard', async () => {
    const res = await staff.get('/api/finance/summary?period=2026-11').expect(200);
    expect(Number(res.body.month.billed)).toBeGreaterThanOrEqual(30);
    expect(res.body.byClass.map((c: { name: string }) => c.name)).toContain('إملاء الأحد (S4)');
    const now = await staff.get('/api/finance/summary').expect(200);
    expect(Number(now.body.collected)).toBeGreaterThan(0);
  });
});
