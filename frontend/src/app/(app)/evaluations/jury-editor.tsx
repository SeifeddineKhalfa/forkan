"use client";

import { useQuery } from "@tanstack/react-query";
import { Crown, Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api } from "@/lib/api";
import type { EvaluationJuror, Teacher } from "@/lib/types";
import { cn } from "@/lib/utils";

const EXTERNAL = "external";

export interface JurorDraft {
  key: string;
  teacherId: string | null;
  name: string;
  isPresident: boolean;
}

export const jurorDrafts = (jurors: EvaluationJuror[]): JurorDraft[] =>
  jurors.map((j) => ({ key: j.id, teacherId: j.teacherId, name: j.name, isPresident: j.isPresident }));

export const juryPayload = (jurors: JurorDraft[]) =>
  jurors
    .filter((j) => j.name.trim())
    .map((j) => ({ teacherId: j.teacherId ?? undefined, name: j.name.trim(), isPresident: j.isPresident }));

const teacherName = (t: Teacher) => [t.title, t.firstName, t.lastName].filter(Boolean).join(" ");

/** لجنة التحكيم: teachers of the school (who can then fill cards) or outside guests, one president. */
export function JuryEditor({ value, onChange }: { value: JurorDraft[]; onChange: (v: JurorDraft[]) => void }) {
  const t = useTranslations("evaluations");
  const tc = useTranslations("common");
  const teachers = useQuery({ queryKey: ["teachers", ""], queryFn: () => api<Teacher[]>("/teachers") });
  const update = (i: number, patch: Partial<JurorDraft>) => onChange(value.map((j, k) => (k === i ? { ...j, ...patch } : j)));

  return (
    <div className="grid gap-2">
      {value.length === 0 && <p className="text-sm text-muted-foreground">{t("noJury")}</p>}
      {value.map((j, i) => (
        <div key={j.key} className="flex flex-wrap items-center gap-2">
          <Select
            value={j.teacherId ?? EXTERNAL}
            onValueChange={(v) => {
              const teacher = teachers.data?.find((x) => x.id === v);
              update(i, teacher ? { teacherId: teacher.id, name: teacherName(teacher) } : { teacherId: null });
            }}
          >
            <SelectTrigger className="w-48" aria-label={t("jurorTeacher")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={EXTERNAL}>{t("external")}</SelectItem>
              {teachers.data
                ?.filter((x) => x.isActive)
                .map((x) => (
                  <SelectItem key={x.id} value={x.id}>{teacherName(x)}</SelectItem>
                ))}
            </SelectContent>
          </Select>
          <Input
            className="min-w-40 flex-1"
            aria-label={t("jurorName")}
            placeholder={t("jurorName")}
            value={j.name}
            onChange={(e) => update(i, { name: e.target.value })}
          />
          <Button
            type="button"
            variant={j.isPresident ? "secondary" : "ghost"}
            size="sm"
            aria-pressed={j.isPresident}
            onClick={() => onChange(value.map((x, k) => ({ ...x, isPresident: k === i ? !x.isPresident : false })))}
          >
            <Crown className={cn(j.isPresident && "text-gold")} /> {t("president")}
          </Button>
          <Button type="button" variant="ghost" size="icon" aria-label={tc("remove")} onClick={() => onChange(value.filter((_, k) => k !== i))}>
            <Trash2 />
          </Button>
        </div>
      ))}
      <p className="text-xs text-muted-foreground">{t("jurorTeacherHint")}</p>
      <Button
        type="button"
        variant="outline"
        className="justify-self-start"
        onClick={() => onChange([...value, { key: crypto.randomUUID(), teacherId: null, name: "", isPresident: value.length === 0 }])}
      >
        <Plus /> {t("addJuror")}
      </Button>
    </div>
  );
}
