"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, MessageCircle, SkipForward } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { RoleGate } from "@/components/app-shell/role-gate";
import { PageHeader } from "@/components/page-header";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import { useFormat } from "@/lib/format";
import type { AcademicYear, ReminderGroup } from "@/lib/types";
import { useErrorMessage } from "@/lib/use-error-message";
import { fillTemplate, plainAmount, sendWhatsApp, useSettings } from "@/lib/whatsapp";

type Kind = "OVERDUE" | "MEMBERSHIP";

export default function RemindersPage() {
  return (
    <RoleGate roles={["STAFF"]}>
      <Reminders />
    </RoleGate>
  );
}

function Reminders() {
  const t = useTranslations("payments");
  const [type, setType] = useState<Kind>("OVERDUE");
  return (
    <div className="grid max-w-5xl gap-6">
      <PageHeader backHref="/payments" title={t("reminders")} subtitle={t("remindersHint")} />
      <Tabs value={type} onValueChange={(v) => setType(v as Kind)}>
        <TabsList>
          <TabsTrigger value="OVERDUE">{t("overdueTab")}</TabsTrigger>
          <TabsTrigger value="MEMBERSHIP">{t("membershipTab")}</TabsTrigger>
        </TabsList>
      </Tabs>
      <Runner key={type} type={type} />
    </div>
  );
}

/** One family at a time: send (opens WhatsApp), then the next one is ready when staff comes back. */
function Runner({ type }: { type: Kind }) {
  const t = useTranslations("payments");
  const tc = useTranslations("common");
  const fmt = useFormat();
  const errorMessage = useErrorMessage();
  const qc = useQueryClient();
  const settings = useSettings();
  const groups = useQuery({
    queryKey: ["payments", "reminders", type],
    queryFn: () => api<ReminderGroup[]>(`/payments/reminders?type=${type}`),
  });
  const year = useQuery({
    queryKey: ["academic-years", "current"],
    queryFn: () => api<AcademicYear>("/academic-years/current"),
    enabled: type === "MEMBERSHIP",
  });
  const [done, setDone] = useState<Record<string, "SENT" | "SKIPPED">>({});
  const [edited, setEdited] = useState<Record<string, string>>({});

  if (groups.isError) return <p className="text-destructive">{errorMessage(groups.error)}</p>;
  if (!groups.data) return <p className="text-muted-foreground">{tc("loading")}</p>;
  const list = groups.data;
  if (list.length === 0) {
    return (
      <Alert>
        <AlertDescription>{t("noneToRemind")}</AlertDescription>
      </Alert>
    );
  }

  const message = (g: ReminderGroup) => {
    if (edited[g.key] !== undefined) return edited[g.key];
    const templates = settings.data?.whatsappTemplates ?? {};
    const studentName = g.students.join(" و");
    return type === "OVERDUE"
      ? fillTemplate(templates.PAYMENT_REMINDER ?? "", {
          studentName,
          amount: plainAmount(g.total),
          label: g.charges.map((c) => c.label).join("، "),
        })
      : fillTemplate(templates.MEMBERSHIP_REMINDER ?? "", {
          studentName,
          amount: plainAmount(g.total),
          year: year.data?.name ?? "",
          deadline: year.data?.membershipWindowEnd ? fmt.date(year.data.membershipWindowEnd) : "",
        });
  };

  const send = (g: ReminderGroup) => {
    if (!g.payer.phone) return;
    sendWhatsApp({
      kind: type === "OVERDUE" ? "PAYMENT_REMINDER" : "MEMBERSHIP_REMINDER",
      phone: g.payer.phone,
      body: message(g),
      ...(g.payer.type === "GUARDIAN" ? { guardianId: g.payer.id } : { studentId: g.payer.id }),
    })
      .then(() => void qc.invalidateQueries({ queryKey: ["payments", "reminders", type] }))
      .catch((e: unknown) => toast.error(errorMessage(e)));
    setDone((d) => ({ ...d, [g.key]: "SENT" }));
  };

  const sendable = list.filter((g) => g.payer.phone);
  const next = sendable.find((g) => !done[g.key]);
  const finished = Object.keys(done).length;

  return (
    <div className="grid gap-6">
      {next ? (
        <Card className="border-primary">
          <CardHeader className="flex flex-row items-start justify-between gap-2">
            <div>
              <CardTitle>{next.payer.name}</CardTitle>
              <p className="text-sm text-muted-foreground">
                {next.students.join("، ")} · <span dir="ltr">{next.payer.phone}</span>
              </p>
            </div>
            <div className="text-end">
              <p className="text-xl font-bold">{fmt.money(next.total)}</p>
              <p className="text-xs text-muted-foreground">{t("progress", { done: finished, total: sendable.length })}</p>
            </div>
          </CardHeader>
          <CardContent className="grid gap-3">
            <Textarea rows={3} value={message(next)} onChange={(e) => setEdited({ ...edited, [next.key]: e.target.value })} />
            <p className="text-xs text-muted-foreground">
              {next.lastReminderAt ? t("lastReminder", { date: fmt.date(next.lastReminderAt) }) : t("never")}
            </p>
            <div className="flex gap-2">
              <Button size="lg" onClick={() => send(next)}>
                <MessageCircle /> {t("start")}
              </Button>
              <Button size="lg" variant="outline" onClick={() => setDone({ ...done, [next.key]: "SKIPPED" })}>
                <SkipForward /> {t("skip")}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Alert>
          <AlertDescription className="flex items-center gap-2">
            <Check className="size-4" /> {t("progress", { done: finished, total: sendable.length })}
          </AlertDescription>
        </Alert>
      )}

      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("payer")}</TableHead>
              <TableHead>{t("students")}</TableHead>
              <TableHead>{t("total")}</TableHead>
              <TableHead>{tc("actions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {list.map((g) => (
              <TableRow key={g.key} className={next?.key === g.key ? "bg-muted/50" : undefined}>
                <TableCell>
                  {g.payer.name}
                  <span className="block text-xs text-muted-foreground" dir="ltr">{g.payer.phone ?? t("noPhone")}</span>
                </TableCell>
                <TableCell className="max-w-80 text-sm">
                  {g.charges.map((c) => (
                    <span key={c.id} className="block">
                      {c.student} — {c.label} ({fmt.money(c.remaining)})
                    </span>
                  ))}
                </TableCell>
                <TableCell className="whitespace-nowrap font-medium">{fmt.money(g.total)}</TableCell>
                <TableCell className="whitespace-nowrap">
                  {done[g.key] ? (
                    <Badge variant={done[g.key] === "SENT" ? "default" : "secondary"}>{done[g.key] === "SENT" ? t("done") : t("skip")}</Badge>
                  ) : (
                    <Button size="sm" variant="outline" disabled={!g.payer.phone} onClick={() => send(g)}>
                      <MessageCircle /> {t("sendOne")}
                    </Button>
                  )}
                  <span className="block text-xs text-muted-foreground">
                    {g.lastReminderAt ? t("lastReminder", { date: fmt.date(g.lastReminderAt) }) : t("never")}
                  </span>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
