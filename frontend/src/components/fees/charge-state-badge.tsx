"use client";

import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import type { ChargeState } from "@/lib/types";

const VARIANT = {
  UNPAID: "outline",
  PARTIAL: "secondary",
  OVERDUE: "destructive",
  PAID: "default",
  CANCELLED: "ghost",
} as const;

export function ChargeStateBadge({ state }: { state: ChargeState }) {
  const te = useTranslations("enums");
  return (
    <Badge variant={VARIANT[state]} className={state === "CANCELLED" ? "text-muted-foreground line-through" : undefined}>
      {te(`chargeState.${state}`)}
    </Badge>
  );
}
