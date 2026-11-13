import { Prisma } from '../generated/prisma/client.js';

/**
 * Score card rules (school sheet «بطاقة تقييم»): the jury fills one card per candidate.
 * حفظ is computed: the branch's حفظ maximum is split evenly between its questions, and each
 * تنبيه or تصليح on a question costs MISTAKE_PENALTY (a question never drops below 0).
 * تجويد is one mark for the whole card, typed by the jury. Scales come from the branch.
 */

type Num = Prisma.Decimal | string | number;

/** Marks lost on حفظ for each تنبيه or تصليح. */
export const MISTAKE_PENALTY = new Prisma.Decimal('0.25');

export interface Scale {
  hifzMax: Num;
  tajwidMax: Num;
  passScore: Num | null;
}

export interface CardScale extends Scale {
  questionCount: number;
}

export interface CardScores {
  absent: boolean;
  hifzScore: Num | null;
  tajwidScore: Num | null;
}

export interface QuestionMistakes {
  number: number;
  tanbihCount: number;
  tashihCount: number;
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

/** حفظ mark of one question: its share of the branch maximum, less the penalties. */
export function questionHifz(scale: Pick<CardScale, 'hifzMax' | 'questionCount'>, q: Omit<QuestionMistakes, 'number'> | undefined) {
  const share = dec(scale.hifzMax).div(scale.questionCount);
  const lost = MISTAKE_PENALTY.mul(q ? q.tanbihCount + q.tashihCount : 0);
  return Prisma.Decimal.max(0, share.sub(lost));
}

/** حفظ mark of the whole card (rounded to 2 decimals), from the counts of questions 1..questionCount. */
export function hifzFromMistakes(scale: Pick<CardScale, 'hifzMax' | 'questionCount'>, questions: QuestionMistakes[]) {
  let sum = new Prisma.Decimal(0);
  for (let n = 1; n <= scale.questionCount; n++) sum = sum.add(questionHifz(scale, questions.find((q) => q.number === n)));
  return sum.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}

/** Error code for a تجويد mark the branch scale does not allow, or null when it is valid. */
export function scoreError(scale: Scale, card: { absent: boolean; tajwidScore: Num | null }): string | null {
  const t = card.tajwidScore;
  if (card.absent) return t === null ? null : 'ABSENT_WITH_SCORE';
  if (t === null) return null;
  if (dec(t).lt(0)) return 'SCORE_NEGATIVE';
  if (dec(t).gt(dec(scale.tajwidMax))) return 'SCORE_ABOVE_MAX';
  return null;
}

/**
 * Marks stored on a card. The card is complete once the jury gives تجويد: حفظ is then computed
 * from the question counts and the final mark stored. Before that (or when absent) all stay null.
 */
export function cardMarks(scale: CardScale, card: { absent: boolean; tajwidScore: Num | null }, questions: QuestionMistakes[]) {
  if (card.absent || card.tajwidScore === null) return { hifzScore: null, tajwidScore: null, totalScore: null };
  const hifzScore = hifzFromMistakes(scale, questions);
  const tajwidScore = dec(card.tajwidScore);
  return { hifzScore, tajwidScore, totalScore: hifzScore.add(tajwidScore) };
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
