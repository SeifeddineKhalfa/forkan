import type { INestApplication } from '@nestjs/common';
import ExcelJS from 'exceljs';
import type { PrismaClient } from '../src/generated/prisma/client.js';
import { STUDENT_FIELDS, TEACHER_FIELDS } from '../src/imports/fields.js';
import { type Agent, bootApp, createUser, ensureSchool, H, loginAs, newPrisma } from './helpers.js';

type Row = Partial<Record<string, string | number | Date>>;

async function workbook(students: Row[], teachers: Row[] = []) {
  const wb = new ExcelJS.Workbook();
  const add = (name: string, fields: typeof STUDENT_FIELDS, rows: Row[]) => {
    const ws = wb.addWorksheet(name);
    ws.addRow(fields.map((f) => f.header));
    for (const r of rows) ws.addRow(fields.map((f) => r[f.key] ?? null));
  };
  add('الطلبة', STUDENT_FIELDS, students);
  if (teachers.length) add('المؤدّبون', TEACHER_FIELDS, teachers);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

const MIXED = 'إملاء الاستيراد – مختلط';
const FEMALE = 'إملاء الاستيراد – طالبات';

const ROWS: Row[] = [
  // 2–3: siblings sharing one (new) father
  { firstName: 'مريم', lastName: 'الاستيرادي', gender: 'أنثى', dateOfBirth: '01/07/2014', guardianName: 'محمد الاستيرادي', guardianPhone: '22 555 001', guardianRelation: 'الأب', className: MIXED },
  { firstName: 'علي', lastName: 'الاستيرادي', gender: 'ذكر', dateOfBirth: new Date(Date.UTC(2015, 2, 3)), guardianName: 'محمد الاستيرادي', guardianPhone: 22555001, guardianRelation: 'أب', className: MIXED, declaredHifz: '5 أحزاب' },
  // 4: adult, no guardian, women's imla', opening balance
  { firstName: 'آمنة', lastName: 'الاستيرادية', gender: 'أنثى', dateOfBirth: '1980-05-05', className: FEMALE, openingBalance: '30,500', code: '2019-0042' },
  // 5: boy in the women's imla'
  { firstName: 'سامي', lastName: 'الاستيرادي', gender: 'ذكر', dateOfBirth: '2000-01-01', className: FEMALE },
  // 6: missing gender
  { firstName: 'نور', lastName: 'الاستيرادي', dateOfBirth: '1999-01-01' },
  // 7: same child as row 2
  { firstName: 'مريَم', lastName: 'الاستيرادي', gender: 'أنثى', dateOfBirth: '2014-07-01', guardianName: 'محمد الاستيرادي', guardianPhone: '22555001' },
  // 8: guardian phone already used by "سالم المستورد" in the database, under another name
  { firstName: 'هند', lastName: 'المستوردة', gender: 'أنثى', dateOfBirth: '2012-02-02', guardianName: 'أم هند', guardianPhone: '98 000 001', guardianRelation: 'الأم' },
  // 9: minor without guardian
  { firstName: 'ياسين', lastName: 'الاستيرادي', gender: 'ذكر', dateOfBirth: '2016-09-09' },
];

describe('Excel import (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let staff: Agent;
  let file: Buffer;
  let existingGuardianId: string;

  beforeAll(async () => {
    prisma = newPrisma();
    const { school, year } = await ensureSchool(prisma);
    await createUser(prisma, school.id, 'staff-imp@e2e.local', 'STAFF');
    app = await bootApp();
    staff = await loginAs(app, 'staff-imp@e2e.local');
    await staff.post('/api/classes').set(H).send({ academicYearId: year.id, name: MIXED, audience: 'CHILDREN' }).expect(201);
    await staff.post('/api/classes').set(H).send({ academicYearId: year.id, name: FEMALE, audience: 'ADULTS', genderPolicy: 'FEMALE_ONLY' }).expect(201);
    const s = await staff
      .post('/api/students')
      .set(H)
      .send({ firstName: 'سارة', lastName: 'المستوردة', gender: 'FEMALE', dateOfBirth: '2013-03-03', guardians: [{ guardian: { fullName: 'سالم المستورد', phone: '98000001' }, relation: 'FATHER' }] })
      .expect(201);
    existingGuardianId = s.body.guardians[0].guardianId;
    file = await workbook(ROWS, [{ title: 'الشيخ', firstName: 'رياض', lastName: 'الحرابي', gender: 'ذكر', phone: '55 123 456' }]);
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('serves an Arabic template whose headers are recognised automatically', async () => {
    const res = await staff.get('/api/imports/template').buffer(true).parse((r, cb) => {
      const chunks: Buffer[] = [];
      r.on('data', (c: Buffer) => chunks.push(c));
      r.on('end', () => cb(null, Buffer.concat(chunks)));
    }).expect(200);
    expect(res.headers['content-type']).toContain('spreadsheetml');
    const upload = await staff.post('/api/imports').set(H).attach('file', res.body as Buffer, 'template.xlsx').expect(201);
    // Every template column maps itself; the example row counts as one row.
    expect(Object.values(upload.body.students.mapping).every((v) => v !== null)).toBe(true);
    expect(upload.body.teachers.rowCount).toBe(1);
  });

  let jobId: string;
  let studentMapping: Record<string, number | null>;
  let teacherMapping: Record<string, number | null>;

  it('dry-runs with per-row errors and warnings, and creates nothing', async () => {
    const up = await staff.post('/api/imports').set(H).attach('file', file, 'tlamidh.xlsx').expect(201);
    jobId = up.body.jobId;
    studentMapping = up.body.students.mapping;
    teacherMapping = up.body.teachers.mapping;
    expect(up.body.students.rowCount).toBe(8);

    const res = await staff.post(`/api/imports/${jobId}/validate`).set(H).send({ studentMapping, teacherMapping }).expect(201);
    type RowResult = { row: number; status: string; errors: { code: string }[]; warnings: { code: string }[] };
    const byRow: Record<number, RowResult> = Object.fromEntries((res.body.students as RowResult[]).map((s) => [s.row, s]));
    expect(byRow[2].status).toBe('CREATE');
    expect(byRow[3].status).toBe('CREATE');
    expect(byRow[4].status).toBe('CREATE');
    expect(byRow[5].errors.map((e) => e.code)).toContain('GENDER_POLICY_VIOLATION');
    expect(byRow[6].errors.map((e) => e.code)).toContain('REQUIRED');
    expect(byRow[7].errors.map((e) => e.code)).toContain('DUPLICATE_IN_FILE');
    expect(byRow[8].status).toBe('CREATE');
    expect(byRow[8].warnings.map((w) => w.code)).toEqual(['PHONE_SHARED']);
    expect(byRow[9].errors.map((e) => e.code)).toContain('GUARDIAN_REQUIRED');
    expect(res.body.counts.students).toMatchObject({ create: 4, error: 4, warning: 1 });
    expect(res.body.counts.newGuardians).toBe(2); // the shared father + "أم هند"
    expect(res.body.counts.teachers.create).toBe(1);
    expect(await prisma.student.count({ where: { lastName: 'الاستيرادي' } })).toBe(0);
  });

  it('refuses to commit with errors unless told to skip them', async () => {
    const res = await staff.post(`/api/imports/${jobId}/commit`).set(H).send({ studentMapping, teacherMapping }).expect(422);
    expect(res.body.code).toBe('IMPORT_HAS_ERRORS');
  });

  it('commits valid rows in one go, honouring the "same family" decision', async () => {
    const res = await staff
      .post(`/api/imports/${jobId}/commit`)
      .set(H)
      .send({ studentMapping, teacherMapping, skipErrors: true, decisions: { '8:1': existingGuardianId } })
      .expect(201);
    expect(res.body.created).toMatchObject({ students: 4, teachers: 1, guardians: 1, enrollments: 3, charges: 1 });

    const siblings = await prisma.student.findMany({ where: { lastName: 'الاستيرادي' }, include: { guardians: true } });
    expect(siblings).toHaveLength(2);
    expect(new Set(siblings.map((s) => s.guardians[0].guardianId)).size).toBe(1);
    expect(siblings.find((s) => s.firstName === 'علي')?.declaredHifz).toBe('5 أحزاب');

    const hind = await prisma.student.findFirst({ where: { firstName: 'هند' }, include: { guardians: true } });
    expect(hind?.guardians[0].guardianId).toBe(existingGuardianId);

    const adult = await prisma.student.findFirst({ where: { lastName: 'الاستيرادية' }, include: { charges: true } });
    expect(adult?.code).toBe('2019-0042');
    expect(adult?.charges[0]).toMatchObject({ label: 'رصيد سابق', kind: 'ONE_OFF' });
    expect(adult?.charges[0].amount.toString()).toBe('30.5');

    await staff.post(`/api/imports/${jobId}/commit`).set(H).send({ studentMapping, teacherMapping, skipErrors: true }).expect(409);
  });

  it('re-importing the same file creates nothing new', async () => {
    const up = await staff.post('/api/imports').set(H).attach('file', file, 'tlamidh.xlsx').expect(201);
    const res = await staff
      .post(`/api/imports/${up.body.jobId}/commit`)
      .set(H)
      .send({ studentMapping, teacherMapping, skipErrors: true })
      .expect(201);
    expect(res.body.created).toMatchObject({ students: 0, teachers: 0, guardians: 0, enrollments: 0, charges: 0 });
    // Rows 2, 3, 4, 8 — and 7, the in-file copy of row 2, which now exists in the database.
    expect(res.body.counts.students.exists).toBe(5);
    expect(await prisma.student.count({ where: { lastName: 'الاستيرادي' } })).toBe(2);
  });
});
