"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { EnumSelect } from "@/components/form/enum-select";
import { Field } from "@/components/form/field";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import { toDateInput } from "@/lib/format";
import type { StudentDetail } from "@/lib/types";
import { useErrorMessage } from "@/lib/use-error-message";

const fromStudent = (s: StudentDetail) => ({
  firstName: s.firstName,
  lastName: s.lastName,
  firstNameLatin: s.firstNameLatin ?? "",
  lastNameLatin: s.lastNameLatin ?? "",
  gender: s.gender,
  dateOfBirth: toDateInput(s.dateOfBirth),
  phone: s.phone ?? "",
  address: s.address ?? "",
  riwaya: s.riwaya,
  photoConsent: s.photoConsent,
  notes: s.notes ?? "",
});

export function StudentEditDialog(props: {
  student: StudentDetail;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-lg">
        {/* Content unmounts when closed, so the form state resets on every open. */}
        {props.open && <StudentEditDialogBody {...props} />}
      </DialogContent>
    </Dialog>
  );
}

function StudentEditDialogBody({
  student,
  onOpenChange,
}: {
  student: StudentDetail;
  onOpenChange: (o: boolean) => void;
}) {
  const t = useTranslations("students");
  const tc = useTranslations("common");
  const tcl = useTranslations("classes");
  const errorMessage = useErrorMessage();
  const qc = useQueryClient();
  const [form, setForm] = useState(() => fromStudent(student));
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));

  const save = useMutation({
    mutationFn: () =>
      api(`/students/${student.id}`, {
        method: "PATCH",
        body: { ...form, dateOfBirth: form.dateOfBirth || null, phone: form.phone || null },
      }),
    onSuccess: () => {
      toast.success(t("updated"));
      void qc.invalidateQueries({ queryKey: ["students"] });
      onOpenChange(false);
    },
  });

  return (
    <>
        <DialogHeader>
          <DialogTitle>{tc("edit")}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("firstName")} htmlFor="e-first">
              <Input id="e-first" value={form.firstName} onChange={(e) => set("firstName", e.target.value)} />
            </Field>
            <Field label={t("lastName")} htmlFor="e-last">
              <Input id="e-last" value={form.lastName} onChange={(e) => set("lastName", e.target.value)} />
            </Field>
            <Field label={t("firstNameLatin")} htmlFor="e-first-l">
              <Input id="e-first-l" dir="ltr" value={form.firstNameLatin} onChange={(e) => set("firstNameLatin", e.target.value)} />
            </Field>
            <Field label={t("lastNameLatin")} htmlFor="e-last-l">
              <Input id="e-last-l" dir="ltr" value={form.lastNameLatin} onChange={(e) => set("lastNameLatin", e.target.value)} />
            </Field>
            <Field label={t("gender")}>
              <EnumSelect ns="gender" values={["MALE", "FEMALE"] as const} value={form.gender} onChange={(v) => v && set("gender", v)} />
            </Field>
            <Field label={t("dateOfBirth")} htmlFor="e-dob">
              <Input id="e-dob" type="date" value={form.dateOfBirth} onChange={(e) => set("dateOfBirth", e.target.value)} />
            </Field>
            <Field label={t("phone")} htmlFor="e-phone">
              <Input id="e-phone" type="tel" dir="ltr" value={form.phone} onChange={(e) => set("phone", e.target.value)} />
            </Field>
            <Field label={t("riwaya")}>
              <EnumSelect ns="riwaya" values={["QALUN", "WARSH", "HAFS"] as const} value={form.riwaya} noneLabel={tcl("riwayaDefault")} onChange={(v) => set("riwaya", v)} />
            </Field>
          </div>
          <Field label={t("address")} htmlFor="e-address">
            <Input id="e-address" value={form.address} onChange={(e) => set("address", e.target.value)} />
          </Field>
          <Field label={t("notes")} htmlFor="e-notes">
            <Textarea id="e-notes" rows={2} value={form.notes} onChange={(e) => set("notes", e.target.value)} />
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={form.photoConsent} onCheckedChange={(v) => set("photoConsent", v === true)} />
            {t("photoConsent")}
          </label>
          {save.isError && <p role="alert" className="text-sm text-destructive">{errorMessage(save.error)}</p>}
        </div>
        <DialogFooter>
          <Button disabled={save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? tc("saving") : tc("save")}
          </Button>
        </DialogFooter>
      </>
  );
}
