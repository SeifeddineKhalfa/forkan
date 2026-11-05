"use client";

import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import type { Slot } from "@/lib/types";

/** "الإثنين 10:00–12:00 · مراجعة" / "الأربعاء بعد العصر · تحفيظ" */
export function ClassSchedule({ slots, compact }: { slots: Slot[]; compact?: boolean }) {
  const te = useTranslations("enums");
  if (!slots.length) return null;
  return (
    <ul className={compact ? "flex flex-wrap gap-1" : "grid gap-1"}>
      {slots.map((s, i) => (
        <li key={s.id ?? i} className="flex items-center gap-2 text-sm">
          <span className="font-medium">{te(`day.${s.day}`)}</span>
          <span className="text-muted-foreground" dir={s.timeLabel ? undefined : "ltr"}>
            {s.timeLabel || `${s.startTime}–${s.endTime}`}
          </span>
          <Badge variant={s.kind === "REVISION" ? "secondary" : "outline"}>{te(`slotKind.${s.kind}`)}</Badge>
        </li>
      ))}
    </ul>
  );
}
