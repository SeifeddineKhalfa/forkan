"use client";

import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import type { CandidateState } from "@/lib/types";
import { cn } from "@/lib/utils";

/** "12.50" → "12.5": marks are shown without trailing zeros. */
export const mark = (v: string | number | null | undefined) => (v === null || v === undefined ? "" : String(Number(v)));

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
