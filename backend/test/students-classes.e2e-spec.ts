import type { INestApplication } from '@nestjs/common';
import type { PrismaClient } from '../src/generated/prisma/client.js';
import { type Agent, bootApp, createUser, ensureSchool, H, loginAs, newPrisma } from './helpers.js';

/** Slice 1 acceptance rules (spec B, Slice 1 "Done when"). */
describe('Students, guardians, teachers, imla\'at (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let admin: Agent;
  let staff: Agent;
  let yearId: string;

  beforeAll(async () => {
    prisma = newPrisma();
    const { school, year } = await ensureSchool(prisma);
    yearId = year.id;
    await createUser(prisma, school.id, 'admin-s1@e2e.local', 'ADMIN');
    await createUser(prisma, school.id, 'staff-s1@e2e.local', 'STAFF');
    app = await bootApp();
    admin = await loginAs(app, 'admin-s1@e2e.local');
    staff = await loginAs(app, 'staff-s1@e2e.local');
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  let femaleClassId: string;
  let otherClassId: string;
  let teacherLogin: string;

  it('sets up a venue, teachers (with and without login) and imla\'at', async () => {
    const venue = await staff.post('/api/venues').set(H).send({ name: 'جامع غزة – حي النيفر' }).expect(201);
    const room = await staff.post(`/api/venues/${venue.body.id}/rooms`).set(H).send({ name: 'القاعة 1', capacity: 20 }).expect(201);

    teacherLogin = 'habiba@e2e.local';
    const habiba = await admin
      .post('/api/teachers')
      .set(H)
      .send({
        firstName: 'حبيبة',
        lastName: 'نصري',
        gender: 'FEMALE',
        title: 'المؤدّبة',
        contractType: 'PAID',
        monthlySalary: '300.000',
        login: { email: teacherLogin, temporaryPassword: 'teacher-temp-123' },
      })
      .expect(201);
    expect(habiba.body.user.email).toBe(teacherLogin);

    const sheikh = await staff
      .post('/api/teachers')
      .set(H)
      .send({ firstName: 'عادل', lastName: 'بليلة', gender: 'MALE', title: 'الشيخ' })
      .expect(201);
    expect(sheikh.body.user).toBeNull();

    // Salary is ADMIN-only: hidden from STAFF and not writable by them.
    const list = await staff.get('/api/teachers').expect(200);
    const seen = (list.body as { id: string; monthlySalary?: string }[]).find((t) => t.id === habiba.body.id)!;
    expect(seen.monthlySalary).toBeUndefined();
    await staff.patch(`/api/teachers/${habiba.body.id}`).set(H).send({ monthlySalary: '1' }).expect(403);

    await staff.post(`/api/teachers/${sheikh.body.id}/ijazas`).set(H).send({ title: 'إجازة في رواية قالون عن نافع', riwaya: 'QALUN', year: 2015 }).expect(201);

    const female = await staff
      .post('/api/classes')
      .set(H)
      .send({
        academicYearId: yearId,
        name: 'إملاء البقرة وآل عمران – طالبات',
        quranScope: 'سورة البقرة وآل عمران',
        audience: 'ADULTS',
        genderPolicy: 'FEMALE_ONLY',
        capacity: 2,
        roomId: room.body.id,
        slots: [
          { day: 'MONDAY', kind: 'REVISION', startTime: '10:00', endTime: '12:00' },
          { day: 'WEDNESDAY', kind: 'MEMORIZATION', startTime: '15:30', endTime: '17:00', timeLabel: 'بعد العصر' },
        ],
        teachers: [
          { teacherId: habiba.body.id, role: 'MAIN' },
          { teacherId: sheikh.body.id, role: 'SUPERVISOR' },
        ],
      })
      .expect(201);
    femaleClassId = female.body.id;
    expect(female.body.scheduleSlots[0].day).toBe('MONDAY');
    expect(female.body.monthlyFee).toBeNull();

    const twoMains = await staff
      .post('/api/classes')
      .set(H)
      .send({
        academicYearId: yearId,
        name: 'خطأ',
        audience: 'CHILDREN',
        teachers: [
          { teacherId: habiba.body.id, role: 'MAIN' },
          { teacherId: sheikh.body.id, role: 'MAIN' },
        ],
      })
      .expect(400);
    expect(twoMains.body.code).toBe('VALIDATION_FAILED');

    const other = await staff
      .post('/api/classes')
      .set(H)
      .send({ academicYearId: yearId, name: 'إملاء الأطفال – السبت', audience: 'CHILDREN', monthlyFee: '15', teachers: [{ teacherId: sheikh.body.id, role: 'MAIN' }] })
      .expect(201);
    otherClassId = other.body.id;
  });

  let girlId: string;

  it('requires a guardian for minors, shares guardians between siblings, and codes students', async () => {
    const noGuardian = await staff
      .post('/api/students')
      .set(H)
      .send({ firstName: 'يوسف', lastName: 'الطرابلسي', gender: 'MALE', dateOfBirth: '2016-03-10' })
      .expect(422);
    expect(noGuardian.body.code).toBe('GUARDIAN_REQUIRED');

    const first = await staff
      .post('/api/students')
      .set(H)
      .send({
        firstName: 'يوسف',
        lastName: 'الطرابلسي',
        gender: 'MALE',
        dateOfBirth: '2016-03-10',
        guardians: [{ guardian: { fullName: 'محمد الطرابلسي', phone: '22 123 456' }, relation: 'FATHER' }],
      })
      .expect(201);
    const link = first.body.guardians[0];
    expect(link.guardian.phone).toBe('+21622123456');
    expect(link.isPrimary).toBe(true);
    expect(link.isPayer).toBe(true);

    // The office looks the phone up and links the same guardian to the sister.
    const found = await staff.get('/api/guardians').query({ phone: '+216 22 123 456' }).expect(200);
    expect(found.body).toHaveLength(1);

    const sister = await staff
      .post('/api/students')
      .set(H)
      .send({
        firstName: 'مريم',
        lastName: 'الطرابلسي',
        gender: 'FEMALE',
        dateOfBirth: '2014-07-01',
        guardians: [{ guardianId: found.body[0].id, relation: 'FATHER' }],
      })
      .expect(201);
    girlId = sister.body.id;

    const shared = await staff.get('/api/guardians').query({ phone: '22123456' }).expect(200);
    expect(shared.body[0].students).toHaveLength(2);

    const adult = await staff
      .post('/api/students')
      .set(H)
      .send({ firstName: 'آمنة', lastName: 'بن يونس', gender: 'FEMALE', dateOfBirth: '1985-01-20', phone: '98 765 432' })
      .expect(201);
    expect(adult.body.guardians).toHaveLength(0);

    const codes = [first.body.code, sister.body.code, adult.body.code];
    for (const c of codes) expect(c).toMatch(/^\d{4}-\d{4}$/);
    const numbers = codes.map((c) => Number(c.split('-')[1]));
    expect(numbers[1]).toBe(numbers[0] + 1);
    expect(numbers[2]).toBe(numbers[1] + 1);

    const search = await staff.get('/api/students').query({ q: 'الطرابلسي' }).expect(200);
    expect(search.body.total).toBe(2);
    const byGuardianPhone = await staff.get('/api/students').query({ q: '22 123 456' }).expect(200);
    expect(byGuardianPhone.body.total).toBe(2);
  });

  it('enforces gender policy, capacity and duplicate enrollment', async () => {
    const boy = (await staff.get('/api/students').query({ q: 'يوسف' }).expect(200)).body.items[0];
    const wrongGender = await staff.post('/api/enrollments').set(H).send({ studentId: boy.id, classId: femaleClassId }).expect(422);
    expect(wrongGender.body.code).toBe('GENDER_POLICY_VIOLATION');

    await staff.post('/api/enrollments').set(H).send({ studentId: girlId, classId: femaleClassId }).expect(201);
    const dup = await staff.post('/api/enrollments').set(H).send({ studentId: girlId, classId: femaleClassId }).expect(409);
    expect(dup.body.code).toBe('ALREADY_ENROLLED');

    const adult = (await staff.get('/api/students').query({ q: 'آمنة' }).expect(200)).body.items[0];
    await staff.post('/api/enrollments').set(H).send({ studentId: adult.id, classId: femaleClassId }).expect(201);

    const third = await staff
      .post('/api/students')
      .set(H)
      .send({ firstName: 'سلمى', lastName: 'الحلفاوي', gender: 'FEMALE', dateOfBirth: '2000-02-02' })
      .expect(201);
    const full = await staff.post('/api/enrollments').set(H).send({ studentId: third.body.id, classId: femaleClassId }).expect(409);
    expect(full.body.code).toBe('CLASS_FULL');
    await staff.post('/api/enrollments').set(H).send({ studentId: third.body.id, classId: femaleClassId, overrideCapacity: true }).expect(403);
    await admin.post('/api/enrollments').set(H).send({ studentId: third.body.id, classId: femaleClassId, overrideCapacity: true }).expect(201);

    // A student can follow several imla'at.
    await staff.post('/api/enrollments').set(H).send({ studentId: boy.id, classId: otherClassId }).expect(201);
    const roster = await staff.get('/api/students').query({ classId: femaleClassId }).expect(200);
    expect(roster.body.total).toBe(3);
  });

  it('shows teachers only their own imla\'at and no student directory', async () => {
    const teacher = await loginAs(app, teacherLogin, 'teacher-temp-123');
    await teacher.post('/api/auth/change-password').set(H).send({ currentPassword: 'teacher-temp-123', newPassword: 'teacher-new-pass-1' }).expect(200);

    const mine = await teacher.get('/api/classes').expect(200);
    expect((mine.body as { id: string }[]).map((c) => c.id)).toEqual([femaleClassId]);
    const detail = await teacher.get(`/api/classes/${femaleClassId}`).expect(200);
    expect(detail.body.enrollments).toHaveLength(3);
    await teacher.get(`/api/classes/${otherClassId}`).expect(404);
    await teacher.get('/api/students').expect(403);
  });

  it('ends enrollments when a student leaves', async () => {
    await staff.patch(`/api/students/${girlId}`).set(H).send({ status: 'LEFT' }).expect(200);
    const student = await staff.get(`/api/students/${girlId}`).expect(200);
    expect(student.body.enrollments.every((e: { status: string }) => e.status === 'ENDED')).toBe(true);
  });
});
