"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { BellRing, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useState } from "react";
import { RoleGate } from "@/components/app-shell/role-gate";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api } from "@/lib/api";
import { useFormat } from "@/lib/format";
import { PAYMENT_METHODS, type PaymentPage } from "@/lib/types";
import { useDebounced } from "@/lib/use-debounced";
import { useErrorMessage } from "@/lib/use-error-message";
import { FinanceCards } from "./finance-cards";

const ALL = "ALL";
const PAGE_SIZE = 25;

export default function PaymentsPage() {
  return (
    <RoleGate roles={["STAFF"]}>
      <Payments />
    </RoleGate>
  );
}

function Payments() {
  const t = useTranslations("payments");
  const tc = useTranslations("common");
  const te = useTranslations("enums");
  const fmt = useFormat();
  const errorMessage = useErrorMessage();
  const [q, setQ] = useState("");
  const [method, setMethod] = useState(ALL);
  const [voided, setVoided] = useState("ALL");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const query = useDebounced(q);
  const filter = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setPage(1);
  };

  const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE), voided });
  if (query) params.set("q", query);
  if (method !== ALL) params.set("method", method);
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  const payments = useQuery({
    queryKey: ["payments", params.toString()],
    queryFn: () => api<PaymentPage>(`/payments?${params}`),
    placeholderData: keepPreviousData,
  });
  const pages = payments.data ? Math.max(1, Math.ceil(payments.data.total / PAGE_SIZE)) : 1;

  return (
    <div className="grid gap-8">
      <PageHeader
        title={t("title")}
        subtitle={t("subtitle")}
        actions={
          <>
            <Button variant="outline" asChild>
              <Link href="/payments/reminders">
                <BellRing /> {t("reminders")}
              </Link>
            </Button>
            <Button asChild>
              <Link href="/payments/new">
                <Plus /> {t("record")}
              </Link>
            </Button>
          </>
        }
      />

      <FinanceCards />

      <section className="grid gap-4">
        <h2 className="text-lg font-semibold">{t("receipts")}</h2>
        <div className="flex flex-wrap items-center gap-2">
          <Input className="w-full sm:w-72" placeholder={t("searchPlaceholder")} value={q} onChange={(e) => filter(setQ)(e.target.value)} />
          <Select value={method} onValueChange={filter(setMethod)}>
            <SelectTrigger className="w-44" aria-label={t("method")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{t("method")}: {tc("all")}</SelectItem>
              {PAYMENT_METHODS.map((m) => (
                <SelectItem key={m} value={m}>{te(`paymentMethod.${m}`)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={voided} onValueChange={filter(setVoided)}>
            <SelectTrigger className="w-40" aria-label={t("showVoided")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">{t("voidedAll")}</SelectItem>
              <SelectItem value="NONE">{t("voidedNone")}</SelectItem>
              <SelectItem value="ONLY">{t("voidedOnly")}</SelectItem>
            </SelectContent>
          </Select>
          <label className="flex items-center gap-2 text-sm">
            {t("from")}
            <Input type="date" className="w-40" value={from} onChange={(e) => filter(setFrom)(e.target.value)} />
          </label>
          <label className="flex items-center gap-2 text-sm">
            {t("to")}
            <Input type="date" className="w-40" value={to} onChange={(e) => filter(setTo)(e.target.value)} />
          </label>
        </div>

        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("receiptNumber")}</TableHead>
                <TableHead>{t("date")}</TableHead>
                <TableHead>{t("payer")}</TableHead>
                <TableHead>{t("amount")}</TableHead>
                <TableHead>{t("method")}</TableHead>
                <TableHead>{t("receivedBy")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {payments.isError && (
                <TableRow>
                  <TableCell colSpan={6} className="text-destructive">{errorMessage(payments.error)}</TableCell>
                </TableRow>
              )}
              {payments.data?.items.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground">{tc("noData")}</TableCell>
                </TableRow>
              )}
              {payments.data?.items.map((p) => (
                <TableRow key={p.id} className={p.voidedAt ? "text-muted-foreground" : undefined}>
                  <TableCell>
                    <Link href={`/payments/${p.id}`} className="font-mono font-medium hover:underline" dir="ltr">
                      {p.receiptNumber}
                    </Link>
                    {p.voidedAt && <Badge variant="destructive" className="ms-2">{t("voided")}</Badge>}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">{fmt.date(p.paidAt)}</TableCell>
                  <TableCell>{p.payerName}</TableCell>
                  <TableCell className={`whitespace-nowrap font-medium ${p.voidedAt ? "line-through" : ""}`}>{fmt.money(p.amount)}</TableCell>
                  <TableCell>{te(`paymentMethod.${p.method}`)}</TableCell>
                  <TableCell>
                    {p.receivedBy.firstName} {p.receivedBy.lastName}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {payments.data && (
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
            <span>
              {tc("totalCount", { count: payments.data.total })} · {t("totals", { amount: fmt.money(payments.data.totals.amount) })}
            </span>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>{tc("previous")}</Button>
              <span>{tc("pageOf", { page, pages })}</span>
              <Button size="sm" variant="outline" disabled={page >= pages} onClick={() => setPage(page + 1)}>{tc("next")}</Button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
