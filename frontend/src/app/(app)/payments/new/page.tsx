"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { toast } from "sonner";
import { RoleGate } from "@/components/app-shell/role-gate";
import { ChargeStateBadge } from "@/components/fees/charge-state-badge";
import { Field } from "@/components/form/field";
import { PageHeader } from "@/components/page-header";
import { StudentPicker } from "@/components/student-picker";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import { useFormat } from "@/lib/format";
import {
  type OpenCharges,
  PAYMENT_METHODS,
  type PaymentDetail,
  type PaymentMethod,
  type StudentDetail,
  type StudentListItem,
} from "@/lib/types";
import { useErrorMessage } from "@/lib/use-error-message";

/** Money as integer millimes, so the split never suffers from float rounding. */
const toMil = (v: string) => Math.round((Number(v.replace(",", ".")) || 0) * 1000);
const fromMil = (n: number) => (n / 1000).toFixed(3);

type Payer = { payerGuardianId: string } | { payerStudentId: string };
const payerKey = (p: Payer) => ("payerGuardianId" in p ? `g:${p.payerGuardianId}` : `s:${p.payerStudentId}`);

export default function NewPaymentPage() {
  return (
    <RoleGate roles={["STAFF"]}>
      <Suspense>
        <NewPayment />
      </Suspense>
    </RoleGate>
  );
}

function NewPayment() {
  const t = useTranslations("payments");
  const params = useSearchParams();
  const [picked, setPicked] = useState<StudentListItem | null>(null);
  const studentId = picked?.id ?? params.get("studentId");
  const guardianId = params.get("guardianId");

  const student = useQuery({
    queryKey: ["students", studentId],
    queryFn: () => api<StudentDetail>(`/students/${studentId}`),
    enabled: !!studentId,
  });

  const defaultPayer = (s: StudentDetail): Payer => {
    const g = s.guardians.find((x) => x.isPayer) ?? s.guardians.find((x) => x.isPrimary) ?? s.guardians[0];
    return g ? { payerGuardianId: g.guardianId } : { payerStudentId: s.id };
  };
  const [chosen, setChosen] = useState<Payer | null>(null);
  const payer: Payer | null = guardianId
    ? { payerGuardianId: guardianId }
    : (chosen ?? (student.data ? defaultPayer(student.data) : null));

  return (
    <div className="grid max-w-4xl gap-6">
      <PageHeader backHref="/payments" title={t("record")} />
      {!guardianId && (
        <Card>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Field label={t("findStudent")} hint={t("findStudentHint")}>
              <StudentPicker
                value={picked}
                onChange={(s) => {
                  setPicked(s);
                  setChosen(null);
                }}
              />
            </Field>
            {student.data && payer && (
              <Field label={t("payerIs")}>
                <Select value={payerKey(payer)} onValueChange={(v) => setChosen(v.startsWith("g:") ? { payerGuardianId: v.slice(2) } : { payerStudentId: v.slice(2) })}>
                  <SelectTrigger className="w-full" aria-label={t("payerIs")}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {student.data.guardians.map((g) => (
                      <SelectItem key={g.guardianId} value={`g:${g.guardianId}`}>{t("family", { name: g.guardian.fullName })}</SelectItem>
                    ))}
                    <SelectItem value={`s:${student.data.id}`}>
                      {t("studentSelf", { name: `${student.data.firstName} ${student.data.lastName}` })}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            )}
          </CardContent>
        </Card>
      )}
      {payer && <PaymentForm key={payerKey(payer)} payer={payer} />}
    </div>
  );
}

function PaymentForm({ payer }: { payer: Payer }) {
  const t = useTranslations("payments");
  const tf = useTranslations("fees");
  const tc = useTranslations("common");
  const te = useTranslations("enums");
  const fmt = useFormat();
  const errorMessage = useErrorMessage();
  const router = useRouter();
  const qc = useQueryClient();
  const query = new URLSearchParams(payer as Record<string, string>);
  const open = useQuery({
    queryKey: ["payments", "open-charges", query.toString()],
    queryFn: () => api<OpenCharges>(`/payments/open-charges?${query}`),
  });

  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("CASH");
  const [reference, setReference] = useState("");
  const [paidAt, setPaidAt] = useState("");
  const [notes, setNotes] = useState("");
  const [manual, setManual] = useState<Record<string, string> | null>(null);

  const charges = open.data?.charges ?? [];
  const total = toMil(amount);
  // Oldest first, like the API does when no split is sent.
  const auto: Record<string, number> = {};
  let left = total;
  for (const c of charges) {
    const part = Math.max(0, Math.min(left, toMil(c.remaining)));
    auto[c.id] = part;
    left -= part;
  }
  const split = (id: string) => (manual ? toMil(manual[id] ?? "0") : auto[id]);
  const allocated = charges.reduce((a, c) => a + split(c.id), 0);
  const over = allocated > total;

  const save = useMutation({
    mutationFn: () =>
      api<PaymentDetail>("/payments", {
        method: "POST",
        body: {
          ...payer,
          amount,
          method,
          reference: reference || undefined,
          notes: notes || undefined,
          paidAt: paidAt || undefined,
          allocations: manual
            ? charges.filter((c) => split(c.id) > 0).map((c) => ({ chargeId: c.id, amount: fromMil(split(c.id)) }))
            : undefined,
        },
      }),
    onSuccess: (p) => {
      toast.success(t("saved", { number: p.receiptNumber }));
      for (const key of ["payments", "charges", "account", "finance", "memberships", "classes"]) void qc.invalidateQueries({ queryKey: [key] });
      router.push(`/payments/${p.id}`);
    },
  });

  if (open.isError) return <p className="text-destructive">{errorMessage(open.error)}</p>;
  if (!open.data) return <p className="text-muted-foreground">{tc("loading")}</p>;

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>
            {t("openCharges")} — {open.data.payer.name}
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3">
          {Number(open.data.credit) > 0 && (
            <Alert>
              <AlertDescription>{t("existingCredit", { amount: fmt.money(open.data.credit) })}</AlertDescription>
            </Alert>
          )}
          {charges.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("noOpenCharges")}</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("students")}</TableHead>
                    <TableHead>{tf("label")}</TableHead>
                    <TableHead>{t("remaining")}</TableHead>
                    <TableHead className="w-36">{t("allocate")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {charges.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="whitespace-nowrap">
                        {c.student.firstName} {c.student.lastName}
                      </TableCell>
                      <TableCell>
                        {c.label} <ChargeStateBadge state={c.state} />
                        <span className="block text-xs text-muted-foreground">{fmt.date(c.dueDate)}</span>
                      </TableCell>
                      <TableCell className="whitespace-nowrap">{fmt.money(c.remaining)}</TableCell>
                      <TableCell>
                        <Input
                          dir="ltr"
                          inputMode="decimal"
                          aria-label={`${t("allocate")} — ${c.label}`}
                          value={manual ? (manual[c.id] ?? "") : split(c.id) ? fromMil(split(c.id)) : ""}
                          placeholder="0"
                          onChange={(e) =>
                            setManual({
                              ...Object.fromEntries(charges.map((x) => [x.id, split(x.id) ? fromMil(split(x.id)) : ""])),
                              ...manual,
                              [c.id]: e.target.value,
                            })
                          }
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          {manual && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              {t("manualHint")}
              <Button size="sm" variant="link" onClick={() => setManual(null)}>{t("autoAllocate")}</Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label={`${t("amount")} (${tc("currency")})`} htmlFor="p-amount">
            <Input id="p-amount" dir="ltr" inputMode="decimal" className="h-12 text-xl font-semibold" value={amount} onChange={(e) => setAmount(e.target.value)} />
            {charges.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {[
                  { key: "payAll", mil: charges.reduce((a, c) => a + toMil(c.remaining), 0) },
                  ...(charges.length > 1 ? [{ key: "payOldest", mil: toMil(charges[0].remaining) }] : []),
                ].map((q) => (
                  <Button key={q.key} type="button" size="sm" variant="secondary" onClick={() => { setAmount(fromMil(q.mil)); setManual(null); }}>
                    {t(q.key as "payAll")}: {fmt.money(fromMil(q.mil))}
                  </Button>
                ))}
              </div>
            )}
          </Field>
          <Field label={t("method")}>
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4" role="radiogroup" aria-label={t("method")}>
              {PAYMENT_METHODS.map((m) => (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={method === m}
                  onClick={() => setMethod(m)}
                  className={`h-9 rounded-lg border px-2 text-sm font-medium transition-colors ${method === m ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:border-primary/40"}`}
                >
                  {te(`paymentMethod.${m}`)}
                </button>
              ))}
            </div>
          </Field>
          {method !== "CASH" && (
            <Field label={t("reference")} htmlFor="p-ref">
              <Input id="p-ref" dir="ltr" value={reference} onChange={(e) => setReference(e.target.value)} />
            </Field>
          )}
          <Field label={t("paidAt")} htmlFor="p-date" hint={t("paidAtHint")}>
            <Input id="p-date" type="date" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} />
          </Field>
          <Field label={t("notes")} htmlFor="p-notes" className="sm:col-span-2">
            <Textarea id="p-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
          <p className={`text-sm sm:col-span-2 ${over ? "text-destructive" : "text-muted-foreground"}`}>
            {over
              ? t("overAllocated")
              : t("allocated", { allocated: fmt.money(fromMil(allocated)), credit: fmt.money(fromMil(Math.max(0, total - allocated))) })}
          </p>
          {save.isError && <p role="alert" className="text-sm text-destructive sm:col-span-2">{errorMessage(save.error)}</p>}
          <div className="sm:col-span-2">
            <Button size="lg" disabled={total <= 0 || over || save.isPending} onClick={() => save.mutate()}>
              {save.isPending ? tc("saving") : t("save")}
            </Button>
          </div>
        </CardContent>
      </Card>
    </>
  );
}
