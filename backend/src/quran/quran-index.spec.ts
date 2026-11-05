import { readFileSync } from 'node:fs';
import { type Interval, mergeIntervals, QuranIndex, QuranRangeError } from './quran-index.js';

const data = JSON.parse(readFileSync(new URL('../../prisma/data/quran-qalun.json', import.meta.url), 'utf8')) as {
  ayahCounts: number[];
  athman: { number: number; hizb: number; startSurah: number; startAyah: number }[];
};
const q = new QuranIndex(data.ayahCounts, data.athman);
const nas = data.ayahCounts[113];

const statsOf = (...ranges: { fromIndex: number; toIndex: number }[]) => {
  const { athman, ...rest } = q.coverageStats(mergeIntervals(ranges.map((r): Interval => [r.fromIndex, r.toIndex])));
  return { ...rest, full: athman.flatMap((x, i) => (x === 2 ? [i + 1] : [])), partial: athman.flatMap((x, i) => (x === 1 ? [i + 1] : [])) };
};

describe('QuranIndex (Qalun)', () => {
  it('numbers every ayah once, both ways', () => {
    expect(q.totalAyahs).toBe(6214);
    expect(q.athmanCount).toBe(480);
    let expected = 1;
    for (let s = 1; s <= 114; s++) {
      for (let a = 1; a <= q.ayahCount(s); a++) {
        expect(q.toIndex(s, a)).toBe(expected);
        expect(q.fromIndex(expected)).toEqual([s, a]);
        expected++;
      }
    }
  });

  it('maps every ayah to the thumn whose range contains it', () => {
    let prevEnd = 0;
    for (let t = 1; t <= 480; t++) {
      const [s, e] = q.thumnRange(t);
      expect(s).toBe(prevEnd + 1);
      expect(q.thumnOf(s)).toBe(t);
      expect(q.thumnOf(e)).toBe(t);
      prevEnd = e;
    }
    expect(prevEnd).toBe(6214);
  });

  it('gives the same summary for "hizb 60 complete" by thumn, by surahs and by ayah range', () => {
    const byThumn = q.normalize({ mode: 'THUMN', fromThumn: 473, toThumn: 480 });
    const bySurah = q.normalize({ mode: 'SURAH', fromSurah: 87, toSurah: 114 });
    const byAyah = q.normalize({ mode: 'AYAH', fromSurah: 87, fromAyah: 1, toSurah: 114, toAyah: nas });
    expect(byThumn).toEqual(bySurah);
    expect(byAyah).toEqual(bySurah);
    expect(bySurah).toMatchObject({ fromSurah: 87, fromAyah: 1, toSurah: 114, toAyah: nas, fromThumn: 473, toThumn: 480 });
    const s = statsOf(bySurah);
    expect(s).toMatchObject({ completedAhzab: 1, memorizedAthman: 8, partial: [] });
    expect(s.full).toEqual([473, 474, 475, 476, 477, 478, 479, 480]);
    expect(statsOf(byThumn)).toEqual(s);
    expect(statsOf(byAyah)).toEqual(s);
  });

  it('accepts backwards memorization (An-Nas → Al-A`la) with the same coverage', () => {
    const backwards = q.normalize({ mode: 'SURAH', fromSurah: 114, toSurah: 87 });
    expect(backwards).toMatchObject({ fromSurah: 114, fromAyah: nas, toSurah: 87, toAyah: 1, fromThumn: 480, toThumn: 473 });
    expect(backwards.fromIndex).toBeGreaterThan(backwards.toIndex);
    expect(statsOf(backwards)).toEqual(statsOf(q.normalize({ mode: 'SURAH', fromSurah: 87, toSurah: 114 })));
    // Built up surah by surah from the end, it adds up to the same hizb.
    const steps = [];
    for (let s = 114; s >= 87; s--) steps.push(q.normalize({ mode: 'SURAH', fromSurah: s, toSurah: s }));
    expect(statsOf(...steps)).toMatchObject({ completedAhzab: 1, memorizedAthman: 8 });
  });

  it('counts a partly covered thumn as partial, not memorized', () => {
    const [s, e] = q.thumnRange(480);
    const s1 = statsOf({ fromIndex: s, toIndex: e - 1 });
    expect(s1).toMatchObject({ memorizedAthman: 0, completedAhzab: 0, partial: [480], memorizedAyahs: e - s });
    // Two separate pieces of the same thumn: still partial.
    const gaps = statsOf({ fromIndex: s, toIndex: s }, { fromIndex: e, toIndex: e });
    expect(gaps).toMatchObject({ memorizedAthman: 0, partial: [480], memorizedAyahs: 2 });
    const s2 = statsOf({ fromIndex: s, toIndex: e - 1 }, { fromIndex: e, toIndex: e });
    expect(s2).toMatchObject({ memorizedAthman: 1, full: [480] });
  });

  it('keeps a hizb/thumn range inside its athman, in both directions', () => {
    // "hizb 58, thumn 3 → thumn 5" = athman 459..461
    const r = q.normalize({ mode: 'THUMN', fromThumn: 459, toThumn: 461 });
    expect([r.fromIndex, r.toIndex]).toEqual([q.thumnRange(459)[0], q.thumnRange(461)[1]]);
    const back = q.normalize({ mode: 'THUMN', fromThumn: 461, toThumn: 459 });
    expect([back.fromIndex, back.toIndex]).toEqual([q.thumnRange(461)[1], q.thumnRange(459)[0]]);
  });

  it('rejects positions that do not exist', () => {
    const code = (fn: () => unknown) => {
      try {
        fn();
      } catch (e) {
        return (e as QuranRangeError).code;
      }
      return null;
    };
    expect(code(() => q.toIndex(115, 1))).toBe('INVALID_SURAH');
    expect(code(() => q.toIndex(2, 286))).toBe('INVALID_AYAH'); // 285 in Qalun numbering
    expect(code(() => q.normalize({ mode: 'THUMN', fromThumn: 0, toThumn: 3 }))).toBe('INVALID_THUMN');
    expect(code(() => q.fromIndex(6215))).toBe('INVALID_AYAH');
  });
});

describe('mergeIntervals', () => {
  it('sorts, merges overlaps and joins adjacent ranges, whatever the direction', () => {
    expect(
      mergeIntervals([
        [20, 30],
        [9, 6],
        [1, 5],
        [25, 40],
        [50, 50],
      ]),
    ).toEqual([
      [1, 9],
      [20, 40],
      [50, 50],
    ]);
    expect(mergeIntervals([])).toEqual([]);
  });
});

describe('QuranIndex construction', () => {
  it('refuses inconsistent reference data', () => {
    const t = (n: number, s: number, a: number) => ({ number: n, hizb: 1, startSurah: s, startAyah: a });
    expect(() => new QuranIndex(data.ayahCounts.slice(1), data.athman)).toThrow('114');
    expect(() => new QuranIndex(data.ayahCounts, [t(1, 1, 2)])).toThrow('1:1');
    expect(() => new QuranIndex(data.ayahCounts, [t(1, 1, 1), t(2, 2, 5), t(3, 2, 5)])).toThrow('thumn 3');
  });
});
