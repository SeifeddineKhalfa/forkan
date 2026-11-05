"use client";

import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import { useFormat } from "@/lib/format";
import type { FinanceSummary } from "@/lib/types";

const thisMonth = () => new Date().toISOString().slice(0, 7);
const pct = (rate: number | null) => (rate === null ? "—" : `${Math.round(rate * 100)}%`);

/** Finance dashboard (spec B, Slice 4): collected, outstanding, collection rate, by imla'. */
export function FinanceCards() {
  const t = useTranslations("payments");
  const te = useTranslations("enums");
  const fmt = useFormat();
  const [period, setPeriod] = useState(thisMonth);
  const summary = useQuery({
    queryKey: ["finance", period],
    queryFn: () => api<FinanceSummary>(`/finance/summary${period ? `?period=${period}` : ""}`),
  });
  const s = summary.data;

  return (
    <section className="grid gap-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">{t("finance")}</h2>
        <Input type="month" className="w-44" aria-label={t("finance")} value={period} onChange={(e) => setPeriod(e.target.value)} />
      </div>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <Stat label={t("collected")} value={s && fmt.money(s.collected)} hint={s && t("paymentsCount", { count: s.payments })} />
        <Stat label={t("rate")} value={s && pct(s.month.rate)} hint={s && `${fmt.money(s.month.paid)} / ${fmt.money(s.month.billed)}`} />
        <Stat label={t("outstanding")} value={s && fmt.money(s.outstanding)} />
        <Stat label={t("overdue")} value={s && fmt.money(s.overdue)} danger={!!s && Number(s.overdue) > 0} />
        <Stat label={t("creditTotal")} value={s && fmt.money(s.credit)} />
      </div>
      {s && (s.byClass.length > 0 || s.byMethod.length > 0) && (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-base">{t("byClass")}</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 text-sm">
              {s.byClass.map((c) => {
                const rate = Number(c.billed) > 0 ? Number(c.paid) / Number(c.billed) : 0;
                return (
                  <div key={c.id} className="grid gap-1">
                    <div className="flex justify-between gap-2">
                      <span>{c.name}</span>
                      <span className="text-muted-foreground">
                        {fmt.money(c.paid)} / {fmt.money(c.billed)} · {pct(rate)}
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-muted" role="presentation">
                      <div className="h-full rounded-full bg-primary" style={{ width: `${Math.round(rate * 100)}%` }} />
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("byMethod")}</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2 text-sm">
              {s.byMethod.map((m) => (
                <div key={m.method} className="flex justify-between gap-2">
                  <span>{te(`paymentMethod.${m.method}`)}</span>
                  <span>{fmt.money(m.amount)}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}
    </section>
  );
}

function Stat({ label, value, hint, danger }: { label: string; value?: string; hint?: string; danger?: boolean }) {
  return (
    <Card className="py-4">
      <CardContent className="grid gap-1">
        <span className="text-sm text-muted-foreground">{label}</span>
        <span className={`text-xl font-bold ${danger ? "text-destructive" : ""}`}>{value ?? "…"}</span>
        {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
      </CardContent>
    </Card>
  );
}
