"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { Field } from "@/components/form/field";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import { ofThumn, toThumn, useQuranMeta } from "@/lib/quran";
import type { HifzEntryType, QuranMeta, RangeInput } from "@/lib/types";
import { useErrorMessage } from "@/lib/use-error-message";
import { cn } from "@/lib/utils";

type Mode = RangeInput["mode"];

interface Draft {
  type: HifzEntryType;
  mode: Mode;
  fromHizb: number;
  fromThumn: number;
  toHizb: number;
  toThumn: number;
  fromSurah: number;
  fromAyah: number;
  toSurah: number;
  toAyah: number;
  rating: number | null;
  note: string;
}

const tunisToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Tunis" }).format(new Date());

function rangeOf(d: Draft): RangeInput {
  if (d.mode === "THUMN") return { mode: "THUMN", fromThumn: toThumn(d.fromHizb, d.fromThumn), toThumn: toThumn(d.toHizb, d.toThumn) };
  if (d.mode === "SURAH") return { mode: "SURAH", fromSurah: d.fromSurah, toSurah: d.toSurah };
  return { mode: "AYAH", fromSurah: d.fromSurah, fromAyah: d.fromAyah, toSurah: d.toSurah, toAyah: d.toAyah };
}

export interface HifzTarget {
  studentId: string;
  name: string;
  /** Current position (thumn 1..480) to prefill the next sabaq. */
  currentThumn?: number | null;
}

/** One hifz session: one or more NEW / revision lines, each entered by hizb-thumn, surah or ayah range. */
export function HifzEntryDialog({ target, office, onClose }: { target: HifzTarget | null; office: boolean; onClose: () => void }) {
  return (
    <Dialog open={!!target} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92svh] overflow-y-auto sm:max-w-xl">
        {target && <Body target={target} office={office} onClose={onClose} />}
      </DialogContent>
    </Dialog>
  );
}

function Body({ target, office, onClose }: { target: HifzTarget; office: boolean; onClose: () => void }) {
  const t = useTranslations("hifz");
  const te = useTranslations("enums");
  const tc = useTranslations("common");
  const errorMessage = useErrorMessage();
  const qc = useQueryClient();
  const meta = useQuranMeta();
  const start = ofThumn(Math.min((target.currentThumn ?? 0) + 1, 480));
  const blank = (type: HifzEntryType): Draft => ({
    type,
    mode: "THUMN",
    fromHizb: start.hizb,
    fromThumn: start.thumn,
    toHizb: start.hizb,
    toThumn: start.thumn,
    fromSurah: 114,
    fromAyah: 1,
    toSurah: 114,
    toAyah: 1,
    rating: null,
    note: "",
  });
  const [date, setDate] = useState(tunisToday);
  const [notes, setNotes] = useState("");
  const [drafts, setDrafts] = useState<Draft[]>(() => [blank("NEW")]);
  const update = (i: number, patch: Partial<Draft>) => setDrafts((ds) => ds.map((d, k) => (k === i ? { ...d, ...patch } : d)));

  const save = useMutation({
    mutationFn: () =>
      api("/hifz/sessions", {
        method: "POST",
        body: {
          studentId: target.studentId,
          date,
          notes: notes || undefined,
          entries: drafts.map((d) => ({ type: d.type, range: rangeOf(d), rating: d.rating ?? undefined, note: d.note || undefined })),
        },
      }),
    onSuccess: () => {
      toast.success(t("saved"));
      void qc.invalidateQueries({ queryKey: ["hifz"] });
      onClose();
    },
  });

  const types: HifzEntryType[] = office ? ["NEW", "RECENT_REVISION", "OLD_REVISION", "INITIAL_LEVEL"] : ["NEW", "RECENT_REVISION", "OLD_REVISION"];

  return (
    <>
      <DialogHeader>
        <DialogTitle>{t("recordTitle", { name: target.name })}</DialogTitle>
        <DialogDescription>{t("backwardsHint")}</DialogDescription>
      </DialogHeader>
      <Field label={t("date")} htmlFor="hifz-date">
        <Input id="hifz-date" type="date" value={date} max={tunisToday()} onChange={(e) => setDate(e.target.value)} />
      </Field>

      {drafts.map((d, i) => (
        <fieldset key={i} className="grid gap-3 rounded-lg border p-3">
          <div className="flex items-center gap-2">
            <NativeSelect
              aria-label={t("type")}
              value={d.type}
              onChange={(v) => update(i, { type: v as HifzEntryType })}
              options={types.map((ty) => ({ value: ty, label: te(`hifzEntryType.${ty}`) }))}
            />
            {drafts.length > 1 && (
              <Button size="icon" variant="ghost" aria-label={t("removeEntry")} onClick={() => setDrafts((ds) => ds.filter((_, k) => k !== i))}>
                <Trash2 />
              </Button>
            )}
          </div>
          <ModeTabs value={d.mode} onChange={(mode) => update(i, { mode })} />
          {meta.data && <RangeFields draft={d} meta={meta.data} onChange={(patch) => update(i, patch)} />}
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm text-muted-foreground">{t("rating")}</span>
            <div className="flex gap-1" role="radiogroup" aria-label={t("rating")}>
              {[1, 2, 3, 4, 5].map((r) => (
                <button
                  key={r}
                  type="button"
                  role="radio"
                  aria-checked={d.rating === r}
                  className={cn("size-8 rounded-md border text-sm", d.rating === r ? "bg-primary text-primary-foreground" : "text-muted-foreground")}
                  onClick={() => update(i, { rating: d.rating === r ? null : r })}
                >
                  {r}
                </button>
              ))}
            </div>
            <Input className="min-w-40 flex-1" placeholder={t("note")} value={d.note} onChange={(e) => update(i, { note: e.target.value })} />
          </div>
        </fieldset>
      ))}

      <Button
        variant="outline"
        onClick={() => setDrafts((ds) => [...ds, { ...blank(ds.some((x) => x.type === "NEW") ? "RECENT_REVISION" : "NEW"), mode: ds.at(-1)?.mode ?? "THUMN" }])}
      >
        <Plus /> {t("addEntry")}
      </Button>
      <Field label={t("notes")} htmlFor="hifz-notes">
        <Textarea id="hifz-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
      {save.isError && <p role="alert" className="text-sm text-destructive">{errorMessage(save.error)}</p>}
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>{tc("cancel")}</Button>
        <Button disabled={save.isPending || !meta.data} onClick={() => save.mutate()}>
          {save.isPending ? tc("saving") : tc("save")}
        </Button>
      </DialogFooter>
    </>
  );
}

function ModeTabs({ value, onChange }: { value: Mode; onChange: (m: Mode) => void }) {
  const te = useTranslations("enums");
  return (
    <div className="grid grid-cols-3 gap-1 rounded-md bg-muted p-1" role="tablist">
      {(["THUMN", "SURAH", "AYAH"] as const).map((m) => (
        <button
          key={m}
          type="button"
          role="tab"
          aria-selected={value === m}
          className={cn("rounded px-2 py-1.5 text-sm", value === m ? "bg-background font-medium shadow-sm" : "text-muted-foreground")}
          onClick={() => onChange(m)}
        >
          {te(`rangeMode.${m}`)}
        </button>
      ))}
    </div>
  );
}

function RangeFields({ draft: d, meta, onChange }: { draft: Draft; meta: QuranMeta; onChange: (p: Partial<Draft>) => void }) {
  const t = useTranslations("hifz");
  const surahOptions = meta.surahs.map((s) => ({ value: String(s.id), label: `${s.id}. ${s.nameAr}` }));
  const num = (v: string, max: number) => Math.min(Math.max(1, Number(v) || 1), max);
  const ayahs = (surah: number) => meta.surahs[surah - 1]?.ayahCount ?? 1;
  const side = (prefix: "from" | "to") => {
    const label = prefix === "from" ? t("from") : t("to");
    if (d.mode === "THUMN") {
      return (
        <div className="grid grid-cols-[auto_1fr_1fr] items-end gap-2">
          <span className="pb-2 text-sm font-medium">{label}</span>
          <Field label={t("hizb")}>
            <Input type="number" inputMode="numeric" min={1} max={60} value={d[`${prefix}Hizb`]} onChange={(e) => onChange({ [`${prefix}Hizb`]: num(e.target.value, 60) })} />
          </Field>
          <Field label={t("thumn")}>
            <Input type="number" inputMode="numeric" min={1} max={8} value={d[`${prefix}Thumn`]} onChange={(e) => onChange({ [`${prefix}Thumn`]: num(e.target.value, 8) })} />
          </Field>
        </div>
      );
    }
    return (
      <div className={cn("grid items-end gap-2", d.mode === "AYAH" ? "grid-cols-[auto_1fr_5rem]" : "grid-cols-[auto_1fr]")}>
        <span className="pb-2 text-sm font-medium">{label}</span>
        <Field label={t("surah")}>
          <NativeSelect
            aria-label={`${label} ${t("surah")}`}
            value={String(d[`${prefix}Surah`])}
            onChange={(v) => onChange({ [`${prefix}Surah`]: Number(v), [`${prefix}Ayah`]: prefix === "to" ? ayahs(Number(v)) : 1 })}
            options={surahOptions}
          />
        </Field>
        {d.mode === "AYAH" && (
          <Field label={t("ayah")}>
            <Input
              type="number"
              inputMode="numeric"
              min={1}
              max={ayahs(d[`${prefix}Surah`])}
              value={d[`${prefix}Ayah`]}
              onChange={(e) => onChange({ [`${prefix}Ayah`]: num(e.target.value, ayahs(d[`${prefix}Surah`])) })}
            />
          </Field>
        )}
      </div>
    );
  };
  return (
    <div className="grid gap-2">
      {side("from")}
      {side("to")}
    </div>
  );
}

/** Native select: fast on phones with 114 surahs. */
function NativeSelect({
  value,
  onChange,
  options,
  ...rest
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  "aria-label"?: string;
}) {
  return (
    <select
      {...rest}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-9 w-full min-w-0 flex-1 rounded-md border border-input bg-transparent px-2 text-sm shadow-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
