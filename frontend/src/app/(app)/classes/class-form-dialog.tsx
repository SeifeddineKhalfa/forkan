"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { EnumSelect } from "@/components/form/enum-select";
import { Field } from "@/components/form/field";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { api } from "@/lib/api";
import {
  type AcademicYear,
  type Audience,
  type ClassItem,
  DAYS,
  type GenderPolicy,
  type Riwaya,
  type Slot,
  type Teacher,
  type TeachingRole,
  type Venue,
} from "@/lib/types";
import { useErrorMessage } from "@/lib/use-error-message";

export const CLASSES_KEY = ["classes"] as const;
const NO_ROOM = "__none__";

interface Form {
  name: string;
  level: string;
  quranScope: string;
  audience: Audience;
  genderPolicy: GenderPolicy;
  capacity: string;
  riwaya: Riwaya | null;
  monthlyFee: string;
  requiresMembership: boolean;
  isPublic: boolean;
  roomId: string | null;
  slots: Slot[];
  teachers: { teacherId: string; role: TeachingRole }[];
}

const fromClass = (c?: ClassItem): Form => ({
  name: c?.name ?? "",
  level: c?.level ?? "",
  quranScope: c?.quranScope ?? "",
  audience: c?.audience ?? "ADULTS",
  genderPolicy: c?.genderPolicy ?? "MIXED",
  capacity: String(c?.capacity ?? 25),
  riwaya: c?.riwaya ?? null,
  monthlyFee: c?.monthlyFee && Number(c.monthlyFee) > 0 ? c.monthlyFee : "",
  requiresMembership: c?.requiresMembership ?? true,
  isPublic: c?.isPublic ?? true,
  roomId: c?.roomId ?? null,
  slots: c?.scheduleSlots.map(({ day, kind, startTime, endTime, timeLabel }) => ({ day, kind, startTime, endTime, timeLabel })) ?? [],
  teachers: c?.teachers.map(({ teacherId, role }) => ({ teacherId, role })) ?? [],
});

export function ClassFormDialog(props: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  klass?: ClassItem;
}) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-h-[92svh] overflow-y-auto sm:max-w-2xl">
        {/* Content unmounts when closed, so the form state resets on every open. */}
        {props.open && <ClassFormDialogBody {...props} />}
      </DialogContent>
    </Dialog>
  );
}

function ClassFormDialogBody({
  onOpenChange,
  klass,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  klass?: ClassItem;
}) {
  const t = useTranslations("classes");
  const tc = useTranslations("common");
  const errorMessage = useErrorMessage();
  const qc = useQueryClient();
  const [form, setForm] = useState<Form>(() => fromClass(klass));
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));

  const year = useQuery({ queryKey: ["academic-years", "current"], queryFn: () => api<AcademicYear>("/academic-years/current") });
  const venues = useQuery({ queryKey: ["venues"], queryFn: () => api<Venue[]>("/venues") });
  const teachers = useQuery({ queryKey: ["teachers", ""], queryFn: () => api<Teacher[]>("/teachers") });

  const save = useMutation({
    mutationFn: () => {
      const body = {
        ...form,
        capacity: Number(form.capacity),
        monthlyFee: form.monthlyFee || null,
        riwaya: form.riwaya ?? undefined,
        slots: form.slots.map((s) => ({ ...s, timeLabel: s.timeLabel || undefined })),
      };
      return klass
        ? api<ClassItem>(`/classes/${klass.id}`, { method: "PATCH", body: { ...body, riwaya: form.riwaya } })
        : api<ClassItem>("/classes", { method: "POST", body: { ...body, academicYearId: year.data?.id, roomId: form.roomId ?? undefined } });
    },
    onSuccess: () => {
      toast.success(tc("saved"));
      void qc.invalidateQueries({ queryKey: CLASSES_KEY });
      onOpenChange(false);
    },
  });

  const updateSlot = (i: number, patch: Partial<Slot>) =>
    set("slots", form.slots.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const updateTeacher = (i: number, patch: Partial<Form["teachers"][number]>) =>
    set("teachers", form.teachers.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  return (
    <>
        <DialogHeader>
          <DialogTitle>{klass ? t("edit") : t("add")}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4">
          <Field label={t("name")} htmlFor="c-name">
            <Input id="c-name" placeholder={t("namePlaceholder")} value={form.name} onChange={(e) => set("name", e.target.value)} />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t("quranScope")} htmlFor="c-scope">
              <Input id="c-scope" placeholder={t("quranScopePlaceholder")} value={form.quranScope} onChange={(e) => set("quranScope", e.target.value)} />
            </Field>
            <Field label={t("level")} htmlFor="c-level">
              <Input id="c-level" value={form.level} onChange={(e) => set("level", e.target.value)} />
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label={t("audience")}>
              <EnumSelect ns="audience" values={["CHILDREN", "TEENS", "ADULTS"] as const} value={form.audience} onChange={(v) => v && set("audience", v)} />
            </Field>
            <Field label={t("genderPolicy")}>
              <EnumSelect ns="genderPolicy" values={["MIXED", "MALE_ONLY", "FEMALE_ONLY"] as const} value={form.genderPolicy} onChange={(v) => v && set("genderPolicy", v)} />
            </Field>
            <Field label={t("riwaya")}>
              <EnumSelect ns="riwaya" values={["QALUN", "WARSH", "HAFS"] as const} value={form.riwaya} noneLabel={t("riwayaDefault")} onChange={(v) => set("riwaya", v)} />
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label={t("capacity")} htmlFor="c-cap">
              <Input id="c-cap" type="number" min={1} dir="ltr" value={form.capacity} onChange={(e) => set("capacity", e.target.value)} />
            </Field>
            <Field label={t("fee")} htmlFor="c-fee" hint={t("feeHint")}>
              <Input id="c-fee" dir="ltr" inputMode="decimal" value={form.monthlyFee} onChange={(e) => set("monthlyFee", e.target.value)} />
            </Field>
            <Field label={t("room")}>
              <Select value={form.roomId ?? NO_ROOM} onValueChange={(v) => set("roomId", v === NO_ROOM ? null : v)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_ROOM}>{t("noRoom")}</SelectItem>
                  {venues.data?.flatMap((v) =>
                    v.rooms.map((r) => (
                      <SelectItem key={r.id} value={r.id}>
                        {v.name} — {r.name}
                      </SelectItem>
                    )),
                  )}
                </SelectContent>
              </Select>
            </Field>
          </div>
          <div className="flex flex-wrap gap-6 text-sm">
            <label className="flex items-center gap-2">
              <Checkbox checked={form.requiresMembership} onCheckedChange={(v) => set("requiresMembership", v === true)} />
              {t("requiresMembership")}
            </label>
            <label className="flex items-center gap-2">
              <Checkbox checked={form.isPublic} onCheckedChange={(v) => set("isPublic", v === true)} />
              {t("isPublic")}
            </label>
          </div>

          <Separator />
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">{t("schedule")}</h3>
            <Button
              size="sm"
              variant="outline"
              onClick={() => set("slots", [...form.slots, { day: "MONDAY", kind: "MEMORIZATION", startTime: "10:00", endTime: "12:00", timeLabel: null }])}
            >
              <Plus /> {t("addSlot")}
            </Button>
          </div>
          {form.slots.map((s, i) => (
            <div key={i} className="grid grid-cols-2 gap-2 rounded-md border p-2 sm:grid-cols-[1fr_1fr_6rem_6rem_1.5fr_auto]">
              <EnumSelect ns="day" values={DAYS} value={s.day} onChange={(v) => v && updateSlot(i, { day: v })} />
              <EnumSelect ns="slotKind" values={["MEMORIZATION", "REVISION", "MIXED"] as const} value={s.kind} onChange={(v) => v && updateSlot(i, { kind: v })} />
              <Input type="time" aria-label={t("from")} value={s.startTime} onChange={(e) => updateSlot(i, { startTime: e.target.value })} />
              <Input type="time" aria-label={t("to")} value={s.endTime} onChange={(e) => updateSlot(i, { endTime: e.target.value })} />
              <Input placeholder={t("timeLabel")} value={s.timeLabel ?? ""} onChange={(e) => updateSlot(i, { timeLabel: e.target.value })} />
              <Button size="icon" variant="ghost" aria-label={tc("remove")} onClick={() => set("slots", form.slots.filter((_, j) => j !== i))}>
                <Trash2 />
              </Button>
            </div>
          ))}

          <Separator />
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">{t("teachers")}</h3>
            <Button
              size="sm"
              variant="outline"
              disabled={!teachers.data?.length}
              onClick={() => {
                const free = teachers.data?.find((x) => !form.teachers.some((y) => y.teacherId === x.id));
                if (free) {
                  const hasMain = form.teachers.some((x) => x.role === "MAIN");
                  set("teachers", [...form.teachers, { teacherId: free.id, role: hasMain ? "ASSISTANT" : "MAIN" }]);
                }
              }}
            >
              <Plus /> {t("addTeacher")}
            </Button>
          </div>
          {form.teachers.map((ct, i) => (
            <div key={i} className="grid grid-cols-[1fr_1fr_auto] gap-2">
              <Select value={ct.teacherId} onValueChange={(v) => updateTeacher(i, { teacherId: v })}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {teachers.data?.map((x) => (
                    <SelectItem key={x.id} value={x.id}>
                      {x.title ? `${x.title} ` : ""}
                      {x.firstName} {x.lastName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <EnumSelect ns="teachingRole" values={["MAIN", "ASSISTANT", "SUPERVISOR"] as const} value={ct.role} onChange={(v) => v && updateTeacher(i, { role: v })} />
              <Button size="icon" variant="ghost" aria-label={tc("remove")} onClick={() => set("teachers", form.teachers.filter((_, j) => j !== i))}>
                <Trash2 />
              </Button>
            </div>
          ))}

          {save.isError && <p role="alert" className="text-sm text-destructive">{errorMessage(save.error)}</p>}
        </div>
        <DialogFooter>
          <Button disabled={save.isPending || !form.name.trim() || (!klass && !year.data)} onClick={() => save.mutate()}>
            {save.isPending ? tc("saving") : tc("save")}
          </Button>
        </DialogFooter>
      </>
  );
}
