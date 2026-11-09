"use client";

import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { CandidateStateBadge, Score } from "@/app/(app)/evaluations/[id]/score";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api } from "@/lib/api";
import { useFormat } from "@/lib/format";
import type { StudentEvaluation } from "@/lib/types";
import { useErrorMessage } from "@/lib/use-error-message";

/** Student profile: exams and competitions taken, newest first. */
export function StudentEvaluations({ studentId }: { studentId: string }) {
  const t = useTranslations("evaluations");
  const tc = useTranslations("common");
  const fmt = useFormat();
  const errorMessage = useErrorMessage();
  const list = useQuery({
    queryKey: ["evaluations", "student", studentId],
    queryFn: () => api<StudentEvaluation[]>(`/students/${studentId}/evaluations`),
  });
  if (list.isError) return <p className="text-destructive">{errorMessage(list.error)}</p>;
  if (!list.data) return <p className="text-muted-foreground">{tc("loading")}</p>;
  if (list.data.length === 0) {
    return (
      <Card>
        <CardContent className="text-center text-muted-foreground">{t("studentEmpty")}</CardContent>
      </Card>
    );
  }
  return (
    <div className="overflow-x-auto rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("fields.date")}</TableHead>
            <TableHead>{t("fields.title")}</TableHead>
            <TableHead>{t("branch")}</TableHead>
            <TableHead>{t("total")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {list.data.map((r) => (
            <TableRow key={r.id}>
              <TableCell className="whitespace-nowrap">{fmt.date(r.evaluation.date)}</TableCell>
              <TableCell>
                <Link href={`/evaluations/${r.evaluation.id}/candidates/${r.id}`} className="font-medium hover:underline">
                  {r.evaluation.title}
                </Link>
                <Badge variant="outline" className="ms-2 font-normal">{t(`kind.${r.evaluation.kind}`)}</Badge>
              </TableCell>
              <TableCell>{r.branch.name}</TableCell>
              <TableCell>
                {r.state === "SCORED" ? (
                  <span className="flex items-center gap-2">
                    <Score value={r.total} max={r.branch.maxTotal} strong />
                    {r.passed !== null && (
                      <Badge variant={r.passed ? "default" : "destructive"} className="font-normal">
                        {r.passed ? t("passed") : t("failed")}
                      </Badge>
                    )}
                  </span>
                ) : (
                  <CandidateStateBadge state={r.state} />
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
