"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Lock, Save } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import { useFormat } from "@/lib/format";
import { useQuranMeta } from "@/lib/quran";
import type { EvaluationCard, EvaluationDetail, QuranMeta } from "@/lib/types";
import { useErrorMessage } from "@/lib/use-error-message";
import { cn } from "@/lib/utils";
import { mark } from "../../score";

interface Row {
  surahId: string;
  ayah: string;
  mistakes: string;
  note: string;
}

interface Draft {
  absent: boolean;
  hifz: string;
  tajwid: string;
  notes: string;
  rows: Row[];
}

const toDraft = (c: EvaluationCard): Draft => ({
  absent: c.candidate.absent,
  hifz: mark(c.candidate.hifzScore),
  tajwid: mark(c.candidate.tajwidScore),
  notes: c.candidate.notes ?? "",
  rows: Array.from({ length: c.branch.questionCount }, (_, i) => {
    const q = c.questions.find((x) => x.number === i + 1);
    return { surahId: q?.surahId ? String(q.surahId) : "", ayah: q?.ayah ? String(q.ayah) : "", mistakes: q?.mistakes ?? "", note: q?.note ?? "" };
  }),
});

/** The jury's «بطاقة تقييم» for one candidate, laid out like the paper sheet. */
export default function CandidateCardPage() {
  const { id, candidateId } = useParams<{ id: string; candidateId: string }>();
  const tc = useTranslations("common");
  const errorMessage = useErrorMessage();
  const card = useQuery({
    queryKey: ["evaluation", id, "card", candidateId],
    queryFn: () => api<EvaluationCard>(`/evaluations/${id}/candidates/${candidateId}/card`),
  });
  const meta = useQuranMeta();
  if (card.isError) return <p className="text-destructive">{errorMessage(card.error)}</p>;
  if (!card.data || !meta.data) return <p className="text-muted-foreground">{tc("loading")}</p>;
  // Remount the form when moving to another candidate or after a save.
  return <CardForm key={`${candidateId}-${card.dataUpdatedAt}`} card={card.data} meta={meta.data} />;
}

function CardForm({ card, meta }: { card: EvaluationCard; meta: QuranMeta }) {
  const t = useTranslations("evaluations");
  const tc = useTranslations("common");
  const fmt = useFormat();
  const errorMessage = useErrorMessage();
  const router = useRouter();
  const qc = useQueryClient();
  const { evaluation: ev, branch, candidate } = card;
  const [d, setD] = useState<Draft>(() => toDraft(card));
  const readOnly = !card.canScore;

  // Previous / next candidate in order of passage.
  const detail = useQuery({ queryKey: ["evaluation", ev.id], queryFn: () => api<EvaluationDetail>(`/evaluations/${ev.id}`) });
  const order = detail.data?.candidates ?? [];
  const at = order.findIndex((c) => c.id === candidate.id);
  const prev = at > 0 ? order[at - 1] : null;
  const next = at >= 0 && at < order.length - 1 ? order[at + 1] : null;
  const href = (cid: string) => `/evaluations/${ev.id}/candidates/${cid}`;

  const save = useMutation({
    /** `goNext`: open the next candidate once saved. */
    mutationFn: async (goNext: boolean) => {
      await api<EvaluationCard>(`/evaluations/${ev.id}/candidates/${candidate.id}/card`, {
        method: "PUT",
        body: {
          absent: d.absent,
          hifzScore: d.absent || d.hifz.trim() === "" ? null : d.hifz.trim(),
          tajwidScore: d.absent || d.tajwid.trim() === "" ? null : d.tajwid.trim(),
          notes: d.notes.trim() || null,
          questions: d.rows.map((r, i) => ({
            number: i + 1,
            surahId: r.surahId ? Number(r.surahId) : null,
            ayah: r.surahId && r.ayah ? Number(r.ayah) : null,
            mistakes: r.mistakes.trim() || null,
            note: r.note.trim() || null,
          })),
        },
      });
      return goNext;
    },
    onSuccess: (goNext) => {
      toast.success(t("cardSaved"));
      void qc.invalidateQueries({ queryKey: ["evaluations"] });
      void qc.invalidateQueries({ queryKey: ["evaluation", ev.id] });
      if (goNext && next) router.push(href(next.id));
    },
  });

  const setRow = (i: number, patch: Partial<Row>) => setD({ ...d, rows: d.rows.map((r, j) => (j === i ? { ...r, ...patch } : r)) });
  const over = (v: string, max: string) => v.trim() !== "" && Number(v) > Number(max);
  const total = d.absent || d.hifz === "" || d.tajwid === "" ? null : Number(d.hifz) + Number(d.tajwid);
  const passed = total === null || branch.passScore === null ? null : total >= Number(branch.passScore);

  return (
    <form
      className="grid gap-6"
      onSubmit={(e) => {
        e.preventDefault();
        if (!readOnly) save.mutate(false);
      }}
    >
      <PageHeader
        backHref={`/evaluations/${ev.id}`}
        title={t("card")}
        subtitle={`${ev.title} · ${fmt.date(ev.date)}`}
        actions={
          <div className="flex gap-1">
            <Button type="button" variant="outline" size="icon" disabled={!prev} aria-label={t("previousCandidate")} asChild={!!prev}>
              {prev ? (
                <Link href={href(prev.id)}>
                  <ChevronRight />
                </Link>
              ) : (
                <ChevronRight />
              )}
            </Button>
            <Button type="button" variant="outline" size="icon" disabled={!next} aria-label={t("nextCandidate")} asChild={!!next}>
              {next ? (
                <Link href={href(next.id)}>
                  <ChevronLeft />
                </Link>
              ) : (
                <ChevronLeft />
              )}
            </Button>
          </div>
        }
      />

      {readOnly && (
        <Alert>
          <Lock className="size-4" />
          <AlertDescription>{ev.status === "CLOSED" ? t("closedNotice") : t("readOnly")}</AlertDescription>
        </Alert>
      )}

      {/* Header of the sheet: contestant · branch · total */}
      <Card className="py-0">
        <CardContent className="grid gap-0 p-0 sm:grid-cols-[2fr_1fr_1fr]">
          <div className="grid gap-1 border-b p-4 sm:border-e sm:border-b-0">
            <span className="text-sm text-muted-foreground">{t("contestant")}</span>
            <span className="flex items-baseline gap-2 text-xl font-bold">
              <span className="font-mono text-base text-muted-foreground" dir="ltr">{String(candidate.number).padStart(2, "0")}</span>
              {candidate.fullName}
            </span>
          </div>
          <div className="grid gap-1 border-b p-4 sm:border-e sm:border-b-0">
            <span className="text-sm text-muted-foreground">{t("branch")}</span>
            <span className="font-medium">{branch.name}</span>
            {branch.quranScope && <span className="text-xs text-muted-foreground">{branch.quranScope}</span>}
          </div>
          <div className="grid gap-1 p-4">
            <span className="text-sm text-muted-foreground">{t("outOf", { max: mark(branch.maxTotal) })}</span>
            <span className="flex items-center gap-2">
              <span dir="ltr" className="font-mono text-2xl font-bold">{d.absent ? "—" : total === null ? "…" : mark(total)}</span>
              {d.absent && <Badge variant="destructive">{t("absent")}</Badge>}
              {passed !== null && <Badge variant={passed ? "default" : "destructive"}>{passed ? t("passed") : t("failed")}</Badge>}
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Questions: one row per question of the branch */}
      <fieldset disabled={readOnly} className="grid gap-3">
        <legend className="sr-only">{t("question")}</legend>
        {d.rows.map((r, i) => {
          const surah = r.surahId ? meta.surahs[Number(r.surahId) - 1] : undefined;
          return (
            <Card key={i} className="py-3">
              <CardContent className="grid gap-3 px-3 sm:grid-cols-[3rem_minmax(14rem,1fr)_2fr] sm:items-start">
                <span className="flex size-9 items-center justify-center rounded-full bg-muted font-mono font-bold" aria-label={t("questionNumber")}>
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div className="grid gap-2">
                  <Label className="text-xs text-muted-foreground">{t("question")}</Label>
                  <div className="flex gap-2">
                    <select
                      aria-label={`${t("surah")} ${i + 1}`}
                      value={r.surahId}
                      onChange={(e) => setRow(i, { surahId: e.target.value, ayah: "" })}
                      className="h-9 min-w-0 flex-1 rounded-md border border-input bg-transparent px-2 text-sm shadow-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-60"
                    >
                      <option value="">{t("surah")}</option>
                      {meta.surahs.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.id}. {s.nameAr}
                        </option>
                      ))}
                    </select>
                    <Input
                      aria-label={`${t("ayah")} ${i + 1}`}
                      placeholder={t("ayah")}
                      type="number"
                      inputMode="numeric"
                      dir="ltr"
                      min={1}
                      max={surah?.ayahCount}
                      disabled={!r.surahId}
                      className="w-20"
                      value={r.ayah}
                      onChange={(e) => setRow(i, { ayah: e.target.value })}
                    />
                  </div>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor={`mistakes-${i}`} className="text-xs text-muted-foreground">{t("mistakes")}</Label>
                  <Textarea id={`mistakes-${i}`} rows={2} value={r.mistakes} onChange={(e) => setRow(i, { mistakes: e.target.value })} />
                </div>
              </CardContent>
            </Card>
          );
        })}
      </fieldset>

      {/* Marks for the whole card */}
      <Card>
        <CardContent className="grid gap-5">
          <label className="flex items-center gap-3">
            <Switch checked={d.absent} disabled={readOnly} onCheckedChange={(v) => setD({ ...d, absent: v })} />
            <span className="grid">
              <span className="font-medium">{t("absent")}</span>
              <span className="text-xs text-muted-foreground">{t("absentHint")}</span>
            </span>
          </label>
          <div className="grid grid-cols-2 gap-4 sm:max-w-md">
            <MarkInput id="hifz" label={t("hifz")} max={branch.hifzMax} value={d.hifz} disabled={readOnly || d.absent} invalid={over(d.hifz, branch.hifzMax)} onChange={(v) => setD({ ...d, hifz: v })} />
            <MarkInput id="tajwid" label={t("tajwid")} max={branch.tajwidMax} value={d.tajwid} disabled={readOnly || d.absent} invalid={over(d.tajwid, branch.tajwidMax)} onChange={(v) => setD({ ...d, tajwid: v })} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="card-notes">{t("notes")}</Label>
            <Textarea id="card-notes" rows={3} disabled={readOnly} value={d.notes} onChange={(e) => setD({ ...d, notes: e.target.value })} />
          </div>
          {card.scoredBy && candidate.scoredAt && (
            <p className="text-xs text-muted-foreground">
              {t("scoredBy", { name: `${card.scoredBy.firstName} ${card.scoredBy.lastName}` })} · {fmt.date(candidate.scoredAt)}
            </p>
          )}
        </CardContent>
      </Card>

      {save.isError && <p role="alert" className="text-sm text-destructive">{errorMessage(save.error)}</p>}
      {!readOnly && (
        <div className="sticky bottom-20 z-10 flex flex-wrap justify-end gap-2 rounded-xl border bg-card/95 p-3 shadow-sm backdrop-blur lg:bottom-4">
          <Button type="submit" variant={next ? "outline" : "default"} disabled={save.isPending}>
            <Save /> {save.isPending ? tc("saving") : t("saveCard")}
          </Button>
          {next && (
            <Button type="button" disabled={save.isPending} onClick={() => save.mutate(true)}>
              {t("saveAndNext")} <ChevronLeft />
            </Button>
          )}
        </div>
      )}
    </form>
  );
}

function MarkInput({ id, label, max, value, disabled, invalid, onChange }: { id: string; label: string; max: string; value: string; disabled: boolean; invalid: boolean; onChange: (v: string) => void }) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>
        {label} <span className="text-muted-foreground" dir="ltr">/{mark(max)}</span>
      </Label>
      <Input
        id={id}
        type="number"
        inputMode="decimal"
        dir="ltr"
        min={0}
        max={Number(max)}
        step="0.25"
        disabled={disabled}
        aria-invalid={invalid}
        className={cn("h-12 text-center font-mono text-xl", invalid && "border-destructive")}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
