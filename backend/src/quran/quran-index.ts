/**
 * Qur'an positions for one riwaya (spec A5): surah:ayah ⇄ global ayah index ⇄ thumn,
 * the three ways of entering a range, and interval merging. Pure and fully unit-tested;
 * built from the seeded reference data (ayah counts + thumn starts).
 */

export interface ThumnStart {
  number: number; // 1..480
  hizb: number; // 1..60
  startSurah: number;
  startAyah: number;
}

/** [from, to] global ayah indexes, from ≤ to. */
export type Interval = [number, number];

export type RangeInput =
  | { mode: 'THUMN'; fromThumn: number; toThumn: number }
  | { mode: 'SURAH'; fromSurah: number; toSurah: number }
  | { mode: 'AYAH'; fromSurah: number; fromAyah: number; toSurah: number; toAyah: number };

export interface NormalizedRange {
  fromSurah: number;
  fromAyah: number;
  toSurah: number;
  toAyah: number;
  fromIndex: number;
  toIndex: number;
  fromThumn: number;
  toThumn: number;
}

export class QuranRangeError extends Error {
  constructor(readonly code: 'INVALID_SURAH' | 'INVALID_AYAH' | 'INVALID_THUMN') {
    super(code);
  }
}

export class QuranIndex {
  /** Global index of each surah's first ayah (1-based surah → index). */
  private readonly surahStart: number[];
  /** Global index of each thumn's first ayah, plus a sentinel at total + 1. */
  private readonly thumnStart: number[];
  readonly totalAyahs: number;
  readonly athmanCount: number;

  constructor(
    readonly ayahCounts: number[],
    athman: ThumnStart[],
  ) {
    if (ayahCounts.length !== 114) throw new Error('114 ayah counts expected');
    this.surahStart = [0];
    let next = 1;
    for (const count of ayahCounts) {
      this.surahStart.push(next);
      next += count;
    }
    this.totalAyahs = next - 1;
    const sorted = [...athman].sort((a, b) => a.number - b.number);
    this.thumnStart = sorted.map((t) => this.toIndex(t.startSurah, t.startAyah));
    if (this.thumnStart[0] !== 1) throw new Error('the first thumn must start at 1:1');
    for (let i = 1; i < this.thumnStart.length; i++) {
      if (this.thumnStart[i] <= this.thumnStart[i - 1]) throw new Error(`thumn ${i + 1} does not start after thumn ${i}`);
    }
    this.athmanCount = sorted.length;
    this.thumnStart.push(this.totalAyahs + 1);
  }

  ayahCount(surah: number): number {
    if (!Number.isInteger(surah) || surah < 1 || surah > 114) throw new QuranRangeError('INVALID_SURAH');
    return this.ayahCounts[surah - 1];
  }

  toIndex(surah: number, ayah: number): number {
    const count = this.ayahCount(surah);
    if (!Number.isInteger(ayah) || ayah < 1 || ayah > count) throw new QuranRangeError('INVALID_AYAH');
    return this.surahStart[surah] + ayah - 1;
  }

  fromIndex(index: number): [surah: number, ayah: number] {
    if (!Number.isInteger(index) || index < 1 || index > this.totalAyahs) throw new QuranRangeError('INVALID_AYAH');
    const surah = upperBound(this.surahStart, index) - 1;
    return [surah, index - this.surahStart[surah] + 1];
  }

  /** The thumn (1..480) containing an ayah. */
  thumnOf(index: number): number {
    return upperBound(this.thumnStart, index);
  }

  /** First and last global index of a thumn. */
  thumnRange(thumn: number): Interval {
    if (!Number.isInteger(thumn) || thumn < 1 || thumn > this.athmanCount) throw new QuranRangeError('INVALID_THUMN');
    return [this.thumnStart[thumn - 1], this.thumnStart[thumn] - 1];
  }

  surahRange(surah: number): Interval {
    const count = this.ayahCount(surah);
    return [this.surahStart[surah], this.surahStart[surah] + count - 1];
  }

  /**
   * Any of the three input modes → one canonical range. Direction is kept: a range
   * entered backwards (An-Nas → Al-A'la) starts at the higher index.
   */
  normalize(input: RangeInput): NormalizedRange {
    let from: number;
    let to: number;
    if (input.mode === 'THUMN') {
      const a = this.thumnRange(input.fromThumn);
      const b = this.thumnRange(input.toThumn);
      [from, to] = input.fromThumn <= input.toThumn ? [a[0], b[1]] : [a[1], b[0]];
    } else if (input.mode === 'SURAH') {
      const a = this.surahRange(input.fromSurah);
      const b = this.surahRange(input.toSurah);
      [from, to] = input.fromSurah <= input.toSurah ? [a[0], b[1]] : [a[1], b[0]];
    } else {
      from = this.toIndex(input.fromSurah, input.fromAyah);
      to = this.toIndex(input.toSurah, input.toAyah);
    }
    const [fromSurah, fromAyah] = this.fromIndex(from);
    const [toSurah, toAyah] = this.fromIndex(to);
    return { fromSurah, fromAyah, toSurah, toAyah, fromIndex: from, toIndex: to, fromThumn: this.thumnOf(from), toThumn: this.thumnOf(to) };
  }

  /**
   * Memorization summary from merged coverage: a thumn counts when fully covered,
   * a hizb when its 8 athman are; `athman` gives 0 (none) / 1 (partial) / 2 (full) per thumn.
   */
  coverageStats(coverage: Interval[]) {
    const athman = Array.from<0 | 1 | 2>({ length: this.athmanCount }).fill(0);
    let memorizedAyahs = 0;
    for (const [a, b] of coverage) {
      memorizedAyahs += b - a + 1;
      for (let t = this.thumnOf(a); t <= this.thumnOf(b); t++) {
        const [s, e] = this.thumnRange(t);
        const covered = Math.min(b, e) - Math.max(a, s) + 1;
        // Coverage is merged, so one interval holds a whole covered thumn.
        if (covered === e - s + 1) athman[t - 1] = 2;
        else if (covered > 0 && athman[t - 1] === 0) athman[t - 1] = 1;
      }
    }
    let completedAhzab = 0;
    for (let h = 0; h < this.athmanCount / 8; h++) {
      if (athman.slice(h * 8, h * 8 + 8).every((x) => x === 2)) completedAhzab++;
    }
    return { memorizedAyahs, memorizedAthman: athman.filter((x) => x === 2).length, completedAhzab, athman };
  }
}

/** Sorted, merged, adjacent intervals joined ([1,5] + [6,9] → [1,9]). Direction is ignored. */
export function mergeIntervals(intervals: Interval[]): Interval[] {
  const sorted = intervals.map(([a, b]): Interval => (a <= b ? [a, b] : [b, a])).sort((x, y) => x[0] - y[0]);
  const out: Interval[] = [];
  for (const [a, b] of sorted) {
    const last = out.at(-1);
    if (last && a <= last[1] + 1) last[1] = Math.max(last[1], b);
    else out.push([a, b]);
  }
  return out;
}

/** Number of elements ≤ x in an ascending array (1-based position of the bucket containing x). */
function upperBound(arr: number[], x: number): number {
  let lo = 0;
  let hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (arr[mid] <= x) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}
