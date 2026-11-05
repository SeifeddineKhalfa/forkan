"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { RoleGate } from "@/components/app-shell/role-gate";
import { EnumSelect } from "@/components/form/enum-select";
import { Field } from "@/components/form/field";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import { ageFrom } from "@/lib/format";
import type { ClassItem, Gender, Riwaya, StudentDetail } from "@/lib/types";
import { useErrorMessage } from "@/lib/use-error-message";
import { type GuardianDraft, GuardianEditor, guardianPayload, newGuardianDraft } from "../guardian-editor";

const NO_CLASS = "__none__";

export default function NewStudentPage() {
  return (
    <RoleGate roles={["STAFF"]}>
      <NewStudentForm />
    </RoleGate>
  );
}

function NewStudentForm() {
  const t = useTranslations("students");
  const tc = useTranslations("common");
  const tcl = useTranslations("classes");
  const errorMessage = useErrorMessage();
  const router = useRouter();
  const qc = useQueryClient();

  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    firstNameLatin: "",
    lastNameLatin: "",
    gender: "MALE" as Gender,
    dateOfBirth: "",
    phone: "",
    address: "",
    riwaya: null as Riwaya | null,
    photoConsent: false,
    notes: "",
    classId: null as string | null,
  });
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));
  const [guardians, setGuardians] = useState<GuardianDraft[]>([newGuardianDraft(true)]);

  const classes = useQuery({ queryKey: ["classes", ""], queryFn: () => api<ClassItem[]>("/classes") });
  const isMinor = form.dateOfBirth ? ageFrom(form.dateOfBirth) < 18 : true;
  // Only imla'at the student may join (gender policy) are offered.
  const allowed = classes.data?.filter(
    (c) => c.genderPolicy === "MIXED" || (c.genderPolicy === "MALE_ONLY") === (form.gender === "MALE"),
  );

  const create = useMutation({
    mutationFn: () =>
      api<StudentDetail>("/students", {
        method: "POST",
        body: {
          ...form,
          riwaya: form.riwaya ?? undefined,
          classId: form.classId ?? undefined,
          // Rows left completely empty are ignored (adults often have no guardian).
          guardians: guardians.filter((g) => g.guardianId || g.fullName.trim() || g.phone.trim()).map(guardianPayload),
        },
      }),
    onSuccess: (s) => {
      toast.success(t("created", { code: s.code }));
      void qc.invalidateQueries({ queryKey: ["students"] });
      void qc.invalidateQueries({ queryKey: ["classes"] });
      router.push(`/students/${s.id}`);
    },
  });

  const updateGuardian = (key: string, patch: Partial<GuardianDraft>) =>
    setGuardians((gs) =>
      gs.map((g) => {
        if (g.key === key) return { ...g, ...patch };
        // Only one primary contact.
        return patch.isPrimary ? { ...g, isPrimary: false } : g;
      }),
    );

  return (
    <div className="grid max-w-4xl gap-6">
      <PageHeader backHref="/students" title={t("add")} />

      <Card>
        <CardHeader>
          <CardTitle>{t("identity")}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t("firstName")} htmlFor="s-first">
              <Input id="s-first" value={form.firstName} onChange={(e) => set("firstName", e.target.value)} />
            </Field>
            <Field label={t("lastName")} htmlFor="s-last">
              <Input id="s-last" value={form.lastName} onChange={(e) => set("lastName", e.target.value)} />
            </Field>
            <Field label={t("firstNameLatin")} htmlFor="s-first-l" hint={tc("optional")}>
              <Input id="s-first-l" dir="ltr" value={form.firstNameLatin} onChange={(e) => set("firstNameLatin", e.target.value)} />
            </Field>
            <Field label={t("lastNameLatin")} htmlFor="s-last-l" hint={tc("optional")}>
              <Input id="s-last-l" dir="ltr" value={form.lastNameLatin} onChange={(e) => set("lastNameLatin", e.target.value)} />
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label={t("gender")}>
              <EnumSelect ns="gender" values={["MALE", "FEMALE"] as const} value={form.gender} onChange={(v) => v && set("gender", v)} />
            </Field>
            <Field label={t("dateOfBirth")} htmlFor="s-dob" hint={form.dateOfBirth ? t("age", { age: ageFrom(form.dateOfBirth) }) : undefined}>
              <Input id="s-dob" type="date" value={form.dateOfBirth} onChange={(e) => set("dateOfBirth", e.target.value)} />
            </Field>
            <Field label={t("phone")} htmlFor="s-phone" hint={tc("optional")}>
              <Input id="s-phone" type="tel" dir="ltr" value={form.phone} onChange={(e) => set("phone", e.target.value)} />
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-[1fr_12rem]">
            <Field label={t("address")} htmlFor="s-address" hint={tc("optional")}>
              <Input id="s-address" value={form.address} onChange={(e) => set("address", e.target.value)} />
            </Field>
            <Field label={t("riwaya")}>
              <EnumSelect ns="riwaya" values={["QALUN", "WARSH", "HAFS"] as const} value={form.riwaya} noneLabel={tcl("riwayaDefault")} onChange={(v) => set("riwaya", v)} />
            </Field>
          </div>
          <Field label={t("notes")} htmlFor="s-notes">
            <Textarea id="s-notes" rows={2} value={form.notes} onChange={(e) => set("notes", e.target.value)} />
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={form.photoConsent} onCheckedChange={(v) => set("photoConsent", v === true)} />
            {t("photoConsent")}
          </label>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>
            {t("guardians")} {isMinor && <span className="text-sm font-normal text-muted-foreground">({t("guardianRequired")})</span>}
          </CardTitle>
          <Button size="sm" variant="outline" onClick={() => setGuardians((gs) => [...gs, newGuardianDraft(gs.length === 0)])}>
            <Plus /> {t("addGuardian")}
          </Button>
        </CardHeader>
        <CardContent className="grid gap-3">
          {guardians.length === 0 && <p className="text-sm text-muted-foreground">{t("noGuardians")}</p>}
          {guardians.map((g) => (
            <GuardianEditor
              key={g.key}
              draft={g}
              onChange={(patch) => updateGuardian(g.key, patch)}
              onRemove={() => setGuardians((gs) => gs.filter((x) => x.key !== g.key))}
            />
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("enrollIn")}</CardTitle>
        </CardHeader>
        <CardContent>
          <Select value={form.classId ?? NO_CLASS} onValueChange={(v) => set("classId", v === NO_CLASS ? null : v)}>
            <SelectTrigger className="w-full sm:w-96">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_CLASS}>{t("noEnrollment")}</SelectItem>
              {allowed?.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name} ({c._count.enrollments}/{c.capacity})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {create.isError && <p role="alert" className="text-destructive">{errorMessage(create.error)}</p>}
      <div className="flex gap-2">
        <Button size="lg" disabled={create.isPending || !form.firstName.trim() || !form.lastName.trim()} onClick={() => create.mutate()}>
          {create.isPending ? tc("saving") : tc("save")}
        </Button>
        <Button size="lg" variant="ghost" onClick={() => router.push("/students")}>{tc("cancel")}</Button>
      </div>
    </div>
  );
}
