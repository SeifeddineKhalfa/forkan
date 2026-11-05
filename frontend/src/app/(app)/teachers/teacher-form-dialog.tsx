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
import { useMe } from "@/lib/auth";
import { toDateInput } from "@/lib/format";
import type { Gender, Teacher } from "@/lib/types";
import { useErrorMessage } from "@/lib/use-error-message";

export const TEACHERS_KEY = ["teachers"] as const;

interface Form {
  title: string;
  firstName: string;
  lastName: string;
  gender: Gender;
  phone: string;
  specialization: string;
  hireDate: string;
  contractType: "VOLUNTEER" | "PAID";
  monthlySalary: string;
  notes: string;
  withLogin: boolean;
  loginEmail: string;
  loginPhone: string;
  temporaryPassword: string;
}

const fromTeacher = (t?: Teacher): Form => ({
  title: t?.title ?? "",
  firstName: t?.firstName ?? "",
  lastName: t?.lastName ?? "",
  gender: t?.gender ?? "FEMALE",
  phone: t?.phone ?? "",
  specialization: t?.specialization ?? "",
  hireDate: toDateInput(t?.hireDate),
  contractType: t?.contractType ?? "VOLUNTEER",
  monthlySalary: t?.monthlySalary ?? "",
  notes: t?.notes ?? "",
  withLogin: false,
  loginEmail: "",
  loginPhone: "",
  temporaryPassword: "",
});

/** Create (teacher undefined) or edit a teacher. */
export function TeacherFormDialog(props: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  teacher?: Teacher;
  onSaved?: (t: Teacher) => void;
}) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-lg">
        {/* Content unmounts when closed, so the form state resets on every open. */}
        {props.open && <TeacherFormDialogBody {...props} />}
      </DialogContent>
    </Dialog>
  );
}

function TeacherFormDialogBody({
  onOpenChange,
  teacher,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  teacher?: Teacher;
  onSaved?: (t: Teacher) => void;
}) {
  const t = useTranslations("teachers");
  const tc = useTranslations("common");
  const tu = useTranslations("users");
  const errorMessage = useErrorMessage();
  const qc = useQueryClient();
  const { data: me } = useMe();
  const isAdmin = me?.role === "ADMIN";
  const [form, setForm] = useState<Form>(() => fromTeacher(teacher));
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));

  const save = useMutation({
    mutationFn: () => {
      const body = {
        title: form.title,
        firstName: form.firstName,
        lastName: form.lastName,
        gender: form.gender,
        phone: form.phone,
        specialization: form.specialization,
        hireDate: form.hireDate,
        notes: form.notes,
        ...(isAdmin && { contractType: form.contractType, monthlySalary: teacher ? form.monthlySalary || null : form.monthlySalary }),
        ...(!teacher &&
          form.withLogin && {
            login: { email: form.loginEmail, phone: form.loginPhone, temporaryPassword: form.temporaryPassword },
          }),
      };
      return teacher
        ? api<Teacher>(`/teachers/${teacher.id}`, { method: "PATCH", body })
        : api<Teacher>("/teachers", { method: "POST", body });
    },
    onSuccess: (saved) => {
      toast.success(teacher ? tc("saved") : t("created"));
      void qc.invalidateQueries({ queryKey: TEACHERS_KEY });
      onOpenChange(false);
      onSaved?.(saved);
    },
  });

  return (
    <>
        <DialogHeader>
          <DialogTitle>{teacher ? tc("edit") : t("add")}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4">
          <Field label={t("title_")} htmlFor="t-title" hint={tc("optional")}>
            <Input id="t-title" value={form.title} onChange={(e) => set("title", e.target.value)} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("firstName")} htmlFor="t-first">
              <Input id="t-first" value={form.firstName} onChange={(e) => set("firstName", e.target.value)} />
            </Field>
            <Field label={t("lastName")} htmlFor="t-last">
              <Input id="t-last" value={form.lastName} onChange={(e) => set("lastName", e.target.value)} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("gender")}>
              <EnumSelect ns="gender" values={["FEMALE", "MALE"] as const} value={form.gender} onChange={(v) => v && set("gender", v)} />
            </Field>
            <Field label={t("phone")} htmlFor="t-phone">
              <Input id="t-phone" type="tel" dir="ltr" value={form.phone} onChange={(e) => set("phone", e.target.value)} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("specialization")} htmlFor="t-spec">
              <Input id="t-spec" value={form.specialization} onChange={(e) => set("specialization", e.target.value)} />
            </Field>
            <Field label={t("hireDate")} htmlFor="t-hire">
              <Input id="t-hire" type="date" value={form.hireDate} onChange={(e) => set("hireDate", e.target.value)} />
            </Field>
          </div>
          {isAdmin && (
            <div className="grid grid-cols-2 gap-3">
              <Field label={t("contract")}>
                <EnumSelect
                  ns="contractType"
                  values={["VOLUNTEER", "PAID"] as const}
                  value={form.contractType}
                  onChange={(v) => v && set("contractType", v)}
                />
              </Field>
              <Field label={t("salary")} htmlFor="t-salary">
                <Input id="t-salary" dir="ltr" inputMode="decimal" value={form.monthlySalary} onChange={(e) => set("monthlySalary", e.target.value)} />
              </Field>
            </div>
          )}
          <Field label={t("notes")} htmlFor="t-notes">
            <Textarea id="t-notes" rows={2} value={form.notes} onChange={(e) => set("notes", e.target.value)} />
          </Field>

          {!teacher && (
            <div className="grid gap-3 rounded-lg border p-3">
              <label className="flex items-center gap-2 text-sm font-medium">
                <Checkbox checked={form.withLogin} onCheckedChange={(v) => set("withLogin", v === true)} />
                {t("withLogin")}
              </label>
              {form.withLogin ? (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label={tu("email")} htmlFor="t-login-email">
                      <Input id="t-login-email" type="email" dir="ltr" value={form.loginEmail} onChange={(e) => set("loginEmail", e.target.value)} />
                    </Field>
                    <Field label={tu("phone")} htmlFor="t-login-phone">
                      <Input id="t-login-phone" type="tel" dir="ltr" value={form.loginPhone} onChange={(e) => set("loginPhone", e.target.value)} />
                    </Field>
                  </div>
                  <Field label={tu("temporaryPassword")} htmlFor="t-login-pass" hint={tu("temporaryPasswordHint")}>
                    <Input id="t-login-pass" dir="ltr" autoComplete="off" value={form.temporaryPassword} onChange={(e) => set("temporaryPassword", e.target.value)} />
                  </Field>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">{t("noLogin")}</p>
              )}
            </div>
          )}
          {save.isError && <p role="alert" className="text-sm text-destructive">{errorMessage(save.error)}</p>}
        </div>
        <DialogFooter>
          <Button disabled={save.isPending || !form.firstName.trim() || !form.lastName.trim()} onClick={() => save.mutate()}>
            {save.isPending ? tc("saving") : tc("save")}
          </Button>
        </DialogFooter>
      </>
  );
}
