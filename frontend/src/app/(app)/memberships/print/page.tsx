"use client";

import { useQuery } from "@tanstack/react-query";
import { Printer } from "lucide-react";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { RoleGate } from "@/components/app-shell/role-gate";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { useFormat } from "@/lib/format";
import type { MembershipList } from "@/lib/types";

/** Member list for the general assembly: the browser's print dialog (A4, shell hidden). */
export default function MembershipsPrintPage() {
  return (
    <RoleGate roles={["STAFF"]}>
      <Suspense>
        <PrintList />
      </Suspense>
    </RoleGate>
  );
}

function PrintList() {
  const t = useTranslations("memberships");
  const ts = useTranslations("students");
  const tApp = useTranslations("app");
  const tc = useTranslations("common");
  const fmt = useFormat();
  const yearId = useSearchParams().get("year");
  const list = useQuery({
    queryKey: ["memberships", "print", yearId],
    queryFn: () => api<MembershipList>(`/memberships${yearId ? `?academicYearId=${yearId}` : ""}`),
  });
  if (!list.data) return <p className="text-muted-foreground">{tc("loading")}</p>;
  const { year, items } = list.data;

  return (
    <div className="grid gap-4">
      <div className="print:hidden">
        <PageHeader
          backHref="/memberships"
          title={t("print")}
          actions={
            <Button onClick={() => window.print()}>
              <Printer /> {t("print")}
            </Button>
          }
        />
      </div>
      <div className="mx-auto w-full max-w-3xl bg-background text-sm print:max-w-none">
        <p className="text-center font-bold">{tApp("name")}</p>
        <h1 className="mt-2 text-center text-xl font-bold">{t("printTitle", { year: year.name })}</h1>
        <p className="mb-4 text-center text-xs text-muted-foreground">{t("printedOn", { date: fmt.date(new Date().toISOString()) })}</p>
        <table className="w-full border-collapse [&_td]:border [&_td]:px-2 [&_td]:py-1 [&_th]:border [&_th]:bg-muted [&_th]:px-2 [&_th]:py-1">
          <thead>
            <tr>
              <th>{t("memberNumber")}</th>
              <th className="text-start">{ts("fullName")}</th>
              <th>{t("type")}</th>
              <th>{t("fee")}</th>
            </tr>
          </thead>
          <tbody>
            {items.map((m) => (
              <tr key={m.id} className="break-inside-avoid">
                <td className="text-center font-mono" dir="ltr">{m.memberNumber}</td>
                <td>
                  {m.student.firstName} {m.student.lastName}
                </td>
                <td className="text-center">{m.isNew ? t("isNew") : t("renewal")}</td>
                <td className="text-center">{m.charge.status === "PAID" ? t("summaryPaid") : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-3 text-xs">{tc("totalCount", { count: items.length })}</p>
      </div>
    </div>
  );
}
