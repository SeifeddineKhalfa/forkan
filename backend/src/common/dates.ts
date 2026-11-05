const TZ = 'Africa/Tunis';

/** Today's calendar date in Tunis, as a UTC-midnight Date (the format of @db.Date columns). */
export function todayInSchool(now = new Date()): Date {
  const ymd = new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(now); // YYYY-MM-DD
  return new Date(`${ymd}T00:00:00.000Z`);
}

/** Age in whole years on `on` for a @db.Date birth date. */
export function ageOn(birth: Date, on: Date): number {
  let age = on.getUTCFullYear() - birth.getUTCFullYear();
  const beforeBirthday =
    on.getUTCMonth() < birth.getUTCMonth() ||
    (on.getUTCMonth() === birth.getUTCMonth() && on.getUTCDate() < birth.getUTCDate());
  if (beforeBirthday) age -= 1;
  return age;
}
