"use client";

import { useTranslations } from "next-intl";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type EnumNamespace =
  | "day"
  | "slotKind"
  | "audience"
  | "genderPolicy"
  | "gender"
  | "relation"
  | "riwaya"
  | "studentStatus"
  | "teachingRole"
  | "contractType";

const NONE = "__none__";

/** Select over an enum whose labels live in messages/ar.json → enums.<ns>. */
export function EnumSelect<T extends string>({
  ns,
  values,
  value,
  onChange,
  noneLabel,
  id,
  className,
}: {
  ns: EnumNamespace;
  values: readonly T[];
  value: T | null | undefined;
  onChange: (v: T | null) => void;
  /** When set, adds an empty choice with this label. */
  noneLabel?: string;
  id?: string;
  className?: string;
}) {
  // The namespace is dynamic, so the typed key check can't follow it.
  const t = useTranslations(`enums.${ns}`) as unknown as (key: string) => string;
  return (
    <Select value={value ?? (noneLabel ? NONE : undefined)} onValueChange={(v) => onChange(v === NONE ? null : (v as T))}>
      <SelectTrigger id={id} className={className ?? "w-full"}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {noneLabel && <SelectItem value={NONE}>{noneLabel}</SelectItem>}
        {values.map((v) => (
          <SelectItem key={v} value={v}>
            {t(v)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
