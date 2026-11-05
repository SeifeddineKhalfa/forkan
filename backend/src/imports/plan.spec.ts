import { STUDENT_FIELDS, suggestMapping } from './fields.js';
import { type PlanContext, planImport } from './plan.js';
import type { SheetData } from './workbook.js';

const headers = STUDENT_FIELDS.map((f) => f.header);
const mapping = suggestMapping(STUDENT_FIELDS, headers);
const sheet = (rows: Record<string, string>[]): SheetData => ({
  name: 'الطلبة',
  headers,
  rows: rows.map((r, i) => ({ rowNumber: i + 2, cells: STUDENT_FIELDS.map((f) => r[f.key] ?? null) })),
});

const ctx = (): PlanContext => ({
  today: new Date('2026-11-03T00:00:00Z'),
  guardianRequiredUnderAge: 18,
  classes: new Map([
    ['املاء البنات', { id: 'c1', name: 'إملاء البنات', genderPolicy: 'FEMALE_ONLY', capacity: 1, activeCount: 0, isActive: true }],
  ]),
  existingCodes: new Set(['2026-0001']),
  existingStudentKeys: new Map(),
  guardiansByPhone: new Map([['+21622123456', [{ id: 'g1', fullName: 'محمد', students: ['يوسف'] }]]]),
  existingTeacherKeys: new Set(),
});

const child = { firstName: 'أ', lastName: 'ب', gender: 'أنثى', dateOfBirth: '01/01/2015' };

describe('planImport', () => {
  it('reuses a guardian with the same phone and name without asking', () => {
    const p = planImport(sheet([{ ...child, guardianName: 'مُحمّد', guardianPhone: '22123456' }]), mapping, null, {}, ctx());
    expect(p.students[0].guardians[0]).toMatchObject({ action: 'LINK', guardianId: 'g1' });
    expect(p.students[0].warnings).toHaveLength(0);
  });

  it('warns on a shared phone, and keeps the choice changeable after a decision', () => {
    const rows = sheet([{ ...child, guardianName: 'أم يوسف', guardianPhone: '22123456' }]);
    const before = planImport(rows, mapping, null, {}, ctx());
    expect(before.students[0].warnings.map((w) => w.code)).toEqual(['PHONE_SHARED']);
    expect(before.students[0].guardians[0].action).toBe('CREATE');

    const after = planImport(rows, mapping, null, {}, ctx(), { '2:1': 'g1' });
    expect(after.students[0].warnings).toHaveLength(0);
    expect(after.students[0].guardians[0]).toMatchObject({ action: 'LINK', guardianId: 'g1' });
    expect(after.students[0].guardians[0].candidates).toHaveLength(1);
  });

  it('counts file rows against the imla capacity', () => {
    const p = planImport(
      sheet([
        { firstName: 'س', lastName: '1', gender: 'أنثى', dateOfBirth: '1990-01-01', className: 'إملاء البنات' },
        { firstName: 'س', lastName: '2', gender: 'أنثى', dateOfBirth: '1990-01-01', className: 'إملاء البنات' },
      ]),
      mapping,
      null,
      {},
      ctx(),
    );
    expect(p.students.map((s) => s.status)).toEqual(['CREATE', 'ERROR']);
    expect(p.students[1].errors[0].code).toBe('CLASS_FULL');
  });

  it('treats a known student code as already imported', () => {
    const p = planImport(sheet([{ ...child, code: '2026-0001', guardianName: 'محمد', guardianPhone: '22123456' }]), mapping, null, {}, ctx());
    expect(p.students[0]).toMatchObject({ status: 'EXISTS', existingCode: '2026-0001' });
  });
});
