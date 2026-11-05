import type { PrismaClient } from '../src/generated/prisma/client.js';
import { createUser, ensureSchool, newPrisma } from './helpers.js';

/** The raw-SQL constraints of migration integrity_constraints (spec A7.1) reject bad data. */
describe('database constraints (A7.1)', () => {
  let prisma: PrismaClient;
  let schoolId: string;
  let yearId: string;

  beforeAll(async () => {
    prisma = newPrisma();
    const { school, year } = await ensureSchool(prisma);
    schoolId = school.id;
    yearId = year.id;
  });

  afterAll(() => prisma.$disconnect());

  const student = (code: string) =>
    prisma.student.create({ data: { schoolId, code, firstName: 'س', lastName: 'ت', gender: 'FEMALE' } });

  it('users_login_chk: a user needs an email or a phone', async () => {
    await expect(
      prisma.user.create({ data: { schoolId, role: 'STAFF', firstName: 'a', lastName: 'b', passwordHash: 'x' } }),
    ).rejects.toThrow(/users_login_chk/);
  });

  it('academic_years_one_current: one current year per school', async () => {
    await expect(
      prisma.academicYear.create({
        data: { schoolId, name: '2027-2028', startDate: new Date('2027-09-01'), endDate: new Date('2028-06-30'), billableMonths: [], isCurrent: true },
      }),
    ).rejects.toThrow();
  });

  it('enrollments_one_active and class_teachers_one_main', async () => {
    const klass = await prisma.class.create({ data: { schoolId, academicYearId: yearId, name: 'قيود', audience: 'ADULTS' } });
    const s = await student('C-0001');
    const enroll = () => prisma.enrollment.create({ data: { schoolId, studentId: s.id, classId: klass.id, startDate: new Date() } });
    await enroll();
    await expect(enroll()).rejects.toThrow();

    const t1 = await prisma.teacher.create({ data: { schoolId, firstName: 'م', lastName: '1', gender: 'MALE' } });
    const t2 = await prisma.teacher.create({ data: { schoolId, firstName: 'م', lastName: '2', gender: 'MALE' } });
    await prisma.classTeacher.create({ data: { classId: klass.id, teacherId: t1.id, role: 'MAIN' } });
    await expect(prisma.classTeacher.create({ data: { classId: klass.id, teacherId: t2.id, role: 'MAIN' } })).rejects.toThrow();
  });

  it('student_guardians_one_primary', async () => {
    const s = await student('C-0002');
    const g1 = await prisma.guardian.create({ data: { schoolId, fullName: 'و1', phone: '+21620000001' } });
    const g2 = await prisma.guardian.create({ data: { schoolId, fullName: 'و2', phone: '+21620000002' } });
    await prisma.studentGuardian.create({ data: { studentId: s.id, guardianId: g1.id, relation: 'FATHER', isPrimary: true } });
    await expect(
      prisma.studentGuardian.create({ data: { studentId: s.id, guardianId: g2.id, relation: 'MOTHER', isPrimary: true } }),
    ).rejects.toThrow();
  });

  it('payment and charge checks', async () => {
    const s = await student('C-0003');
    const user = await createUser(prisma, schoolId, 'cashier@e2e.local', 'STAFF');
    await expect(
      prisma.charge.create({
        data: { schoolId, studentId: s.id, kind: 'ONE_OFF', label: 'x', amount: '10', paidAmount: '11', dueDate: new Date() },
      }),
    ).rejects.toThrow(/charges_amount_chk/);
    // A payment needs exactly one payer.
    await expect(
      prisma.payment.create({
        data: { schoolId, receiptNumber: 'T-1', payerName: 'x', amount: '10', method: 'CASH', receivedById: user.id, publicToken: 'tok-1' },
      }),
    ).rejects.toThrow(/payments_one_payer/);
    await expect(
      prisma.payment.create({
        data: { schoolId, receiptNumber: 'T-2', payerName: 'x', payerStudentId: s.id, amount: '0', method: 'CASH', receivedById: user.id, publicToken: 'tok-2' },
      }),
    ).rejects.toThrow(/payments_amount_chk/);
  });

  it('schedule, Quran reference and hifz checks', async () => {
    const klass = await prisma.class.create({ data: { schoolId, academicYearId: yearId, name: 'قيود 2', audience: 'ADULTS' } });
    await expect(
      prisma.scheduleSlot.create({ data: { classId: klass.id, day: 'MONDAY', startTime: '12:00', endTime: '10:00' } }),
    ).rejects.toThrow(/slot_time_chk/);
    await expect(
      prisma.quranThumn.create({ data: { riwaya: 'QALUN', number: 481, hizb: 61, juz: 31, startSurah: 1, startAyah: 1 } }),
    ).rejects.toThrow(/thumn_range_chk/);
  });
});
