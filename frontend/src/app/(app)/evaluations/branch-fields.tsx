"use client";

import { useTranslations } from "next-intl";
import { Field } from "@/components/form/field";
import { Input } from "@/components/ui/input";
import type { EvaluationBranch } from "@/lib/types";

/** Form state of a branch (الفرع); numbers are kept as typed. Defaults follow the school's score card. */
export interface BranchDraft {
  key: string;
  name: string;
  quranScope: string;
  questionCount: string;
  hifzMax: string;
  tajwidMax: string;
  passScore: string;
}

export const newBranch = (name: string): BranchDraft => ({
  key: crypto.randomUUID(),
  name,
  quranScope: "",
  questionCount: "4",
  hifzMax: "14",
  tajwidMax: "6",
  passScore: "10",
});

export const branchDraft = (b: EvaluationBranch): BranchDraft => ({
  key: b.id,
  name: b.name,
  quranScope: b.quranScope ?? "",
  questionCount: String(b.questionCount),
  hifzMax: String(Number(b.hifzMax)),
  tajwidMax: String(Number(b.tajwidMax)),
  passScore: b.passScore === null ? "" : String(Number(b.passScore)),
});

export const branchPayload = (b: BranchDraft) => ({
  name: b.name.trim(),
  quranScope: b.quranScope.trim(),
  questionCount: Number(b.questionCount),
  hifzMax: b.hifzMax.trim(),
  tajwidMax: b.tajwidMax.trim(),
  passScore: b.passScore.trim() === "" ? null : b.passScore.trim(),
});

export function BranchFields({ value, onChange }: { value: BranchDraft; onChange: (b: BranchDraft) => void }) {
  const t = useTranslations("evaluations");
  const set = (k: keyof BranchDraft) => (e: React.ChangeEvent<HTMLInputElement>) => onChange({ ...value, [k]: e.target.value });
  const id = (k: string) => `branch-${value.key}-${k}`;
  const total = Number(value.hifzMax || 0) + Number(value.tajwidMax || 0);

  return (
    <div className="grid gap-3 sm:grid-cols-6">
      <Field label={t("branchName")} htmlFor={id("name")} className="sm:col-span-3">
        <Input id={id("name")} value={value.name} placeholder={t("branchNamePlaceholder")} onChange={set("name")} required />
      </Field>
      <Field label={t("quranScope")} htmlFor={id("scope")} className="sm:col-span-3">
        <Input id={id("scope")} value={value.quranScope} onChange={set("quranScope")} />
      </Field>
      <Field label={t("questionCount")} htmlFor={id("q")} className="sm:col-span-2">
        <Input id={id("q")} type="number" min={1} max={20} dir="ltr" value={value.questionCount} onChange={set("questionCount")} />
      </Field>
      <Field label={t("hifzMax")} htmlFor={id("h")} className="sm:col-span-1">
        <Input id={id("h")} type="number" min={0} step="0.25" dir="ltr" value={value.hifzMax} onChange={set("hifzMax")} />
      </Field>
      <Field label={t("tajwidMax")} htmlFor={id("t")} className="sm:col-span-1">
        <Input id={id("t")} type="number" min={0} step="0.25" dir="ltr" value={value.tajwidMax} onChange={set("tajwidMax")} />
      </Field>
      <Field label={t("passScore")} htmlFor={id("p")} className="sm:col-span-2" hint={`/${total}`}>
        <Input id={id("p")} type="number" min={0} step="0.25" dir="ltr" value={value.passScore} onChange={set("passScore")} />
      </Field>
    </div>
  );
}
