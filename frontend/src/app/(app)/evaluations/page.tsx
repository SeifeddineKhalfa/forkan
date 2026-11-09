"use client";

import { useQuery } from "@tanstack/react-query";
import { Award, CalendarDays, MapPin, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useState } from "react";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { useMe } from "@/lib/auth";
import { useFormat } from "@/lib/format";
import type { EvaluationListItem } from "@/lib/types";
import { useErrorMessage } from "@/lib/use-error-message";
import { EvaluationFormDialog } from "./evaluation-form-dialog";

/** Exams and competitions. Teachers see the ones where they sit on the jury. */
export default function EvaluationsPage() {
  const t = useTranslations("evaluations");
  const tc = useTranslations("common");
  const fmt = useFormat();
  const errorMessage = useErrorMessage();
  const { data: me } = useMe();
  const [kind, setKind] = useState("ALL");
  const [creating, setCreating] = useState(false);
  const list = useQuery({
    queryKey: ["evaluations", kind],
    queryFn: () => api<EvaluationListItem[]>(`/evaluations${kind === "ALL" ? "" : `?kind=${kind}`}`),
  });
  const office = me && me.role !== "TEACHER";

  return (
    <div className="grid gap-6">
      <PageHeader
        title={t("title")}
        subtitle={t("subtitle")}
        actions={
          <>
            <Select value={kind} onValueChange={setKind}>
              <SelectTrigger className="w-36" aria-label={t("filterKind")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">{t("filterKind")}: {tc("all")}</SelectItem>
                <SelectItem value="COMPETITION">{t("kind.COMPETITION")}</SelectItem>
                <SelectItem value="EXAM">{t("kind.EXAM")}</SelectItem>
              </SelectContent>
            </Select>
            {office && (
              <Button onClick={() => setCreating(true)}>
                <Plus /> {t("new")}
              </Button>
            )}
          </>
        }
      />

      {list.isError && <p className="text-destructive">{errorMessage(list.error)}</p>}
      {list.isPending && (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-40" />
          ))}
        </div>
      )}
      {list.data?.length === 0 && (
        <Card className="py-10">
          <CardContent className="grid justify-items-center gap-3 text-center text-muted-foreground">
            <Award className="size-10 text-gold" />
            {office ? t("empty") : t("emptyTeacher")}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {list.data?.map((e) => (
          <Link key={e.id} href={`/evaluations/${e.id}`} className="group rounded-xl focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
            <Card className="h-full transition-colors group-hover:border-primary/40">
              <CardHeader className="gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={e.kind === "COMPETITION" ? "default" : "secondary"}>{t(`kind.${e.kind}`)}</Badge>
                  <Badge variant="outline">{t(`status.${e.status}`)}</Badge>
                </div>
                <CardTitle className="font-heading text-lg leading-snug">{e.title}</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-2 text-sm text-muted-foreground">
                <span className="flex items-center gap-2">
                  <CalendarDays className="size-4" /> {fmt.date(e.date)}
                </span>
                {e.location && (
                  <span className="flex items-center gap-2">
                    <MapPin className="size-4" /> {e.location}
                  </span>
                )}
                {e.class && <span>{e.class.name}</span>}
                <div className="flex flex-wrap gap-1">
                  {e.branches.map((b) => (
                    <Badge key={b.id} variant="outline" className="font-normal">{b.name}</Badge>
                  ))}
                </div>
                <div className="mt-1 flex items-center justify-between gap-2 text-foreground">
                  <span>{t("candidatesCount", { count: e.candidates })}</span>
                  {e.candidates > 0 && <span className="text-xs">{t("cardsDone", { done: e.cardsDone, total: e.candidates })}</span>}
                </div>
                {e.candidates > 0 && (
                  <div className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
                    <div className="h-full bg-primary" style={{ width: `${(e.cardsDone / e.candidates) * 100}%` }} />
                  </div>
                )}
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <EvaluationFormDialog open={creating} onOpenChange={setCreating} />
    </div>
  );
}
