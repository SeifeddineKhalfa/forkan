import { ageOn, todayInSchool } from './dates.js';

const d = (s: string) => new Date(`${s}T00:00:00.000Z`);

describe('ageOn', () => {
  it('counts whole years', () => {
    expect(ageOn(d('2010-05-20'), d('2026-05-19'))).toBe(15);
    expect(ageOn(d('2010-05-20'), d('2026-05-20'))).toBe(16);
    expect(ageOn(d('2008-02-29'), d('2026-02-28'))).toBe(17);
  });
});

describe('todayInSchool', () => {
  it('uses the Tunis calendar date, not UTC', () => {
    // 23:30 UTC on 31 Dec is already 1 Jan in Tunis (UTC+1).
    expect(todayInSchool(new Date('2026-12-31T23:30:00Z')).toISOString()).toBe('2027-01-01T00:00:00.000Z');
  });
});
