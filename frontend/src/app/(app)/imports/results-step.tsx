"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { ImportPlan, Issue, RowPlan } from "./types";

const NEW = "NEW";

function useIssueText() {
  const ti = useTranslations("imports.issue") as unknown as (k: string, p?: Record<string, string | number>) => string;
  const tf = useTranslations("imports.fields") as unknown as (k: string) => string;
  return (issue: Issue) => {
    const field = issue.field ? tf(issue.field) : "";
    return ti(issue.code, { field, ...issue.params });
  };
}

export function SummaryCards({ plan }: { plan: ImportPlan }) {
  const t = useTranslations("imports.summary");
  const c = plan.counts;
  const items: [string, number, string?][] = [
    [t("create"), c.students.create, "text-primary"],
    [t("exists"), c.students.exists],
    [t("error"), c.students.error + c.teachers.error, c.students.error + c.teachers.error ? "text-destructive" : undefined],
    [t("warning"), c.students.warning, c.students.warning ? "text-accent-foreground" : undefined],
    [t("newGuardians"), c.newGuardians],
    [t("enrollments"), c.enrollments],
    [t("openingBalances"), c.openingBalances],
    [t("teachers"), c.teachers.create],
  ];
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {items.map(([label, value, cls]) => (
        <Card key={label} className="py-3">
          <CardContent className="px-4">
            <p className={`text-2xl font-bold ${cls ?? ""}`}>{value}</p>
            <p className="text-sm text-muted-foreground">{label}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

/** Row-by-row dry-run report; rows whose guardian phone belongs to someone else get a choice. */
export function ResultsTable({
  plan,
  decisions,
  onDecision,
}: {
  plan: ImportPlan;
  decisions: Record<string, string>;
  onDecision: (key: string, value: string) => void;
}) {
  const t = useTranslations("imports");
  const issueText = useIssueText();
  const [filter, setFilter] = useState<"all" | "error" | "warning">("all");
  const rows: (RowPlan & { sheet: "students" | "teachers" })[] = [
    ...plan.students.map((r) => ({ ...r, sheet: "students" as const })),
    ...plan.teachers.map((r) => ({ ...r, sheet: "teachers" as const })),
  ].filter((r) =>
    filter === "all"
      ? true
      : filter === "error"
        ? r.status === "ERROR"
        : r.guardians?.some((g) => g.candidates?.length) ?? false,
  );

  return (
    <div className="grid gap-3">
      <Tabs value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
        <TabsList>
          <TabsTrigger value="all">{t("filter.all")}</TabsTrigger>
          <TabsTrigger value="error">{t("filter.error")}</TabsTrigger>
          <TabsTrigger value="warning">{t("filter.warning")}</TabsTrigger>
        </TabsList>
      </Tabs>
      <div className="max-h-[60svh] overflow-auto rounded-lg border">
        <Table>
          <TableHeader className="sticky top-0 bg-background">
            <TableRow>
              <TableHead className="w-16">{t("row")}</TableHead>
              <TableHead>{t("name")}</TableHead>
              <TableHead className="w-24">{t("status")}</TableHead>
              <TableHead>{t("details")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={`${r.sheet}-${r.row}`} className={r.status === "ERROR" ? "bg-destructive/5" : undefined}>
                <TableCell className="font-mono text-xs">{r.sheet === "teachers" ? `م${r.row}` : r.row}</TableCell>
                <TableCell>
                  {r.name || "—"}
                  {r.className && <span className="block text-xs text-muted-foreground">{r.className}</span>}
                </TableCell>
                <TableCell>
                  <Badge variant={r.status === "ERROR" ? "destructive" : r.status === "CREATE" ? "default" : "secondary"}>
                    {t(`statusLabel.${r.status}`)}
                  </Badge>
                </TableCell>
                <TableCell className="grid gap-2 text-sm">
                  {r.existingCode && <span className="text-muted-foreground">{t("issue.existsAs", { code: r.existingCode })}</span>}
                  {r.errors.map((e, i) => (
                    <span key={i} className="text-destructive">{issueText(e)}</span>
                  ))}
                  {r.guardians
                    ?.filter((g) => g.candidates?.length)
                    .map((g) => {
                      const key = `${r.row}:${g.slot}`;
                      return (
                        <div key={key} className="grid gap-1">
                          <span className="text-accent-foreground">{t("phoneShared", { slot: g.slot })}</span>
                          <Select value={decisions[key] ?? NEW} onValueChange={(v) => onDecision(key, v)}>
                            <SelectTrigger className="w-full max-w-sm">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value={NEW}>
                                {t("newGuardian")} ({g.fullName})
                              </SelectItem>
                              {g.candidates!.map((c) => (
                                <SelectItem key={c.id} value={c.id}>
                                  {t("sameFamily", { name: c.fullName })}
                                  {c.students.length > 0 && ` — ${c.students.join("، ")}`}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      );
                    })}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
