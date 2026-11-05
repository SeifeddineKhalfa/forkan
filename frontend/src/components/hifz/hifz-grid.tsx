"use client";

import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

const CELL = ["bg-muted", "bg-gold", "bg-primary"];

/** 60 ahzab × 8 athman (spec A5). `athman` holds one digit per thumn: 0 none, 1 partial, 2 memorized. */
export function HifzGrid({ athman }: { athman: string }) {
  const t = useTranslations("hifz");
  const value = (n: number) => Number(athman[n - 1] ?? 0) as 0 | 1 | 2;
  return (
    <div className="grid gap-3">
      <div className="grid grid-cols-6 gap-2 sm:grid-cols-10">
        {Array.from({ length: 60 }, (_, i) => {
          const hizb = i + 1;
          const cells = Array.from({ length: 8 }, (_, k) => value(i * 8 + k + 1));
          const full = cells.every((c) => c === 2);
          return (
            <div
              key={hizb}
              className={cn("grid gap-0.5 rounded-md border p-1", full && "border-primary bg-secondary/60")}
              title={`${t("hizb")} ${hizb}: ${cells.filter((c) => c === 2).length}/8`}
            >
              <span className={cn("text-center text-[10px] leading-none", full ? "font-bold text-primary" : "text-muted-foreground")}>
                {hizb}
              </span>
              <div className="grid grid-cols-4 gap-0.5">
                {cells.map((c, k) => (
                  <span key={k} className={cn("h-2 rounded-[2px]", CELL[c])} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
        {[t("legendFull"), t("legendPartial"), t("legendNone")].map((label, i) => (
          <span key={label} className="flex items-center gap-1">
            <span className={cn("inline-block size-3 rounded-[2px]", CELL[2 - i])} /> {label}
          </span>
        ))}
      </div>
    </div>
  );
}

export function UnverifiedBanner({ verified }: { verified: boolean | undefined }) {
  const t = useTranslations("hifz");
  if (verified !== false) return null;
  return <p className="rounded-lg border border-gold/50 bg-accent p-3 text-sm text-accent-foreground">{t("unverified")}</p>;
}
