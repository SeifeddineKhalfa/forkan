import type { INestApplication } from '@nestjs/common';
import type { PrismaClient } from '../src/generated/prisma/client.js';
import { type Agent, bootApp, createUser, ensureSchool, H, loginAs, newPrisma } from './helpers.js';

/** Slice 3 acceptance rules (spec B, Slice 3 "Done when"). */
describe('Fees, charges and memberships (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let admin: Agent;
  let staff: Agent;
  let yearId: string;

  beforeAll(async () => {
    prisma = newPrisma();
    const { school, year } = await ensureSchool(prisma);
    yearId = year.id;
    await createUser(prisma, school.id, 'admin-s3@e2e.local', 'ADMIN');
    await createUser(prisma, school.id, 'staff-s3@e2e.local', 'STAFF');
    app = await bootApp();
    admin = await loginAs(app, 'admin-s3@e2e.local');
    staff = await loginAs(app, 'staff-s3@e2e.local');
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  const createClass = async (name: string, monthlyFee: string | null) =>
    (
      await staff
        .post('/api/classes')
        .set(H)
        .send({ academicYearId: yearId, name, audience: 'CHILDREN', monthlyFee })
        .expect(201)
    ).body.id as string;

  const enroll = async (studentId: string, classId: string, monthlyFeeOverride?: string) =>
    (
      await staff
        .post('/api/enrollments')
        .set(H)
        .send({ studentId, classId, startDate: '2026-09-15', monthlyFeeOverride })
        .expect(201)
    ).body.id as string;

  let paidClass: string;
  let freeClass: string;
  let sister: string;
  let brother: string;
  let guardianId: string;

  it('sets up a family of two in a paid imla, one with a free place, and a free imla', async () => {
    paidClass = await createClass('إملاء السبت – أطفال (S3)', '15.000');
    freeClass = await createClass('إملاء المراجعة (S3)', null);

    const first = await staff
      .post('/api/students')
      .set(H)
      .send({
        firstName: 'مريم',
        lastName: 'بن صالح',
        gender: 'FEMALE',
        dateOfBirth: '2015-05-01',
        guardians: [{ guardian: { fullName: 'سامي بن صالح', phone: '98 765 432' }, relation: 'FATHER', isPrimary: true, isPayer: true }],
      })
      .expect(201);
    sister = first.body.id;
    guardianId = first.body.guardians[0].guardianId;
    const second = await staff
      .post('/api/students')
      .set(H)
      .send({
        firstName: 'عمر',
        lastName: 'بن صالح',
        gender: 'MALE',
        dateOfBirth: '2017-02-01',
        guardians: [{ guardianId, relation: 'FATHER', isPrimary: true, isPayer: true }],
      })
      .expect(201);
    brother = second.body.id;

    await enroll(sister, paidClass);
    await enroll(sister, freeClass);
    await enroll(brother, paidClass, '0'); // free place
  });

  it('generates the month once: running it twice creates the charges only once', async () => {
    const first = await staff.post('/api/charges/generate-monthly').set(H).send({ period: '2026-11' }).expect(200);
    expect(first.body.created).toBeGreaterThanOrEqual(1);
    const again = await staff.post('/api/charges/generate-monthly').set(H).send({ period: '2026-11' }).expect(200);
    expect(again.body.created).toBe(0);
    expect(again.body.existing).toBe(first.body.created + first.body.existing);

    // Free imla' and free place: no charge. Paid imla': exactly one.
    const sisterCharges = await prisma.charge.findMany({ where: { studentId: sister, kind: 'MONTHLY' } });
    expect(sisterCharges).toHaveLength(1);
    expect(sisterCharges[0]).toMatchObject({ label: 'معلوم شهر نوفمبر 2026 – إملاء السبت – أطفال (S3)' });
    expect(sisterCharges[0].amount.toFixed(3)).toBe('15.000');
    expect(await prisma.charge.count({ where: { studentId: brother } })).toBe(0);

    // July is not a billable month.
    const july = await staff.post('/api/charges/generate-monthly').set(H).send({ period: '2027-07' }).expect(200);
    expect(july.body.created).toBe(0);
  });

  it('creates one-off charges from the catalog, per student and in bulk without duplicates', async () => {
    const books = await staff.post('/api/fee-items').set(H).send({ name: 'كتب (S3)', defaultAmount: '8.500' }).expect(201);
    const one = await staff.post('/api/charges').set(H).send({ studentId: sister, feeItemId: books.body.id }).expect(201);
    expect(one.body).toMatchObject({ kind: 'ONE_OFF', label: 'كتب (S3)', amount: '8.5' });

    const bulk = await staff.post('/api/charges/bulk').set(H).send({ classId: paidClass, feeItemId: books.body.id }).expect(201);
    expect(bulk.body).toEqual({ created: 1, skipped: 1 }); // the sister already has it

    const bad = await staff.post('/api/charges').set(H).send({ studentId: sister, label: 'رحلة' }).expect(400);
    expect(bad.body.code).toBe('VALIDATION_FAILED');
  });

  it('shows student and family balances', async () => {
    const account = await staff.get(`/api/students/${sister}/account`).expect(200);
    expect(account.body.balance).toBe('23.5'); // 15 + 8.5
    expect(account.body.family.guardian.id).toBe(guardianId);
    expect(account.body.family.balance).toBe('32'); // + brother's books
    expect(account.body.credit).toBe('0');

    const open = await staff.get(`/api/charges?studentId=${sister}&state=OPEN`).expect(200);
    expect(open.body.total).toBe(2);
  });

  it('lets only ADMIN cancel a charge, with a reason', async () => {
    const charge = await prisma.charge.findFirstOrThrow({ where: { studentId: brother } });
    await staff.post(`/api/charges/${charge.id}/cancel`).set(H).send({ reason: 'خطأ في التسجيل' }).expect(403);
    const res = await admin.post(`/api/charges/${charge.id}/cancel`).set(H).send({ reason: 'خطأ في التسجيل' }).expect(200);
    expect(res.body).toMatchObject({ status: 'CANCELLED', cancelReason: 'خطأ في التسجيل' });
    const account = await staff.get(`/api/students/${brother}/account`).expect(200);
    expect(account.body.balance).toBe('0');
  });

  it('registers a membership once per year, with a member number and a MEMBERSHIP charge', async () => {
    const none = await staff.post('/api/memberships').set(H).send({ studentId: sister }).expect(422);
    expect(none.body.code).toBe('NO_MEMBERSHIP_THIS_YEAR');
    await admin
      .patch(`/api/academic-years/${yearId}`)
      .set(H)
      .send({ membershipFee: '20.000', membershipWindowStart: '2026-11-01', membershipWindowEnd: '2027-01-30' })
      .expect(200);

    const missingBefore = await staff.get('/api/memberships/missing').expect(200);
    expect(missingBefore.body.map((s: { id: string }) => s.id)).toEqual(expect.arrayContaining([sister, brother]));

    const m = await staff.post('/api/memberships').set(H).send({ studentId: sister, formReceived: true }).expect(201);
    expect(m.body).toMatchObject({ isNew: true, formReceived: true });
    expect(m.body.memberNumber).toMatch(/^\d{3}$/);
    expect(m.body.charge).toMatchObject({ kind: 'MEMBERSHIP', label: 'معلوم الانخراط 2026-2027', amount: '20' });

    const twice = await staff.post('/api/memberships').set(H).send({ studentId: sister }).expect(409);
    expect(twice.body.code).toBe('ALREADY_MEMBER');

    const list = await staff.get('/api/memberships?state=UNPAID').expect(200);
    expect(list.body.items.map((i: { studentId: string }) => i.studentId)).toContain(sister);
    expect(list.body.summary.total).toBeGreaterThanOrEqual(1);

    // Roster badge data: the sister is a member, the brother is not.
    const roster = await staff.get(`/api/classes/${paidClass}`).expect(200);
    const byId = new Map(roster.body.enrollments.map((e: { student: { id: string; memberships: unknown[] } }) => [e.student.id, e.student]));
    expect((byId.get(sister) as { memberships: unknown[] }).memberships).toHaveLength(1);
    expect((byId.get(brother) as { memberships: unknown[] }).memberships).toHaveLength(0);
  });

  it('cancelling the membership charge removes the membership so it can be registered again', async () => {
    const membership = await prisma.membership.findFirstOrThrow({ where: { studentId: sister } });
    await admin.post(`/api/charges/${membership.chargeId}/cancel`).set(H).send({ reason: 'تسجيل خاطئ' }).expect(200);
    expect(await prisma.membership.count({ where: { studentId: sister } })).toBe(0);
    await staff.post('/api/memberships').set(H).send({ studentId: sister }).expect(201);
  });
});
