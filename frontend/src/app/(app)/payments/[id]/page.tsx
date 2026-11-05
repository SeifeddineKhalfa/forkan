"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ban, Copy, FileText, MessageCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { RoleGate } from "@/components/app-shell/role-gate";
import { Field } from "@/components/form/field";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import { useMe } from "@/lib/auth";
import { useFormat } from "@/lib/format";
import type { PaymentDetail } from "@/lib/types";
import { useErrorMessage } from "@/lib/use-error-message";
import { fillTemplate, plainAmount, sendWhatsApp, useSettings } from "@/lib/whatsapp";

export default function PaymentPage() {
  return (
    <RoleGate roles={["STAFF"]}>
      <Receipt />
    </RoleGate>
  );
}

function Receipt() {
  const { id } = useParams<{ id: string }>();
  const t = useTranslations("payments");
  const tc = useTranslations("common");
  const te = useTranslations("enums");
  const fmt = useFormat();
  const errorMessage = useErrorMessage();
  const { data: me } = useMe();
  const settings = useSettings();
  const [voiding, setVoiding] = useState(false);
  const payment = useQuery({ queryKey: ["payments", id], queryFn: () => api<PaymentDetail>(`/payments/${id}`) });

  if (payment.isError) return <p className="text-destructive">{errorMessage(payment.error)}</p>;
  if (!payment.data) return <p className="text-muted-foreground">{tc("loading")}</p>;
  const p = payment.data;
  const issued = p.allocations.filter((a) => !a.fromCredit);
  const later = p.allocations.filter((a) => a.fromCredit);
  const publicUrl = `${window.location.origin}${p.publicPath}`;
  const students = [...new Set(p.allocations.map((a) => `${a.charge.student.firstName} ${a.charge.student.lastName}`))];

  const share = () => {
    if (!p.phone) return;
    const template = settings.data?.whatsappTemplates.RECEIPT ?? "{{receiptUrl}}";
    const body = fillTemplate(template, {
      amount: plainAmount(p.amount),
      studentName: students.join(" و") || p.payerName,
      receiptUrl: publicUrl,
      receiptNumber: p.receiptNumber,
    });
    sendWhatsApp({ kind: "RECEIPT", phone: p.phone, body, paymentId: p.id, guardianId: p.payerGuardian?.id, studentId: p.payerStudent?.id }).catch(
      (e: unknown) => toast.error(errorMessage(e)),
    );
  };
  const copy = async () => {
    await navigator.clipboard.writeText(publicUrl);
    toast.success(t("linkCopied"));
  };

  return (
    <div className="grid max-w-4xl gap-6">
      <PageHeader
        backHref="/payments"
        title={
          <>
            {t("receipt", { number: "" })}
            <span className="font-mono" dir="ltr">{p.receiptNumber}</span>
            {p.voidedAt && <Badge variant="destructive" className="ms-2 align-middle">{t("voided")}</Badge>}
          </>
        }
        subtitle={`${fmt.date(p.paidAt)} · ${p.payerName}`}
        actions={
          <>
            <Button variant="outline" asChild>
              <a href={`/api/payments/${p.id}/receipt.pdf`} target="_blank" rel="noopener">
                <FileText /> {t("openPdf")}
              </a>
            </Button>
            {!p.voidedAt && (
              <>
                <Button onClick={share} disabled={!p.phone} title={p.phone ? undefined : t("noPhone")}>
                  <MessageCircle /> {t("shareWhatsapp")}
                </Button>
                <Button variant="outline" onClick={() => void copy()}>
                  <Copy /> {t("copyLink")}
                </Button>
              </>
            )}
            {me?.role === "ADMIN" && !p.voidedAt && (
              <Button variant="destructive" onClick={() => setVoiding(true)}>
                <Ban /> {t("void")}
              </Button>
            )}
          </>
        }
      />

      {p.voidedAt && (
        <p className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
          {t("voidedBy", {
            date: fmt.date(p.voidedAt),
            name: p.voidedBy ? `${p.voidedBy.firstName} ${p.voidedBy.lastName}` : "—",
            reason: p.voidReason ?? "",
          })}
        </p>
      )}

      <Card>
        <CardContent className="grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
          <Row label={t("amount")} value={<span className="text-lg font-bold">{fmt.money(p.amount)}</span>} />
          <Row label={t("method")} value={`${te(`paymentMethod.${p.method}`)}${p.reference ? ` — ${p.reference}` : ""}`} />
          <Row
            label={t("payer")}
            value={
              p.payerStudent ? (
                <Link href={`/students/${p.payerStudent.id}`} className="hover:underline">{p.payerName}</Link>
              ) : (
                p.payerName
              )
            }
          />
          <Row label={t("receivedBy")} value={`${p.receivedBy.firstName} ${p.receivedBy.lastName}`} />
          {Number(p.unallocatedAmount) > 0 && <Row label={t("credit")} value={fmt.money(p.unallocatedAmount)} />}
          {p.notes && <Row label={t("notes")} value={p.notes} />}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("lines")}</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("students")}</TableHead>
                <TableHead>{t("lines")}</TableHead>
                <TableHead>{t("amount")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[...issued, ...later].map((a) => (
                <TableRow key={a.chargeId}>
                  <TableCell>
                    <Link href={`/students/${a.charge.student.id}`} className="hover:underline">
                      {a.charge.student.firstName} {a.charge.student.lastName}
                    </Link>
                  </TableCell>
                  <TableCell>
                    {a.charge.label} {a.fromCredit && <Badge variant="outline">{t("fromCredit")}</Badge>}
                  </TableCell>
                  <TableCell>{fmt.money(a.amount)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <VoidDialog open={voiding} onOpenChange={setVoiding} payment={p} />
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 border-b py-1.5 last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-end">{value}</span>
    </div>
  );
}

function VoidDialog({ open, onOpenChange, payment }: { open: boolean; onOpenChange: (o: boolean) => void; payment: PaymentDetail }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>{open && <VoidBody payment={payment} onClose={() => onOpenChange(false)} />}</DialogContent>
    </Dialog>
  );
}

function VoidBody({ payment, onClose }: { payment: PaymentDetail; onClose: () => void }) {
  const t = useTranslations("payments");
  const tc = useTranslations("common");
  const fmt = useFormat();
  const errorMessage = useErrorMessage();
  const qc = useQueryClient();
  const [reason, setReason] = useState("");
  const voidIt = useMutation({
    mutationFn: () => api(`/payments/${payment.id}/void`, { method: "POST", body: { reason } }),
    onSuccess: () => {
      toast.success(t("voidDone"));
      for (const key of ["payments", "charges", "account", "finance", "memberships", "classes"]) void qc.invalidateQueries({ queryKey: [key] });
      onClose();
    },
  });
  return (
    <>
      <DialogHeader>
        <DialogTitle>
          {t("void")} <span dir="ltr">{payment.receiptNumber}</span>
        </DialogTitle>
        <DialogDescription>
          {payment.payerName} · {fmt.money(payment.amount)}
        </DialogDescription>
      </DialogHeader>
      <p className="text-sm text-muted-foreground">{t("voidHint")}</p>
      <Field label={t("voidReason")} htmlFor="void-reason">
        <Textarea id="void-reason" value={reason} onChange={(e) => setReason(e.target.value)} />
      </Field>
      {voidIt.isError && <p role="alert" className="text-sm text-destructive">{errorMessage(voidIt.error)}</p>}
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>{tc("close")}</Button>
        <Button variant="destructive" disabled={reason.trim().length < 3 || voidIt.isPending} onClick={() => voidIt.mutate()}>
          {tc("confirm")}
        </Button>
      </DialogFooter>
    </>
  );
}
