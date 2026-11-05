"use client";

import { useQuery } from "@tanstack/react-query";
import { IdCard, Plus, Wallet } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useState } from "react";
import { CancelChargeDialog } from "@/components/fees/cancel-charge-dialog";
import { ChargeDialog } from "@/components/fees/charge-dialog";
import { ChargeStateBadge } from "@/components/fees/charge-state-badge";
import { ChargesTable } from "@/components/fees/charges-table";
import { RegisterMembershipDialog } from "@/components/fees/register-membership-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/lib/api";
import { useFormat } from "@/lib/format";
import type { Charge, StudentAccount as Account, PaymentPage, StudentDetail } from "@/lib/types";
import { useErrorMessage } from "@/lib/use-error-message";

/** "Payments" tab: balance, family, membership and charges. Payments themselves come in Slice 4. */
export function StudentAccount({ student }: { student: StudentDetail }) {
  const t = useTranslations("fees");
  const tm = useTranslations("memberships");
  const tc = useTranslations("common");
  const fmt = useFormat();
  const errorMessage = useErrorMessage();
  const [charging, setCharging] = useState(false);
  const [cancelling, setCancelling] = useState<Charge | null>(null);
  const [registering, setRegistering] = useState(false);
  const account = useQuery({
    queryKey: ["account", "student", student.id],
    queryFn: () => api<Account>(`/students/${student.id}/account`),
  });

  if (account.isError) return <p className="text-destructive">{errorMessage(account.error)}</p>;
  if (!account.data) return <p className="text-muted-foreground">{tc("loading")}</p>;
  const a = account.data;
  const { year, current } = a.membership;
  const siblings = a.family?.students.filter((s) => s.id !== student.id) ?? [];

  return (
    <div className="grid gap-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label={t("balance")} value={fmt.money(a.balance)} strong={Number(a.balance) > 0} />
        <Stat label={t("overdue")} value={fmt.money(a.overdue)} danger={Number(a.overdue) > 0} />
        <Stat label={t("credit")} value={fmt.money(a.credit)} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <CardTitle>
              {tm("membership")} {year && <span className="text-sm font-normal text-muted-foreground">{year.name}</span>}
            </CardTitle>
            {!current && year?.membershipFee && student.status !== "LEFT" && (
              <Button size="sm" onClick={() => setRegistering(true)}>
                <IdCard /> {tm("register")}
              </Button>
            )}
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-2 text-sm">
            {current ? (
              <>
                <span className="font-medium">{tm("member", { number: current.memberNumber })}</span>
                <Badge variant="outline">{current.isNew ? tm("isNew") : tm("renewal")}</Badge>
                <ChargeStateBadge state={current.state} />
              </>
            ) : (
              <span className="text-muted-foreground">{year?.membershipFee ? tm("notMember") : tm("noFee")}</span>
            )}
          </CardContent>
        </Card>

        {a.family && (
          <Card>
            <CardHeader>
              <CardTitle>{t("familyOf", { name: a.family.guardian.fullName })}</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2 text-sm">
              {siblings.map((s) => (
                <div key={s.id} className="flex items-center justify-between gap-2">
                  <Link href={`/students/${s.id}`} className="hover:underline">
                    {s.firstName} {s.lastName}
                  </Link>
                  <span>{fmt.money(s.balance)}</span>
                </div>
              ))}
              <div className="flex items-center justify-between gap-2 border-t pt-2 font-medium">
                <span>{t("balance")}</span>
                <span>{fmt.money(a.family.balance)}</span>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle>{t("title")}</CardTitle>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setCharging(true)}>
              <Plus /> {t("addCharge")}
            </Button>
            <Button size="sm" asChild>
              <Link href={`/payments/new?studentId=${student.id}`}>
                <Wallet /> {t("recordPayment")}
              </Link>
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <ChargesTable charges={a.charges} onCancel={setCancelling} />
        </CardContent>
      </Card>

      <StudentPayments studentId={student.id} />

      <ChargeDialog target={charging ? { studentId: student.id } : null} onOpenChange={setCharging} />
      <CancelChargeDialog charge={cancelling} onClose={() => setCancelling(null)} />
      {year && (
        <RegisterMembershipDialog
          open={registering}
          onOpenChange={setRegistering}
          student={{ id: student.id, name: `${student.firstName} ${student.lastName}` }}
          year={year}
        />
      )}
    </div>
  );
}

function Stat({ label, value, strong, danger }: { label: string; value: string; strong?: boolean; danger?: boolean }) {
  return (
    <Card className="py-4">
      <CardContent className="grid gap-1">
        <span className="text-sm text-muted-foreground">{label}</span>
        <span className={`text-2xl font-bold ${danger ? "text-destructive" : strong ? "" : "text-muted-foreground"}`}>{value}</span>
      </CardContent>
    </Card>
  );
}

/** Receipts that paid this student's charges (or that the student paid). */
function StudentPayments({ studentId }: { studentId: string }) {
  const t = useTranslations("fees");
  const tp = useTranslations("payments");
  const fmt = useFormat();
  const payments = useQuery({
    queryKey: ["payments", "student", studentId],
    queryFn: () => api<PaymentPage>(`/payments?studentId=${studentId}&pageSize=50`),
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("payments")}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-2 text-sm">
        {payments.data?.items.length === 0 && <p className="text-muted-foreground">{t("noPayments")}</p>}
        {payments.data?.items.map((p) => (
          <Link
            key={p.id}
            href={`/payments/${p.id}`}
            className={`flex items-center justify-between gap-2 rounded-md border p-3 hover:bg-muted ${p.voidedAt ? "text-muted-foreground" : ""}`}
          >
            <span>
              <span className="font-mono" dir="ltr">{p.receiptNumber}</span> · {fmt.date(p.paidAt)} · {p.payerName}
              {p.voidedAt && <Badge variant="destructive" className="ms-2">{tp("voided")}</Badge>}
            </span>
            <span className={`font-medium ${p.voidedAt ? "line-through" : ""}`}>{fmt.money(p.amount)}</span>
          </Link>
        ))}
      </CardContent>
    </Card>
  );
}
