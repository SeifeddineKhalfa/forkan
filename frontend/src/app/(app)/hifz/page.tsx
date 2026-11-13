"use client";

import { useQuery } from "@tanstack/react-query";
import { BookPlus, FileText } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useState } from "react";
import { HifzEntryDialog, type HifzTarget } from "@/components/hifz/hifz-entry-dialog";
import { UnverifiedBanner } from "@/components/hifz/hifz-grid";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api } from "@/lib/api";
import { useMe } from "@/lib/auth";
import { useQuranMeta } from "@/lib/quran";
import type { ClassHifz, ClassItem } from "@/lib/types";
import { useErrorMessage } from "@/lib/use-error-message";
import { cn } from "@/lib/utils";

/** Imla' overview: everyone's progress and how long since their last sabaq. */
export default function HifzPage() {
  const t = useTranslations("hifz");
  const tc = useTranslations("common");
  const errorMessage = useErrorMessage();
  const { data: me } = useMe();
  const meta = useQuranMeta();
  const classes = useQuery({ queryKey: ["classes", ""], queryFn: () => api<ClassItem[]>("/classes") });
  const [chosen, setChosen] = useState<string | null>(null);
  const classId = chosen ?? classes.data?.[0]?.id ?? null;
  const overview = useQuery({
    queryKey: ["hifz", "class", classId],
    queryFn: () => api<ClassHifz>(`/classes/${classId}/hifz`),
    enabled: !!classId,
  });
  const [target, setTarget] = useState<HifzTarget | null>(null);

  return (
    <div className="grid gap-6">
      <PageHeader
        title={t("title")}
        subtitle={t("subtitle")}
        actions={
          classId && (
            <Button variant="outline" asChild>
              <a href={`/api/classes/${classId}/hifz/report.pdf`} target="_blank" rel="noopener">
                <FileText /> {t("report")}
              </a>
            </Button>
          )
        }
      />
      <UnverifiedBanner verified={meta.data?.verified} />

      <Select value={classId ?? undefined} onValueChange={setChosen}>
        <SelectTrigger className="w-full sm:w-96" aria-label={t("class")}>
          <SelectValue placeholder={t("chooseClass")} />
        </SelectTrigger>
        <SelectContent>
          {classes.data?.map((c) => (
            <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      {overview.isError && <p className="text-destructive">{errorMessage(overview.error)}</p>}
      {overview.data && (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("student")}</TableHead>
                <TableHead className="min-w-40">{t("progress")}</TableHead>
                <TableHead>{t("position")}</TableHead>
                <TableHead>{t("daysSinceNew")}</TableHead>
                <TableHead><span className="sr-only">{tc("actions")}</span></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {overview.data.students.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground">{t("noStudents")}</TableCell>
                </TableRow>
              )}
              {overview.data.students.map((s) => {
                const m = s.summary;
                const athman = m?.memorizedAthman ?? 0;
                const stale = m?.daysSinceNew !== null && m?.daysSinceNew !== undefined && m.daysSinceNew > 14;
                return (
                  <TableRow key={s.id}>
                    <TableCell>
                      <Link href={`/hifz/students/${s.id}`} className="font-medium hover:underline">
                        {s.firstName} {s.lastName}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <div className="grid gap-1">
                        <div className="h-2 overflow-hidden rounded-full bg-muted" role="presentation">
                          <div className="h-full rounded-full bg-primary" style={{ width: `${(athman / 480) * 100}%` }} />
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {t("completedAhzab", { count: m?.completedAhzab ?? 0 })} · {t("memorizedAthman", { count: athman })}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{m?.position ? t("positionValue", m.position) : t("never")}</TableCell>
                    <TableCell className={cn("whitespace-nowrap", stale && "font-medium text-destructive")}>
                      {m?.daysSinceNew === null || m?.daysSinceNew === undefined ? t("never") : t("days", { count: m.daysSinceNew })}
                    </TableCell>
                    <TableCell className="text-end">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setTarget({ studentId: s.id, name: `${s.firstName} ${s.lastName}`, currentThumn: m?.currentThumn })}
                      >
                        <BookPlus /> {t("record")}
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <HifzEntryDialog target={target} office={!!me && me.role !== "TEACHER"} onClose={() => setTarget(null)} />
    </div>
  );
}
