"use client";

import { useQuery } from "@tanstack/react-query";
import { parsePhoneNumberFromString } from "libphonenumber-js";
import { Link2, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { EnumSelect } from "@/components/form/enum-select";
import { Field } from "@/components/form/field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import type { GuardianWithStudents, Relation } from "@/lib/types";

const RELATIONS: Relation[] = ["FATHER", "MOTHER", "BROTHER", "SISTER", "GRANDPARENT", "UNCLE", "AUNT", "OTHER"];

/** One guardian row of the student form: either a new person or a linked existing guardian. */
export interface GuardianDraft {
  key: string;
  guardianId?: string;
  linkedName?: string;
  fullName: string;
  phone: string;
  relation: Relation;
  isPrimary: boolean;
  isPayer: boolean;
}

export const newGuardianDraft = (isFirst: boolean): GuardianDraft => ({
  key: crypto.randomUUID(),
  fullName: "",
  phone: "",
  relation: "FATHER",
  isPrimary: isFirst,
  isPayer: isFirst,
});

export const toE164 = (raw: string) => {
  const p = parsePhoneNumberFromString(raw.trim(), "TN");
  return p?.isValid() ? p.number : null;
};

export function GuardianEditor({
  draft,
  onChange,
  onRemove,
}: {
  draft: GuardianDraft;
  onChange: (patch: Partial<GuardianDraft>) => void;
  onRemove: () => void;
}) {
  const t = useTranslations("students");
  const tc = useTranslations("common");
  const e164 = draft.guardianId ? null : toE164(draft.phone);

  // Phones are shared within families, so a match is a hint to link, never an error.
  const matches = useQuery({
    queryKey: ["guardians", "phone", e164],
    queryFn: () => api<GuardianWithStudents[]>(`/guardians?phone=${encodeURIComponent(e164!)}`),
    enabled: !!e164,
  });

  return (
    <div className="grid gap-3 rounded-lg border p-3">
      <div className="flex items-center justify-between gap-2">
        {draft.guardianId ? (
          <span className="flex items-center gap-2 font-medium">
            <Link2 className="size-4 text-primary" aria-hidden /> {draft.linkedName}
            <Badge variant="secondary">{t("linked")}</Badge>
          </span>
        ) : (
          <span className="font-medium">{t("newGuardian")}</span>
        )}
        <Button size="icon" variant="ghost" aria-label={tc("remove")} onClick={onRemove}>
          <Trash2 />
        </Button>
      </div>

      {!draft.guardianId && (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t("guardianName")} htmlFor={`g-name-${draft.key}`}>
            <Input id={`g-name-${draft.key}`} value={draft.fullName} onChange={(e) => onChange({ fullName: e.target.value })} />
          </Field>
          <Field label={t("guardianPhone")} htmlFor={`g-phone-${draft.key}`}>
            <Input id={`g-phone-${draft.key}`} type="tel" dir="ltr" placeholder="22 123 456" value={draft.phone} onChange={(e) => onChange({ phone: e.target.value })} />
          </Field>
        </div>
      )}

      {!!matches.data?.length && (
        <Alert>
          <AlertDescription className="grid gap-2">
            <span>{t("phoneKnown")}</span>
            {matches.data.map((g) => (
              <div key={g.id} className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  <strong>{g.fullName}</strong>
                  {g.students.length > 0 && ` — ${g.students.map((s) => `${s.student.firstName} ${s.student.lastName}`).join("، ")}`}
                </span>
                <Button size="sm" variant="outline" onClick={() => onChange({ guardianId: g.id, linkedName: g.fullName })}>
                  {t("useThisGuardian")}
                </Button>
              </div>
            ))}
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-3 sm:grid-cols-[12rem_1fr] sm:items-end">
        <Field label={t("relation")}>
          <EnumSelect ns="relation" values={RELATIONS} value={draft.relation} onChange={(v) => v && onChange({ relation: v })} />
        </Field>
        <div className="flex flex-wrap gap-4 pb-2 text-sm">
          <label className="flex items-center gap-2">
            <Checkbox checked={draft.isPrimary} onCheckedChange={(v) => onChange({ isPrimary: v === true })} />
            {t("primary")}
          </label>
          <label className="flex items-center gap-2">
            <Checkbox checked={draft.isPayer} onCheckedChange={(v) => onChange({ isPayer: v === true })} />
            {t("payer")}
          </label>
        </div>
      </div>
    </div>
  );
}

/** API payload for a draft (new guardian inline, or link by id). */
export const guardianPayload = (d: GuardianDraft) => ({
  ...(d.guardianId ? { guardianId: d.guardianId } : { guardian: { fullName: d.fullName, phone: d.phone } }),
  relation: d.relation,
  isPrimary: d.isPrimary,
  isPayer: d.isPayer,
});
