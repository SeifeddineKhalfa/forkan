"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Users } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { CancelChargeDialog } from "@/components/fees/cancel-charge-dialog";
import { ChargeDialog, type ChargeTarget } from "@/components/fees/charge-dialog";
import { ChargesTable } from "@/components/fees/charges-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api } from "@/lib/api";
import { useFormat } from "@/lib/format";
import type { Charge, ChargeKind, ChargePage, ClassItem } from "@/lib/types";
import { useDebounced } from "@/lib/use-debounced";
import { useErrorMessage } from "@/lib/use-error-message";

const ALL = "ALL";
const PAGE_SIZE = 25;
const STATES = ["OPEN", "UNPAID", "PARTIAL", "OVERDUE", "PAID", "CANCELLED"] as const;
const KINDS: ChargeKind[] = ["MONTHLY", "ONE_OFF", "MEMBERSHIP"];

export function ChargesTab() {
  const t = useTranslations("fees");
  const tc = useTranslations("common");
  const te = useTranslations("enums");
  const fmt = useFormat();
  const errorMessage = useErrorMessage();
  const [q, setQ] = useState("");
  const [state, setState] = useState<string>("OPEN");
  const [kind, setKind] = useState<string>(ALL);
  const [classId, setClassId] = useState<string>(ALL);
  const [period, setPeriod] = useState("");
  const [page, setPage] = useState(1);
  const [cancelling, setCancelling] = useState<Charge | null>(null);
  const [target, setTarget] = useState<ChargeTarget | null>(null);
  const query = useDebounced(q);
  const filter = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setPage(1);
  };

  const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE), state });
  if (query) params.set("q", query);
  if (kind !== ALL) params.set("kind", kind);
  if (classId !== ALL) params.set("classId", classId);
  if (period) params.set("period", period);

  const charges = useQuery({
    queryKey: ["charges", params.toString()],
    queryFn: () => api<ChargePage>(`/charges?${params}`),
    placeholderData: keepPreviousData,
  });
  const classes = useQuery({ queryKey: ["classes", ""], queryFn: () => api<ClassItem[]>("/classes") });
  const selectedClass = classes.data?.find((c) => c.id === classId);
  const pages = charges.data ? Math.max(1, Math.ceil(charges.data.total / PAGE_SIZE)) : 1;

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Input className="w-full sm:w-72" placeholder={t("searchPlaceholder")} value={q} onChange={(e) => filter(setQ)(e.target.value)} />
        <Select value={state} onValueChange={filter(setState)}>
          <SelectTrigger className="w-40" aria-label={t("state")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{tc("all")}</SelectItem>
            {STATES.map((s) => (
              <SelectItem key={s} value={s}>{s === "OPEN" ? t("open") : te(`chargeState.${s}`)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={kind} onValueChange={filter(setKind)}>
          <SelectTrigger className="w-36" aria-label={t("kind")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t("kind")}: {tc("all")}</SelectItem>
            {KINDS.map((k) => (
              <SelectItem key={k} value={k}>{te(`chargeKind.${k}`)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={classId} onValueChange={filter(setClassId)}>
          <SelectTrigger className="w-60" aria-label={t("class")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t("class")}: {tc("all")}</SelectItem>
            {classes.data?.map((c) => (
              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          type="month"
          className="w-44"
          aria-label={t("period")}
          value={period}
          onChange={(e) => filter(setPeriod)(e.target.value)}
        />
        <Button
          variant="outline"
          className="ms-auto"
          disabled={!selectedClass}
          title={selectedClass ? undefined : t("class")}
          onClick={() => selectedClass && setTarget({ classId: selectedClass.id, className: selectedClass.name })}
        >
          <Users /> {t("bulkCharge")}
        </Button>
      </div>

      {charges.isError && <p className="text-destructive">{errorMessage(charges.error)}</p>}
      <ChargesTable charges={charges.data?.items} showStudent onCancel={setCancelling} />

      {charges.data && (
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
          <span>
            {tc("totalCount", { count: charges.data.total })} ·{" "}
            {t("totals", { amount: fmt.money(charges.data.totals.amount), paid: fmt.money(charges.data.totals.paid) })}
          </span>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>{tc("previous")}</Button>
            <span>{tc("pageOf", { page, pages })}</span>
            <Button size="sm" variant="outline" disabled={page >= pages} onClick={() => setPage(page + 1)}>{tc("next")}</Button>
          </div>
        </div>
      )}

      <CancelChargeDialog charge={cancelling} onClose={() => setCancelling(null)} />
      <ChargeDialog target={target} onOpenChange={(o) => !o && setTarget(null)} />
    </div>
  );
}
