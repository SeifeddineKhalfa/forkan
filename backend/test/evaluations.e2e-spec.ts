import type { INestApplication } from '@nestjs/common';
import type { PrismaClient } from '../src/generated/prisma/client.js';
import { type Agent, bootApp, createUser, ensureSchool, H, loginAs, newPrisma } from './helpers.js';

/**
 * Exams & competitions on the school's «بطاقة تقييم»: one card per candidate, filled by the jury,
 * حفظ /14 + تجويد /6 = /20 by default, scale set per branch (الفرع).
 */
describe('Evaluations (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let admin: Agent;
  let staff: Agent;
  let juror: Agent;
  let stranger: Agent;
  let jurorTeacherId: string;
  let classId: string;
  const students: string[] = [];

  beforeAll(async () => {
    prisma = newPrisma();
    const { school, year } = await ensureSchool(prisma);
    await createUser(prisma, school.id, 'admin-ev@e2e.local', 'ADMIN');
    await createUser(prisma, school.id, 'staff-ev@e2e.local', 'STAFF');
    const u = await createUser(prisma, school.id, 'juror-ev@e2e.local', 'TEACHER');
    const u2 = await createUser(prisma, school.id, 'stranger-ev@e2e.local', 'TEACHER');
    jurorTeacherId = (await prisma.teacher.create({ data: { schoolId: school.id, userId: u.id, firstName: 'الشيخ', lastName: 'الحكم', gender: 'MALE' } })).id;
    await prisma.teacher.create({ data: { schoolId: school.id, userId: u2.id, firstName: 'غير', lastName: 'عضو', gender: 'MALE' } });
    app = await bootApp();
    admin = await loginAs(app, 'admin-ev@e2e.local');
    staff = await loginAs(app, 'staff-ev@e2e.local');
    juror = await loginAs(app, 'juror-ev@e2e.local');
    stranger = await loginAs(app, 'stranger-ev@e2e.local');

    classId = (await staff.post('/api/classes').set(H).send({ academicYearId: year.id, name: 'إملاء الامتحان (EV)', audience: 'ADULTS' }).expect(201)).body.id;
    for (const name of ['آمنة', 'بثينة', 'خديجة']) {
      const s = await staff.post('/api/students').set(H).send({ firstName: name, lastName: 'السليماني', gender: 'FEMALE', dateOfBirth: '1990-01-01' }).expect(201);
      students.push(s.body.id);
      await staff.post('/api/enrollments').set(H).send({ studentId: s.body.id, classId, startDate: '2026-09-15' }).expect(201);
    }
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  let evaluationId: string;
  let big: string; // 60 حزبا, school sheet scale
  let small: string; // جزء عمّ, custom scale /10, pass 5

  it('creates a competition with branches and a jury; teachers cannot set one up', async () => {
    const body = {
      kind: 'COMPETITION',
      title: 'المسابقة المولدية (EV)',
      date: '2026-08-30',
      location: 'مقر الجمعية',
      branches: [
        { name: '60 حزبا', passScore: 10 },
        { name: 'جزء عمّ', questionCount: 2, hifzMax: 7, tajwidMax: 3, passScore: 5 },
      ],
      jurors: [
        { name: 'الشيخ الحكم', teacherId: jurorTeacherId, isPresident: true },
        { name: 'ضيف من خارج الجمعية' },
      ],
    };
    await juror.post('/api/evaluations').set(H).send(body).expect(403);
    await staff.post('/api/evaluations').set(H).send({ ...body, branches: [{ name: 'أ', passScore: 21 }] }).expect(400);
    const res = await staff.post('/api/evaluations').set(H).send(body).expect(201);
    evaluationId = res.body.id;
    expect(res.body.branches.map((b: { name: string; maxTotal: string }) => [b.name, Number(b.maxTotal)])).toEqual([
      ['60 حزبا', 20],
      ['جزء عمّ', 10],
    ]);
    expect(res.body.branches[0]).toMatchObject({ questionCount: 4, hifzMax: '14', tajwidMax: '6' });
    expect(res.body.jurors).toHaveLength(2);
    [big, small] = res.body.branches.map((b: { id: string }) => b.id);
  });

  it('adds students (once), external contestants and a whole imla\', numbered in order of passage', async () => {
    const one = await staff.post(`/api/evaluations/${evaluationId}/candidates`).set(H).send({ branchId: big, studentId: students[0] }).expect(201);
    await staff.post(`/api/evaluations/${evaluationId}/candidates`).set(H).send({ branchId: big, studentId: students[0] }).expect(409);
    await staff.post(`/api/evaluations/${evaluationId}/candidates`).set(H).send({ branchId: small }).expect(400);
    await staff.post(`/api/evaluations/${evaluationId}/candidates`).set(H).send({ branchId: small, fullName: 'متسابق من خارج الجمعية', gender: 'MALE' }).expect(201);
    const bulk = await staff.post(`/api/evaluations/${evaluationId}/candidates/from-class`).set(H).send({ classId, branchId: big }).expect(201);
    expect(bulk.body).toEqual({ added: 2, skipped: 1 });

    const e = await staff.get(`/api/evaluations/${evaluationId}`).expect(200);
    expect(e.body.candidates.map((c: { number: number }) => c.number)).toEqual([1, 2, 3, 4]);
    expect(e.body.candidates[0]).toMatchObject({ id: one.body.id, fullName: 'آمنة السليماني', state: 'PENDING' });
  });

  const cardOf = async (n: number) => {
    const e = await staff.get(`/api/evaluations/${evaluationId}`).expect(200);
    return e.body.candidates.find((c: { number: number }) => c.number === n).id as string;
  };
  const save = (agent: Agent, candidateId: string, body: object) =>
    agent.put(`/api/evaluations/${evaluationId}/candidates/${candidateId}/card`).set(H).send(body);

  it('validates a card against the branch scale and the Qalun ayah counts', async () => {
    const c1 = await cardOf(1);
    await save(staff, c1, { hifzScore: 14.5, tajwidScore: 5 }).expect(400, /SCORE_ABOVE_MAX/);
    await save(staff, c1, { hifzScore: 12 }).expect(400, /SCORE_INCOMPLETE/);
    await save(staff, c1, { absent: true, hifzScore: 3, tajwidScore: 1 }).expect(400, /ABSENT_WITH_SCORE/);
    await save(staff, c1, { hifzScore: 12, tajwidScore: 5, questions: [{ number: 5, surahId: 2, ayah: 1 }] }).expect(400, /QUESTION_NUMBER_INVALID/);
    // Al-Baqara has 285 ayahs in Qalun (286 in Hafs).
    await save(staff, c1, { hifzScore: 12, tajwidScore: 5, questions: [{ number: 1, surahId: 2, ayah: 286 }] }).expect(400, /AYAH_OUT_OF_RANGE/);

    const ok = await save(staff, c1, {
      hifzScore: 12.5,
      tajwidScore: 5,
      notes: 'حفظ متين',
      questions: [
        { number: 1, surahId: 2, ayah: 255, mistakes: 'تردّد في الآية 257' },
        { number: 2, surahId: 18, ayah: 1 },
        { number: 3 }, // empty rows are not stored
      ],
    }).expect(200);
    expect(ok.body.candidate).toMatchObject({ state: 'SCORED', total: '17.5', passed: true });
    expect(ok.body.questions).toHaveLength(2);
  });

  it('lets a teacher on the jury fill cards, and hides the evaluation from other teachers', async () => {
    const list = await juror.get('/api/evaluations').expect(200);
    expect(list.body.map((e: { id: string }) => e.id)).toContain(evaluationId);
    expect((await stranger.get('/api/evaluations').expect(200)).body.map((e: { id: string }) => e.id)).not.toContain(evaluationId);
    await stranger.get(`/api/evaluations/${evaluationId}`).expect(404);

    const c3 = await cardOf(3);
    await save(stranger, c3, { hifzScore: 10, tajwidScore: 5 }).expect(404);
    await save(juror, c3, { hifzScore: 11.5, tajwidScore: 6 }).expect(200); // 17.5, ties with n°1
    await save(juror, await cardOf(4), { absent: true }).expect(200);
    await save(juror, await cardOf(2), { hifzScore: 4, tajwidScore: 0.5 }).expect(200); // جزء عمّ: 4.5 < 5
  });

  it('ranks each branch with shared ranks, then pending and absent candidates', async () => {
    const r = await staff.get(`/api/evaluations/${evaluationId}/results`).expect(200);
    const [b60, amma] = r.body.branches;
    expect(b60.rows.map((x: { number: number; rank: number | null; state: string }) => [x.number, x.rank, x.state])).toEqual([
      [1, 1, 'SCORED'],
      [3, 1, 'SCORED'],
      [4, null, 'ABSENT'],
    ]);
    expect(b60.stats).toMatchObject({ candidates: 3, scored: 2, absent: 1, passed: 2, average: '17.5' });
    expect(amma.rows[0]).toMatchObject({ rank: 1, total: '4.5', passed: false });

    const cards = await juror.get(`/api/evaluations/${evaluationId}/cards`).expect(200);
    expect(cards.body.cards).toHaveLength(4);
    expect(cards.body.cards[0].questions.map((q: { surahId: number; ayah: number }) => [q.surahId, q.ayah])).toEqual([
      [2, 255],
      [18, 1],
    ]);
    await stranger.get(`/api/evaluations/${evaluationId}/cards`).expect(404);

    const mine = await staff.get(`/api/students/${students[0]}/evaluations`).expect(200);
    expect(mine.body).toHaveLength(1);
    expect(mine.body[0]).toMatchObject({ total: '17.5', evaluation: { id: evaluationId }, branch: { name: '60 حزبا' } });
  });

  it('protects filled cards when a branch scale changes or a branch is removed', async () => {
    await staff.patch(`/api/evaluations/${evaluationId}/branches/${big}`).set(H).send({ hifzMax: 12 }).expect(409, /SCORES_ABOVE_NEW_MAX/);
    await staff.patch(`/api/evaluations/${evaluationId}/branches/${big}`).set(H).send({ questionCount: 1 }).expect(409, /QUESTIONS_BEYOND_NEW_COUNT/);
    await staff.delete(`/api/evaluations/${evaluationId}/branches/${big}`).set(H).expect(409, /BRANCH_HAS_CANDIDATES/);
    await staff.patch(`/api/evaluations/${evaluationId}/branches/${big}`).set(H).send({ passScore: 18 }).expect(200);
  });

  it('locks everything once closed; only an admin reopens; scored evaluations cannot be deleted', async () => {
    await juror.post(`/api/evaluations/${evaluationId}/close`).set(H).expect(403);
    await staff.post(`/api/evaluations/${evaluationId}/close`).set(H).expect(200);
    await save(juror, await cardOf(3), { hifzScore: 14, tajwidScore: 6 }).expect(409, /EVALUATION_CLOSED/);
    await staff.post(`/api/evaluations/${evaluationId}/candidates`).set(H).send({ branchId: small, fullName: 'متأخّر' }).expect(409);
    const card = await juror.get(`/api/evaluations/${evaluationId}/candidates/${await cardOf(3)}/card`).expect(200);
    expect(card.body.canScore).toBe(false);

    await staff.post(`/api/evaluations/${evaluationId}/reopen`).set(H).expect(403);
    await admin.post(`/api/evaluations/${evaluationId}/reopen`).set(H).expect(200);
    await admin.delete(`/api/evaluations/${evaluationId}`).set(H).expect(409, /EVALUATION_HAS_SCORES/);
  });

  it('enforces the score checks in the database too', async () => {
    const c = await cardOf(4);
    await expect(prisma.evaluationCandidate.update({ where: { id: c }, data: { absent: true, hifzScore: 1, tajwidScore: 1 } })).rejects.toThrow();
    await expect(prisma.evaluationCandidate.update({ where: { id: c }, data: { absent: false, hifzScore: 1 } })).rejects.toThrow();
  });
});
