import { candidateResult, maxTotal, rankBranch, type Scale, scoreError } from './scoring.js';

const sheet: Scale = { hifzMax: 14, tajwidMax: 6, passScore: 10 };
const card = (hifzScore: number | null, tajwidScore: number | null, absent = false) => ({ absent, hifzScore, tajwidScore });

describe('maxTotal', () => {
  it('is /20 on the school sheet and follows the branch scale', () => {
    expect(maxTotal(sheet).toNumber()).toBe(20);
    expect(maxTotal({ hifzMax: '7.5', tajwidMax: '2.5', passScore: null }).toNumber()).toBe(10);
  });
});

describe('scoreError', () => {
  it('accepts a blank card, a full card and the maxima', () => {
    expect(scoreError(sheet, card(null, null))).toBeNull();
    expect(scoreError(sheet, card(12.5, 4.25))).toBeNull();
    expect(scoreError(sheet, card(14, 6))).toBeNull();
    expect(scoreError(sheet, card(0, 0))).toBeNull();
  });

  it('refuses marks above the branch scale', () => {
    expect(scoreError(sheet, card(14.5, 3))).toBe('SCORE_ABOVE_MAX');
    expect(scoreError(sheet, card(10, 6.25))).toBe('SCORE_ABOVE_MAX');
  });

  it('needs both marks together, none when absent, never negative', () => {
    expect(scoreError(sheet, card(10, null))).toBe('SCORE_INCOMPLETE');
    expect(scoreError(sheet, card(null, 4))).toBe('SCORE_INCOMPLETE');
    expect(scoreError(sheet, card(10, 4, true))).toBe('ABSENT_WITH_SCORE');
    expect(scoreError(sheet, card(null, null, true))).toBeNull();
    expect(scoreError(sheet, card(-1, 4))).toBe('SCORE_NEGATIVE');
  });
});

describe('candidateResult', () => {
  it('adds حفظ and تجويد and compares with the pass mark', () => {
    const r = candidateResult(sheet, card(9, 1));
    expect(r.state).toBe('SCORED');
    expect(r.total?.toNumber()).toBe(10);
    expect(r.passed).toBe(true);
    expect(candidateResult(sheet, card(8, 1.75)).passed).toBe(false);
  });

  it('has no pass/fail without a pass mark, and no total when pending or absent', () => {
    expect(candidateResult({ ...sheet, passScore: null }, card(3, 1)).passed).toBeNull();
    expect(candidateResult(sheet, card(null, null))).toEqual({ state: 'PENDING', total: null, passed: null });
    expect(candidateResult(sheet, card(null, null, true))).toEqual({ state: 'ABSENT', total: null, passed: null });
  });
});

describe('rankBranch', () => {
  const row = (number: number, c: ReturnType<typeof card>) => ({ number, ...candidateResult(sheet, c) });

  it('ranks by total with shared ranks for equal totals, then pending, then absent', () => {
    const out = rankBranch([
      row(1, card(10, 5)),
      row(2, card(null, null, true)),
      row(3, card(13, 5)),
      row(4, card(null, null)),
      row(5, card(11, 4)), // 15, same as n°1
      row(6, card(6, 2)),
    ]);
    expect(out.map((r) => [r.number, r.rank])).toEqual([
      [3, 1],
      [1, 2],
      [5, 2],
      [6, 4],
      [4, null],
      [2, null],
    ]);
  });

  it('handles an empty branch', () => {
    expect(rankBranch([])).toEqual([]);
  });
});
