"use client";

import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import type { CandidateState } from "@/lib/types";
import { cn } from "@/lib/utils";

/** "12.50" → "12.5": marks are shown without trailing zeros. */
export const mark = (v: string | number | null | undefined) => (v === null || v === undefined ? "" : String(Number(v)));

/** Marks lost on حفظ for each تنبيه or تصليح (same rule as the backend's scoring.ts). */
export const MISTAKE_PENALTY = 0.25;

/** حفظ mark of one question: its share of the branch maximum less the penalties, never below 0. */
export const questionHifz = (hifzMax: string, questionCount: number, mistakes: number) =>
  Math.max(0, Number(hifzMax) / questionCount - MISTAKE_PENALTY * mistakes);

/** حفظ mark of the whole card, rounded to 2 decimals like the server. */
export const cardHifz = (hifzMax: string, questionCount: number, mistakes: number[]) =>
  Math.round(mistakes.reduce((sum, n) => sum + questionHifz(hifzMax, questionCount, n), 0) * 100) / 100;

/** A mark out of its maximum, e.g. 12.5/14 (always left-to-right). */
export function Score({ value, max, strong }: { value: string | null; max: string; strong?: boolean }) {
  if (value === null) return <span className="text-muted-foreground">—</span>;
  return (
    <span dir="ltr" className={cn("font-mono whitespace-nowrap", strong && "font-bold")}>
      {mark(value)}
      <span className="text-xs text-muted-foreground">/{mark(max)}</span>
    </span>
  );
}

export function CandidateStateBadge({ state }: { state: CandidateState }) {
  const t = useTranslations("evaluations");
  return (
    <Badge variant={state === "ABSENT" ? "destructive" : "outline"} className="font-normal">
      {t(`state.${state}`)}
    </Badge>
  );
}
