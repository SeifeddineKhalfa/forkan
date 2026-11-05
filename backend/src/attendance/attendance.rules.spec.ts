import { announcementText, arabicDay, attendanceRate, emptyCounts, weekdayOf } from './attendance.rules.js';

const d = (s: string) => new Date(`${s}T00:00:00.000Z`);

describe('attendance rules', () => {
  it('maps dates to school weekdays', () => {
    expect(weekdayOf(d('2026-11-07'))).toBe('SATURDAY');
    expect(weekdayOf(d('2026-11-04'))).toBe('WEDNESDAY');
    expect(arabicDay(d('2026-11-04'))).toBe('الأربعاء 4 نوفمبر');
  });

  it('counts late as attended and ignores excused absences', () => {
    expect(attendanceRate({ ...emptyCounts(), PRESENT: 6, LATE: 1, ABSENT: 1, EXCUSED: 5 })).toBe(0.875);
    expect(attendanceRate({ ...emptyCounts(), EXCUSED: 2 })).toBeNull();
  });

  it('prepares the cancellation announcement with the right gender', () => {
    const habiba = { title: 'المؤدّبة', firstName: 'حبيبة', lastName: 'نصري', gender: 'FEMALE' as const };
    expect(
      announcementText({ teacher: habiba, className: 'إملاء الأطفال', date: d('2026-11-07'), resumeDate: d('2026-11-14'), reason: 'مرض' }),
    ).toBe('السلام عليكم، تتغيّب المؤدّبة حبيبة نصري عن إملاء الأطفال يوم السبت 7 نوفمبر، وتستأنف الحصص يوم السبت 14 نوفمبر.');
    expect(
      announcementText({
        teacher: { ...habiba, title: 'الشيخ', firstName: 'عادل', lastName: 'بليلة', gender: 'MALE' },
        className: 'حصّة المراجعة',
        date: d('2026-11-04'),
        reason: 'سفر',
      }),
    ).toBe('السلام عليكم، يتغيّب الشيخ عادل بليلة عن حصّة المراجعة يوم الأربعاء 4 نوفمبر.');
    expect(announcementText({ teacher: null, className: 'إملاء الأطفال', date: d('2026-11-07'), reason: 'عطلة' })).toBe(
      'السلام عليكم، تُلغى حصّة إملاء الأطفال يوم السبت 7 نوفمبر (عطلة).',
    );
  });
});
