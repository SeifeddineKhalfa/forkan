import { candidateResult, cardMarks, type CardScale, hifzFromMistakes, maxTotal, rankBranch, type Scale, scoreError } from './scoring.js';

const sheet: Scale = { hifzMax: 14, tajwidMax: 6, passScore: 10 };
const card = (hifzScore: number | null, tajwidScore: number | null, absent = false) => ({ absent, hifzScore, tajwidScore });

describe('maxTotal', () => {
  it('is /20 on the school sheet and follows the branch scale', () => {
    expect(maxTotal(sheet).toNumber()).toBe(20);
    expect(maxTotal({ hifzMax: '7.5', tajwidMax: '2.5', passScore: null }).toNumber()).toBe(10);
  });
});

const sheet4: CardScale = { ...sheet, questionCount: 4 };
const q = (number: number, tanbihCount = 0, tashihCount = 0) => ({ number, tanbihCount, tashihCount });

describe('hifzFromMistakes', () => {
  it('gives the full حفظ mark with no تنبيه or تصليح, 3.5 per question on the school sheet', () => {
    expect(hifzFromMistakes(sheet4, []).toNumber()).toBe(14);
    expect(hifzFromMistakes(sheet4, [q(1), q(2), q(3), q(4)]).toNumber()).toBe(14);
  });

  it('takes 0.25 off for each تنبيه and each تصليح', () => {
    // Q1: 2 تنبيه + 1 تصليح = -0.75; Q3: 1 تصليح = -0.25 → 13
    expect(hifzFromMistakes(sheet4, [q(1, 2, 1), q(3, 0, 1)]).toNumber()).toBe(13);
  });

  it('never takes a question below 0, so one bad question cannot eat the others', () => {
    // Q2: 20 mistakes = -5 but the question is only worth 3.5 → 14 - 3.5
    expect(hifzFromMistakes(sheet4, [q(2, 20)]).toNumber()).toBe(10.5);
    expect(hifzFromMistakes(sheet4, [q(1, 14), q(2, 14), q(3, 14), q(4, 14)]).toNumber()).toBe(0);
  });

  it('follows the branch scale and ignores questions beyond its count', () => {
    expect(hifzFromMistakes({ hifzMax: 7, questionCount: 2 }, [q(1, 1), q(3, 10)]).toNumber()).toBe(6.75);
    // 14 / 3 per question, rounded to 2 decimals at the end
    expect(hifzFromMistakes({ hifzMax: 14, questionCount: 3 }, [q(1, 1)]).toNumber()).toBe(13.75);
  });
});

describe('cardMarks', () => {
  it('computes حفظ and stores the final mark once تجويد is given', () => {
    const m = cardMarks(sheet4, { absent: false, tajwidScore: '5' }, [q(1, 2, 1), q(3, 0, 1)]);
    expect([m.hifzScore?.toNumber(), m.tajwidScore?.toNumber(), m.totalScore?.toNumber()]).toEqual([13, 5, 18]);
  });

  it('stores no mark while تجويد is missing or when absent', () => {
    const none = { hifzScore: null, tajwidScore: null, totalScore: null };
    expect(cardMarks(sheet4, { absent: false, tajwidScore: null }, [q(1, 3)])).toEqual(none);
    expect(cardMarks(sheet4, { absent: true, tajwidScore: null }, [])).toEqual(none);
  });
});

describe('scoreError', () => {
  const card4 = (tajwidScore: number | null, absent = false) => ({ absent, tajwidScore });

  it('accepts a blank card and تجويد up to the branch maximum', () => {
    expect(scoreError(sheet, card4(null))).toBeNull();
    expect(scoreError(sheet, card4(4.25))).toBeNull();
    expect(scoreError(sheet, card4(6))).toBeNull();
    expect(scoreError(sheet, card4(0))).toBeNull();
  });

  it('refuses تجويد above the scale, negative, or given to an absent candidate', () => {
    expect(scoreError(sheet, card4(6.25))).toBe('SCORE_ABOVE_MAX');
    expect(scoreError(sheet, card4(-1))).toBe('SCORE_NEGATIVE');
    expect(scoreError(sheet, card4(4, true))).toBe('ABSENT_WITH_SCORE');
    expect(scoreError(sheet, card4(null, true))).toBeNull();
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
