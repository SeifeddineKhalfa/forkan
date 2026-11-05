import type { INestApplication } from '@nestjs/common';
import { todayInSchool } from '../src/common/dates.js';
import type { PrismaClient } from '../src/generated/prisma/client.js';
import { type Agent, bootApp, createUser, ensureSchool, H, loginAs, newPrisma } from './helpers.js';

const iso = (d: Date) => d.toISOString().slice(0, 10);

/** Slice 6 acceptance rules (spec B, Slice 6 "Done when") on the seeded Qalun data. */
describe('Hifz (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let staff: Agent;
  let teacher: Agent;
  let stranger: Agent;
  let classId: string;
  const students: string[] = [];
  const today = iso(todayInSchool());

  beforeAll(async () => {
    prisma = newPrisma();
    const { school, year } = await ensureSchool(prisma);
    await createUser(prisma, school.id, 'staff-s6@e2e.local', 'STAFF');
    const u = await createUser(prisma, school.id, 'amina-s6@e2e.local', 'TEACHER');
    const u2 = await createUser(prisma, school.id, 'other-s6@e2e.local', 'TEACHER');
    const amina = await prisma.teacher.create({ data: { schoolId: school.id, userId: u.id, firstName: 'أمينة', lastName: 'بن يونس', gender: 'FEMALE' } });
    await prisma.teacher.create({ data: { schoolId: school.id, userId: u2.id, firstName: 'آخر', lastName: 'مؤدّب', gender: 'MALE' } });
    app = await bootApp();
    staff = await loginAs(app, 'staff-s6@e2e.local');
    teacher = await loginAs(app, 'amina-s6@e2e.local');
    stranger = await loginAs(app, 'other-s6@e2e.local');

    classId = (
      await staff
        .post('/api/classes')
        .set(H)
        .send({ academicYearId: year.id, name: 'إملاء جزء عمّ (S6)', audience: 'ADULTS', riwaya: 'QALUN', teachers: [{ teacherId: amina.id, role: 'MAIN' }] })
        .expect(201)
    ).body.id;
    for (const name of ['سلمى', 'نوال', 'ريم']) {
      const s = await staff.post('/api/students').set(H).send({ firstName: name, lastName: 'العيّاري', gender: 'FEMALE', dateOfBirth: '1995-01-01' }).expect(201);
      students.push(s.body.id);
      await staff.post('/api/enrollments').set(H).send({ studentId: s.body.id, classId, startDate: '2026-09-15' }).expect(201);
    }
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  const record = (agent: Agent, studentId: string, entries: unknown[], date = today) =>
    agent.post('/api/hifz/sessions').set(H).send({ studentId, date, entries });
  const summaryOf = async (studentId: string) => {
    const res = await staff.get(`/api/students/${studentId}/hifz`).expect(200);
    const { memorizedAyahs, memorizedAthman, completedAhzab, coverage } = res.body.summary;
    return { memorizedAyahs, memorizedAthman, completedAhzab, coverage };
  };

  it('serves the Qalun reference data, flagged as not verified yet', async () => {
    const meta = await teacher.get('/api/quran/meta').expect(200);
    expect(meta.body).toMatchObject({ riwaya: 'QALUN', verified: false });
    expect(meta.body.surahs).toHaveLength(114);
    expect(meta.body.surahs[1]).toMatchObject({ nameAr: 'البقرة', ayahCount: 285 });
    expect(meta.body.athman).toHaveLength(480);
  });

  it('gives the same summary for hizb 60 by thumn, by surahs (backwards) and by ayah range', async () => {
    await record(teacher, students[0], [{ type: 'NEW', range: { mode: 'THUMN', fromThumn: 473, toThumn: 480 } }]).expect(201);
    // Kuttab order: An-Nas first, one session per day, ending at Al-A'la.
    let day = 20;
    for (let s = 114; s >= 87; s -= 7) {
      const to = Math.max(s - 6, 87);
      await record(staff, students[1], [{ type: 'NEW', range: { mode: 'SURAH', fromSurah: s, toSurah: to } }], `2026-10-${String(day++).padStart(2, '0')}`).expect(201);
    }
    await record(teacher, students[2], [
      { type: 'NEW', range: { mode: 'AYAH', fromSurah: 87, fromAyah: 1, toSurah: 114, toAyah: 6 } },
    ]).expect(201);

    const a = await summaryOf(students[0]);
    expect(a).toMatchObject({ memorizedAthman: 8, completedAhzab: 1 });
    expect(await summaryOf(students[1])).toEqual(a);
    expect(await summaryOf(students[2])).toEqual(a);
  });

  it('shows the 60-hizb grid and the current position', async () => {
    const res = await teacher.get(`/api/students/${students[0]}/hifz`).expect(200);
    expect(res.body.athman).toHaveLength(480);
    expect(res.body.athman.slice(472)).toBe('22222222');
    expect(res.body.athman.slice(0, 472)).toMatch(/^0+$/);
    expect(res.body.summary.position).toEqual({ hizb: 60, thumn: 8 });
    expect(res.body.verified).toBe(false);
  });

  it('counts revisions without adding to memorization, and accepts an initial level', async () => {
    const before = await summaryOf(students[0]);
    await record(teacher, students[0], [
      { type: 'RECENT_REVISION', range: { mode: 'SURAH', fromSurah: 1, toSurah: 2 }, rating: 4 },
    ]).expect(201);
    const after = await staff.get(`/api/students/${students[0]}/hifz`).expect(200);
    expect(after.body.summary).toMatchObject({ memorizedAthman: before.memorizedAthman, lastRevisionAt: `${today}T00:00:00.000Z` });

    // Prior memorization typed by the office: hizb 59 (athman 465–472).
    await record(staff, students[0], [{ type: 'INITIAL_LEVEL', range: { mode: 'THUMN', fromThumn: 465, toThumn: 472 } }]).expect(201);
    expect(await summaryOf(students[0])).toMatchObject({ completedAhzab: 2, memorizedAthman: 16 });
  });

  it('rejects positions that do not exist in Qalun numbering and future dates', async () => {
    const bad = await record(teacher, students[0], [{ type: 'NEW', range: { mode: 'AYAH', fromSurah: 2, fromAyah: 280, toSurah: 2, toAyah: 286 } }]).expect(422);
    expect(bad.body.code).toBe('INVALID_AYAH');
    const future = await record(teacher, students[0], [{ type: 'NEW', range: { mode: 'SURAH', fromSurah: 1, toSurah: 1 } }], '2099-01-01').expect(422);
    expect(future.body.code).toBe('FUTURE_DATE');
  });

  it("keeps teachers to their own students and imla'at", async () => {
    const res = await record(stranger, students[0], [{ type: 'NEW', range: { mode: 'SURAH', fromSurah: 1, toSurah: 1 } }]).expect(403);
    expect(res.body.code).toBe('NOT_YOUR_STUDENT');
    await stranger.get(`/api/students/${students[0]}/hifz`).expect(403);
    await stranger.get(`/api/classes/${classId}/hifz`).expect(403);
  });

  it('recomputes the summary when a session is deleted', async () => {
    const res = await record(teacher, students[2], [{ type: 'NEW', range: { mode: 'SURAH', fromSurah: 1, toSurah: 1 } }]).expect(201);
    expect((await summaryOf(students[2])).memorizedAyahs).toBe((await summaryOf(students[1])).memorizedAyahs + 7);
    await stranger.delete(`/api/hifz/sessions/${res.body.id}`).set(H).expect(403);
    await teacher.delete(`/api/hifz/sessions/${res.body.id}`).set(H).expect(204);
    expect(await summaryOf(students[2])).toEqual(await summaryOf(students[1]));
  });

  it("gives the imla' overview and its PDF report", async () => {
    const res = await teacher.get(`/api/classes/${classId}/hifz`).expect(200);
    expect(res.body.students).toHaveLength(3);
    const backwards = res.body.students.find((s: { id: string }) => s.id === students[1]);
    expect(backwards.summary).toMatchObject({ completedAhzab: 1, position: { hizb: 60, thumn: 1 } });
    expect(backwards.summary.daysSinceNew).toBeGreaterThan(0);

    const pdf = await teacher.get(`/api/classes/${classId}/hifz/report.pdf`).responseType('blob').expect(200);
    expect(pdf.body.subarray(0, 4).toString()).toBe('%PDF');
  }, 30_000);
});
