import { Prisma } from '../generated/prisma/client.js';

/**
 * Score card rules (school sheet «بطاقة تقييم»): the jury fills one card per candidate
 * and gives one حفظ mark and one تجويد mark for the whole card. Scales come from the branch.
 */

type Num = Prisma.Decimal | string | number;

export interface Scale {
  hifzMax: Num;
  tajwidMax: Num;
  passScore: Num | null;
}

export interface CardScores {
  absent: boolean;
  hifzScore: Num | null;
  tajwidScore: Num | null;
}

export type CandidateState = 'SCORED' | 'PENDING' | 'ABSENT';

export interface CandidateResult {
  state: CandidateState;
  total: Prisma.Decimal | null;
  /** null when the branch has no pass mark or the candidate has no score. */
  passed: boolean | null;
}

const dec = (v: Num) => new Prisma.Decimal(v);

export const maxTotal = (scale: Scale) => dec(scale.hifzMax).add(dec(scale.tajwidMax));

/** Error code for scores the branch scale does not allow, or null when they are valid. */
export function scoreError(scale: Scale, card: CardScores): string | null {
  const { hifzScore: h, tajwidScore: t } = card;
  if (card.absent) return h === null && t === null ? null : 'ABSENT_WITH_SCORE';
  if ((h === null) !== (t === null)) return 'SCORE_INCOMPLETE';
  if (h === null || t === null) return null;
  if (dec(h).lt(0) || dec(t).lt(0)) return 'SCORE_NEGATIVE';
  if (dec(h).gt(dec(scale.hifzMax)) || dec(t).gt(dec(scale.tajwidMax))) return 'SCORE_ABOVE_MAX';
  return null;
}

export function candidateResult(scale: Scale, card: CardScores): CandidateResult {
  if (card.absent) return { state: 'ABSENT', total: null, passed: null };
  if (card.hifzScore === null || card.tajwidScore === null) return { state: 'PENDING', total: null, passed: null };
  const total = dec(card.hifzScore).add(dec(card.tajwidScore));
  const passed = scale.passScore === null ? null : total.gte(dec(scale.passScore));
  return { state: 'SCORED', total, passed };
}

export type Rankable = CandidateResult & { number: number };

/**
 * Orders one branch for the results sheet: scored candidates by total (highest first, equal totals
 * share a rank: 1, 2, 2, 4), then candidates still waiting for their card, then absentees.
 * Ties keep the order of passage; no tie-break rule is applied (none was given by the school).
 */
export function rankBranch<T extends Rankable>(rows: T[]): (T & { rank: number | null })[] {
  const byNumber = (a: T, b: T) => a.number - b.number;
  const scored = rows
    .filter((r) => r.state === 'SCORED')
    .sort((a, b) => b.total!.cmp(a.total!) || byNumber(a, b));
  const pending = rows.filter((r) => r.state === 'PENDING').sort(byNumber);
  const absent = rows.filter((r) => r.state === 'ABSENT').sort(byNumber);

  let rank = 0;
  const ranked = scored.map((r, i) => {
    if (i === 0 || !r.total!.eq(scored[i - 1].total!)) rank = i + 1;
    return { ...r, rank };
  });
  return [...ranked, ...[...pending, ...absent].map((r) => ({ ...r, rank: null }))];
}
