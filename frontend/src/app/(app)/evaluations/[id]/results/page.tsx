"use client";

import { useQuery } from "@tanstack/react-query";
import { Medal, Printer } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { Suspense, useEffect } from "react";
import { StarMark } from "@/components/brand/star-mark";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api } from "@/lib/api";
import { useFormat } from "@/lib/format";
import type { EvaluationResults } from "@/lib/types";
import { useErrorMessage } from "@/lib/use-error-message";
import { cn } from "@/lib/utils";
import { CandidateStateBadge, mark, Score } from "../score";

const MEDAL = ["text-gold", "text-slate-400", "text-amber-700"];

/** Ranking per branch; `?print=1` opens the print dialog once loaded. */
export default function ResultsPage() {
  return (
    <Suspense>
      <Results />
    </Suspense>
  );
}

function Results() {
  const { id } = useParams<{ id: string }>();
  const t = useTranslations("evaluations");
  const tApp = useTranslations("app");
  const tc = useTranslations("common");
  const fmt = useFormat();
  const errorMessage = useErrorMessage();
  const autoPrint = useSearchParams().get("print") === "1";
  const r = useQuery({ queryKey: ["evaluation", id, "results"], queryFn: () => api<EvaluationResults>(`/evaluations/${id}/results`) });

  useEffect(() => {
    if (autoPrint && r.data) setTimeout(() => window.print(), 300);
  }, [autoPrint, r.data]);

  if (r.isError) return <p className="text-destructive">{errorMessage(r.error)}</p>;
  if (!r.data) return <p className="text-muted-foreground">{tc("loading")}</p>;
  const { evaluation: ev, jurors, branches } = r.data;

  return (
    <div className="grid gap-6">
      <div className="print:hidden">
        <PageHeader
          backHref={`/evaluations/${id}`}
          title={t("results")}
          subtitle={`${ev.title} · ${fmt.date(ev.date)}`}
          actions={
            <Button onClick={() => window.print()}>
              <Printer /> {t("printResults")}
            </Button>
          }
        />
      </div>

      {/* Print heading */}
      <div className="hidden text-center print:block">
        <p className="flex items-center justify-center gap-2 font-bold">
          <StarMark className="size-6 text-gold" /> {tApp("name")}
        </p>
        <h1 className="mt-2 font-heading text-2xl">{t("resultsTitle", { title: ev.title })}</h1>
        <p className="text-sm">
          {fmt.date(ev.date)}
          {ev.location && ` · ${ev.location}`}
        </p>
      </div>

      {branches.map(({ branch, rows, stats }) => (
        <Card key={branch.id} className="break-inside-avoid print:border-0 print:shadow-none">
          <CardHeader className="gap-1">
            <CardTitle className="font-heading text-xl">
              {t("branch")}: {branch.name}
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              {t("scale", { hifz: mark(branch.hifzMax), tajwid: mark(branch.tajwidMax), total: mark(branch.maxTotal) })}
              {branch.passScore !== null && ` · ${t("passMark", { score: mark(branch.passScore) })}`}
            </p>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="flex flex-wrap gap-2 text-sm print:hidden">
              <Badge variant="outline">{t("stats.scored")}: {stats.scored}/{stats.candidates}</Badge>
              {stats.pending > 0 && <Badge variant="outline">{t("stats.pending")}: {stats.pending}</Badge>}
              {stats.absent > 0 && <Badge variant="outline">{t("stats.absent")}: {stats.absent}</Badge>}
              {stats.passed !== null && <Badge variant="outline">{t("stats.passed")}: {stats.passed}</Badge>}
              {stats.average !== null && <Badge variant="outline">{t("stats.average")}: <span dir="ltr">{mark(stats.average)}</span></Badge>}
            </div>
            <div className="overflow-x-auto rounded-lg border print:overflow-visible print:rounded-none">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-16">{t("rank")}</TableHead>
                    <TableHead>{t("fullName")}</TableHead>
                    <TableHead>{t("hifz")}</TableHead>
                    <TableHead>{t("tajwid")}</TableHead>
                    <TableHead>{t("total")}</TableHead>
                    {branch.passScore !== null && <TableHead />}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground">{t("noCandidates")}</TableCell>
                    </TableRow>
                  )}
                  {rows.map((c) => (
                    <TableRow key={c.id} className={cn(c.state !== "SCORED" && "text-muted-foreground")}>
                      <TableCell className="font-bold">
                        {c.rank !== null ? (
                          <span className="flex items-center gap-1">
                            {c.rank <= 3 && <Medal className={cn("size-4", MEDAL[c.rank - 1])} aria-hidden />}
                            {c.rank}
                          </span>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell>
                        <Link href={`/evaluations/${id}/candidates/${c.id}`} className="font-medium hover:underline print:no-underline">
                          {c.fullName}
                        </Link>
                      </TableCell>
                      <TableCell><Score value={c.hifzScore} max={branch.hifzMax} /></TableCell>
                      <TableCell><Score value={c.tajwidScore} max={branch.tajwidMax} /></TableCell>
                      <TableCell>
                        {c.state === "SCORED" ? <Score value={c.total} max={branch.maxTotal} strong /> : <CandidateStateBadge state={c.state} />}
                      </TableCell>
                      {branch.passScore !== null && (
                        <TableCell>{c.passed === null ? "" : c.passed ? t("passed") : t("failed")}</TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      ))}

      {jurors.length > 0 && (
        <div className="grid gap-2 text-sm">
          <span className="font-bold">{t("jurySignature")}:</span>
          <div className="flex flex-wrap gap-x-10 gap-y-2">
            {jurors.map((j) => (
              <span key={j.id} className="min-w-44 border-b border-dotted pb-6">
                {j.name}
                {j.isPresident && ` (${t("president")})`}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
