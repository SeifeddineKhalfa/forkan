import type { AttendanceStatus, DayOfWeek, Gender } from '../generated/prisma/client.js';
import { MONTHS_AR } from '../fees/billing.js';

/** JS getUTCDay() order (0 = Sunday). */
const WEEK: DayOfWeek[] = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
const DAYS_AR: Record<DayOfWeek, string> = {
  SATURDAY: 'السبت',
  SUNDAY: 'الأحد',
  MONDAY: 'الإثنين',
  TUESDAY: 'الثلاثاء',
  WEDNESDAY: 'الأربعاء',
  THURSDAY: 'الخميس',
  FRIDAY: 'الجمعة',
};

/** Weekday of a @db.Date value (UTC midnight). */
export const weekdayOf = (date: Date): DayOfWeek => WEEK[date.getUTCDay()];

/** "الأربعاء 4 نوفمبر" */
export const arabicDay = (date: Date) =>
  `${DAYS_AR[weekdayOf(date)]} ${date.getUTCDate()} ${MONTHS_AR[date.getUTCMonth()]}`;

export type Counts = Record<AttendanceStatus, number>;

export const emptyCounts = (): Counts => ({ PRESENT: 0, ABSENT: 0, LATE: 0, EXCUSED: 0 });

/**
 * Share of sessions attended: (present + late) / (present + late + absent).
 * Excused absences and cancelled sessions do not count. Null when nothing to count.
 */
export function attendanceRate(c: Counts): number | null {
  const attended = c.PRESENT + c.LATE;
  const total = attended + c.ABSENT;
  return total ? Math.round((attended / total) * 1000) / 1000 : null;
}

/**
 * Prepared text for a cancelled session (spec A5), e.g.
 * «تتغيّب المؤدّبة حبيبة نصري عن إملاء الأطفال يوم السبت 7 نوفمبر، وتستأنف الحصص يوم السبت 14 نوفمبر.»
 */
export function announcementText(a: {
  teacher: { title: string | null; firstName: string; lastName: string; gender: Gender } | null;
  className: string;
  date: Date;
  resumeDate?: Date | null;
  reason: string;
}): string {
  const female = a.teacher?.gender === 'FEMALE';
  const day = arabicDay(a.date);
  const resume = a.resumeDate ? `، ${female ? 'وتستأنف' : 'ويستأنف'} الحصص يوم ${arabicDay(a.resumeDate)}` : '';
  if (!a.teacher) {
    return `السلام عليكم، تُلغى حصّة ${a.className} يوم ${day} (${a.reason})${a.resumeDate ? `، وتُستأنف الحصص يوم ${arabicDay(a.resumeDate)}` : ''}.`;
  }
  const who = [a.teacher.title, a.teacher.firstName, a.teacher.lastName].filter(Boolean).join(' ');
  return `السلام عليكم، ${female ? 'تتغيّب' : 'يتغيّب'} ${who} عن ${a.className} يوم ${day}${resume}.`;
}
