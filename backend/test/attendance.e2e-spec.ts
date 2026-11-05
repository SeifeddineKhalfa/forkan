import type { INestApplication } from '@nestjs/common';
import { todayInSchool } from '../src/common/dates.js';
import type { PrismaClient } from '../src/generated/prisma/client.js';
import { type Agent, bootApp, createUser, ensureSchool, H, loginAs, newPrisma } from './helpers.js';

const WEEK = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
const iso = (d: Date) => d.toISOString().slice(0, 10);

/** Slice 5 acceptance rules (spec B, Slice 5 "Done when") and spec A5 attendance. */
describe('Attendance (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let staff: Agent;
  let habiba: Agent;
  let adel: Agent;
  let yearId: string;
  let schoolId: string;

  const today = todayInSchool();
  const nextWeek = new Date(today.getTime() + 7 * 86_400_000);

  beforeAll(async () => {
    prisma = newPrisma();
    const { school, year } = await ensureSchool(prisma);
    yearId = year.id;
    schoolId = school.id;
    await createUser(prisma, school.id, 'staff-s5@e2e.local', 'STAFF');
    const u1 = await createUser(prisma, school.id, 'habiba-s5@e2e.local', 'TEACHER');
    const u2 = await createUser(prisma, school.id, 'adel-s5@e2e.local', 'TEACHER');
    await prisma.teacher.create({ data: { schoolId, userId: u1.id, firstName: 'حبيبة', lastName: 'نصري', gender: 'FEMALE', title: 'المؤدّبة' } });
    await prisma.teacher.create({ data: { schoolId, userId: u2.id, firstName: 'عادل', lastName: 'بليلة', gender: 'MALE', title: 'الشيخ' } });
    app = await bootApp();
    staff = await loginAs(app, 'staff-s5@e2e.local');
    habiba = await loginAs(app, 'habiba-s5@e2e.local');
    adel = await loginAs(app, 'adel-s5@e2e.local');
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  let habibaClass: string;
  let adelClass: string;
  const students: string[] = [];

  it('sets up one imla per teacher, meeting today, with three students', async () => {
    const teacherId = async (email: string) =>
      (await prisma.teacher.findFirstOrThrow({ where: { user: { email } } })).id;
    const slot = { day: WEEK[today.getUTCDay()], kind: 'MEMORIZATION', startTime: '15:30', endTime: '17:00', timeLabel: 'بعد العصر' };
    habibaClass = (
      await staff
        .post('/api/classes')
        .set(H)
        .send({
          academicYearId: yearId,
          name: 'إملاء الأطفال (S5)',
          audience: 'CHILDREN',
          slots: [slot],
          teachers: [{ teacherId: await teacherId('habiba-s5@e2e.local'), role: 'MAIN' }],
        })
        .expect(201)
    ).body.id;
    adelClass = (
      await staff
        .post('/api/classes')
        .set(H)
        .send({
          academicYearId: yearId,
          name: 'حصّة المراجعة (S5)',
          audience: 'ADULTS',
          slots: [slot],
          teachers: [{ teacherId: await teacherId('adel-s5@e2e.local'), role: 'MAIN' }],
        })
        .expect(201)
    ).body.id;

    for (const [i, name] of ['أيوب', 'بلال', 'جنى'].entries()) {
      const s = await staff
        .post('/api/students')
        .set(H)
        .send({
          firstName: name,
          lastName: 'الحاج',
          gender: i === 2 ? 'FEMALE' : 'MALE',
          dateOfBirth: '2016-05-05',
          guardians: [{ guardian: { fullName: 'كمال الحاج', phone: `29 00${i} 000` }, relation: 'FATHER', isPrimary: true }],
        })
        .expect(201);
      students.push(s.body.id);
      await staff.post('/api/enrollments').set(H).send({ studentId: s.body.id, classId: habibaClass, startDate: '2026-09-15' }).expect(201);
    }
  });

  it("shows a teacher only her own imla'at today and forbids a colleague's (403)", async () => {
    const day = await habiba.get('/api/attendance/day').expect(200);
    expect(day.body.items.map((i: { class: { id: string } }) => i.class.id)).toEqual([habibaClass]);
    expect(day.body.items[0]).toMatchObject({ startTime: '15:30', session: null, slot: { timeLabel: 'بعد العصر' } });
    const other = await adel.get('/api/attendance/day').expect(200);
    expect(other.body.items.map((i: { class: { id: string } }) => i.class.id)).toEqual([adelClass]);

    const forbidden = await habiba
      .post('/api/sessions/open')
      .set(H)
      .send({ classId: adelClass, date: iso(today), startTime: '15:30' })
      .expect(403);
    expect(forbidden.body.code).toBe('NOT_YOUR_CLASS');
    await habiba.get(`/api/classes/${adelClass}/attendance`).expect(403);
  });

  let sessionId: string;

  it('opens the session on demand, once, with the roster and no phones for teachers', async () => {
    const open = await habiba.post('/api/sessions/open').set(H).send({ classId: habibaClass, date: iso(today), startTime: '15:30', endTime: '17:00' }).expect(200);
    sessionId = open.body.id;
    expect(open.body.roster).toHaveLength(3);
    expect(open.body.roster[0].guardians).toBeUndefined();
    expect(open.body.teacher.firstName).toBe('حبيبة');
    const again = await habiba.post('/api/sessions/open').set(H).send({ classId: habibaClass, date: iso(today), startTime: '15:30' }).expect(200);
    expect(again.body.id).toBe(sessionId);

    const asStaff = await staff.get(`/api/sessions/${sessionId}`).expect(200);
    expect(asStaff.body.roster[0].guardians[0].guardian.phone).toMatch(/^\+216/);

    const future = await habiba.post('/api/sessions/open').set(H).send({ classId: habibaClass, date: iso(nextWeek), startTime: '15:30' }).expect(422);
    expect(future.body.code).toBe('FUTURE_SESSION');
  });

  it('saves the sheet and rejects students outside the imla', async () => {
    const res = await habiba
      .put(`/api/sessions/${sessionId}/attendance`)
      .set(H)
      .send({
        entries: [
          { studentId: students[0], status: 'PRESENT' },
          { studentId: students[1], status: 'ABSENT' },
          { studentId: students[2], status: 'LATE', note: '10 دقائق' },
        ],
      })
      .expect(200);
    expect(res.body.roster.map((s: { attendance: { status: string } }) => s.attendance.status).sort()).toEqual(['ABSENT', 'LATE', 'PRESENT']);

    const other = await prisma.student.create({
      data: { schoolId, code: 'S5-OUTSIDE', firstName: 'غريب', lastName: 'الإملاء', gender: 'MALE', joinedAt: today },
    });
    const bad = await habiba
      .put(`/api/sessions/${sessionId}/attendance`)
      .set(H)
      .send({ entries: [{ studentId: other.id, status: 'PRESENT' }] })
      .expect(422);
    expect(bad.body.code).toBe('STUDENT_NOT_IN_CLASS');

    const day = await habiba.get('/api/attendance/day').expect(200);
    expect(day.body.items[0].session.counts).toEqual({ PRESENT: 1, ABSENT: 1, LATE: 1, EXCUSED: 0 });
  });

  it('cancels next week with a reason and prepares the announcement', async () => {
    const res = await habiba
      .post('/api/sessions/cancel')
      .set(H)
      .send({ classId: habibaClass, date: iso(nextWeek), startTime: '15:30', reason: 'مرض', resumeDate: iso(new Date(nextWeek.getTime() + 7 * 86_400_000)) })
      .expect(200);
    expect(res.body.session).toMatchObject({ status: 'CANCELLED', cancelReason: 'مرض' });
    expect(res.body.announcement).toMatch(/^السلام عليكم، تتغيّب المؤدّبة حبيبة نصري عن إملاء الأطفال \(S5\) يوم .+، وتستأنف الحصص يوم .+\.$/);
    await habiba
      .put(`/api/sessions/${res.body.session.id}/attendance`)
      .set(H)
      .send({ entries: [{ studentId: students[0], status: 'PRESENT' }] })
      .expect(422);

    // Teachers prepare the text; publishing on the site is office work.
    await habiba.post(`/api/sessions/${res.body.session.id}/publish`).set(H).send({ title: 'إعلام', text: res.body.announcement }).expect(403);
    const post = await staff.post(`/api/sessions/${res.body.session.id}/publish`).set(H).send({ title: 'إعلام', text: res.body.announcement }).expect(201);
    const saved = await prisma.newsPost.findUniqueOrThrow({ where: { id: post.body.id } });
    expect(saved).toMatchObject({ status: 'PUBLISHED', classId: habibaClass, category: 'ANNOUNCEMENT' });
  });

  it('reports history and rates without cancelled sessions', async () => {
    const history = await habiba.get(`/api/classes/${habibaClass}/attendance?to=${iso(nextWeek)}`).expect(200);
    expect(history.body.sessions).toHaveLength(2);
    expect(history.body.rate).toBeCloseTo(2 / 3, 2);
    const late = history.body.students.find((s: { id: string }) => s.id === students[2]);
    expect(late).toMatchObject({ rate: 1, counts: { LATE: 1 } });

    const student = await staff.get(`/api/students/${students[1]}/attendance`).expect(200);
    expect(student.body).toMatchObject({ rate: 0, counts: { ABSENT: 1 } });
    await habiba.get(`/api/students/${students[1]}/attendance`).expect(403);

    const summary = await habiba.get('/api/attendance/summary').expect(200);
    expect(summary.body.classes).toHaveLength(1);
    expect(summary.body.classes[0]).toMatchObject({ id: habibaClass, held: 1 });
  });
});
