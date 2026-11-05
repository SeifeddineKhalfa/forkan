"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BookPlus, Headphones, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/lib/api";
import { useMe } from "@/lib/auth";
import { useFormat } from "@/lib/format";
import { ofThumn, useQuranMeta } from "@/lib/quran";
import type { HifzEntry, QuranMeta, StudentHifz as Data } from "@/lib/types";
import { useErrorMessage } from "@/lib/use-error-message";
import { HifzEntryDialog, type HifzTarget } from "./hifz-entry-dialog";
import { HifzGrid, UnverifiedBanner } from "./hifz-grid";

/** "البقرة 5 ← البقرة 20 (الحزب 1، الثمن 2 ← الثمن 3)" */
export function useEntryLabel(meta: QuranMeta | undefined) {
  const t = useTranslations("hifz");
  return (e: HifzEntry) => {
    const name = (s: number) => meta?.surahs[s - 1]?.nameAr ?? String(s);
    const a = ofThumn(e.fromThumn);
    const b = ofThumn(e.toThumn);
    return `${name(e.fromSurah)} ${e.fromAyah} ← ${name(e.toSurah)} ${e.toAyah} · ${t("positionValue", a)}${
      e.fromThumn === e.toThumn ? "" : ` ← ${t("positionValue", b)}`
    }`;
  };
}

export function StudentHifz({ studentId, name }: { studentId: string; name: string }) {
  const t = useTranslations("hifz");
  const tm = useTranslations("mushaf");
  const te = useTranslations("enums");
  const tc = useTranslations("common");
  const fmt = useFormat();
  const errorMessage = useErrorMessage();
  const qc = useQueryClient();
  const { data: me } = useMe();
  const meta = useQuranMeta();
  const label = useEntryLabel(meta.data);
  const [target, setTarget] = useState<HifzTarget | null>(null);
  const hifz = useQuery({ queryKey: ["hifz", "student", studentId], queryFn: () => api<Data>(`/students/${studentId}/hifz`) });
  const remove = useMutation({
    mutationFn: (id: string) => api(`/hifz/sessions/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success(t("deleted"));
      void qc.invalidateQueries({ queryKey: ["hifz"] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  if (hifz.isError) return <p className="text-destructive">{errorMessage(hifz.error)}</p>;
  if (!hifz.data) return <p className="text-muted-foreground">{tc("loading")}</p>;
  const h = hifz.data;
  const s = h.summary;
  const office = me?.role !== "TEACHER";

  return (
    <div className="grid gap-6">
      <UnverifiedBanner verified={h.verified} />

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle>
            {t("summary")} <span className="text-sm font-normal text-muted-foreground">{t("riwaya", { riwaya: te(`riwaya.${h.riwaya}`) })}</span>
          </CardTitle>
          <div className="flex flex-wrap gap-2">
            {s?.currentThumn && (
              <Button variant="outline" asChild>
                <Link href={`/mushaf?thumn=${s.currentThumn}`}>
                  <Headphones /> {tm("listenHere")}
                </Link>
              </Button>
            )}
            <Button onClick={() => setTarget({ studentId, name, currentThumn: s?.currentThumn })}>
              <BookPlus /> {t("record")}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
            <Figure label={t("ahzab")} value={t("completedAhzab", { count: s?.completedAhzab ?? 0 })} />
            <Figure label={t("athman")} value={t("memorizedAthman", { count: s?.memorizedAthman ?? 0 })} />
            <Figure label={t("position")} value={s?.position ? t("positionValue", s.position) : t("never")} />
            <Figure
              label={t("lastNew")}
              value={s?.lastNewAt ? fmt.date(s.lastNewAt) : t("never")}
              hint={s?.lastRevisionAt ? `${t("lastRevision")}: ${fmt.date(s.lastRevisionAt)}` : undefined}
            />
          </div>
          {office && h.student.declaredHifz && (
            <p className="text-sm text-muted-foreground">
              {t("declared", { text: h.student.declaredHifz })} {t("initialHint")}
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("grid")}</CardTitle>
        </CardHeader>
        <CardContent>
          <HifzGrid athman={h.athman} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("timeline")}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3">
          {h.sessions.length === 0 && <p className="text-sm text-muted-foreground">{t("noSessions")}</p>}
          {h.sessions.map((session) => (
            <div key={session.id} className="grid gap-1.5 rounded-md border p-3 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">
                  {fmt.date(session.date)}{" "}
                  <span className="font-normal text-muted-foreground">
                    · {t("by", { name: [session.teacher.title, session.teacher.firstName, session.teacher.lastName].filter(Boolean).join(" ") })}
                  </span>
                </span>
                {(office || session.recordedBy.id === me?.id) && (
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={t("deleteSession")}
                    title={t("deleteSession")}
                    disabled={remove.isPending}
                    onClick={() => remove.mutate(session.id)}
                  >
                    <Trash2 />
                  </Button>
                )}
              </div>
              {session.entries.map((e) => (
                <div key={e.id} className="flex flex-wrap items-center gap-2">
                  <Badge variant={e.type === "NEW" ? "default" : e.type === "INITIAL_LEVEL" ? "secondary" : "outline"}>
                    {te(`hifzEntryType.${e.type}`)}
                  </Badge>
                  <span>{label(e)}</span>
                  {e.rating && <span className="text-muted-foreground">★ {e.rating}/5</span>}
                  {e.note && <span className="text-muted-foreground">— {e.note}</span>}
                </div>
              ))}
              {session.notes && <p className="text-muted-foreground">{session.notes}</p>}
            </div>
          ))}
        </CardContent>
      </Card>

      <HifzEntryDialog target={target} office={office} onClose={() => setTarget(null)} />
    </div>
  );
}

function Figure({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="grid gap-0.5">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-base font-semibold">{value}</span>
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </div>
  );
}
