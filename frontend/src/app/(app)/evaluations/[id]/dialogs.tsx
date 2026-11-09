"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { Field } from "@/components/form/field";
import { StudentPicker } from "@/components/student-picker";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api } from "@/lib/api";
import type { ClassItem, EvaluationBranch, Gender, StudentListItem } from "@/lib/types";
import { useErrorMessage } from "@/lib/use-error-message";
import { BranchFields, type BranchDraft, branchDraft, branchPayload, newBranch } from "../branch-fields";

const useRefresh = (id: string) => {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ["evaluations"] });
    void qc.invalidateQueries({ queryKey: ["evaluation", id] });
  };
};

function BranchSelect({ branches, value, onChange }: { branches: EvaluationBranch[]; value: string; onChange: (v: string) => void }) {
  const t = useTranslations("evaluations");
  return (
    <Field label={t("branch")}>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="w-full" aria-label={t("branch")}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {branches.map((b) => (
            <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  );
}

/** A student of the school, or an outside contestant typed by hand. */
export function AddCandidateDialog({ evaluationId, branches, open, onOpenChange }: { evaluationId: string; branches: EvaluationBranch[]; open: boolean; onOpenChange: (o: boolean) => void }) {
  const t = useTranslations("evaluations");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("addCandidate")}</DialogTitle>
        </DialogHeader>
        {open && <AddCandidateBody evaluationId={evaluationId} branches={branches} onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function AddCandidateBody({ evaluationId, branches, onDone }: { evaluationId: string; branches: EvaluationBranch[]; onDone: () => void }) {
  const t = useTranslations("evaluations");
  const tc = useTranslations("common");
  const te = useTranslations("enums");
  const errorMessage = useErrorMessage();
  const refresh = useRefresh(evaluationId);
  const [source, setSource] = useState<"student" | "external">("student");
  const [branchId, setBranchId] = useState(branches[0]?.id ?? "");
  const [student, setStudent] = useState<StudentListItem | null>(null);
  const [fullName, setFullName] = useState("");
  const [gender, setGender] = useState<Gender | "">("");
  const [phone, setPhone] = useState("");
  const [keepOpen, setKeepOpen] = useState(false);

  const save = useMutation({
    mutationFn: () =>
      api(`/evaluations/${evaluationId}/candidates`, {
        method: "POST",
        body: source === "student" ? { branchId, studentId: student?.id } : { branchId, fullName, gender: gender || undefined, phone },
      }),
    onSuccess: () => {
      refresh();
      toast.success(tc("saved"));
      if (keepOpen) {
        setStudent(null);
        setFullName("");
        setPhone("");
      } else onDone();
    },
  });
  const ready = branchId && (source === "student" ? !!student : !!fullName.trim());

  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (ready) save.mutate();
      }}
    >
      <BranchSelect branches={branches} value={branchId} onChange={setBranchId} />
      <Tabs value={source} onValueChange={(v) => setSource(v as typeof source)}>
        <TabsList className="w-full">
          <TabsTrigger value="student">{t("fromStudents")}</TabsTrigger>
          <TabsTrigger value="external">{t("externalCandidate")}</TabsTrigger>
        </TabsList>
        <TabsContent value="student" className="pt-2">
          <StudentPicker value={student} onChange={setStudent} />
        </TabsContent>
        <TabsContent value="external" className="grid gap-3 pt-2">
          <Field label={t("fullName")} htmlFor="cand-name">
            <Input id="cand-name" value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t("gender")}>
              <Select value={gender} onValueChange={(v) => setGender(v as Gender)}>
                <SelectTrigger className="w-full" aria-label={t("gender")}>
                  <SelectValue placeholder={tc("optional")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="MALE">{te("gender.MALE")}</SelectItem>
                  <SelectItem value="FEMALE">{te("gender.FEMALE")}</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label={t("phone")} htmlFor="cand-phone">
              <Input id="cand-phone" dir="ltr" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </Field>
          </div>
        </TabsContent>
      </Tabs>
      {save.isError && <p role="alert" className="text-sm text-destructive">{errorMessage(save.error)}</p>}
      <DialogFooter className="gap-2">
        <Button type="submit" variant="outline" disabled={!ready || save.isPending} onClick={() => setKeepOpen(true)}>
          {tc("add")} +
        </Button>
        <Button type="submit" disabled={!ready || save.isPending} onClick={() => setKeepOpen(false)}>
          {save.isPending ? tc("saving") : tc("add")}
        </Button>
      </DialogFooter>
    </form>
  );
}

export function AddFromClassDialog({ evaluationId, branches, defaultClassId, open, onOpenChange }: { evaluationId: string; branches: EvaluationBranch[]; defaultClassId?: string; open: boolean; onOpenChange: (o: boolean) => void }) {
  const t = useTranslations("evaluations");
  const tc = useTranslations("common");
  const errorMessage = useErrorMessage();
  const refresh = useRefresh(evaluationId);
  const [classId, setClassId] = useState(defaultClassId ?? "");
  const [branchId, setBranchId] = useState(branches[0]?.id ?? "");
  const classes = useQuery({ queryKey: ["classes", ""], queryFn: () => api<ClassItem[]>("/classes"), enabled: open });
  const save = useMutation({
    mutationFn: () => api<{ added: number; skipped: number }>(`/evaluations/${evaluationId}/candidates/from-class`, { method: "POST", body: { classId, branchId } }),
    onSuccess: (r) => {
      refresh();
      toast.success(t("addedFromClass", r));
      onOpenChange(false);
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("addFromClass")}</DialogTitle>
          <DialogDescription>{t("addFromClassHint")}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <Field label={t("fields.class")}>
            <Select value={classId} onValueChange={setClassId}>
              <SelectTrigger className="w-full" aria-label={t("fields.class")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {classes.data?.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <BranchSelect branches={branches} value={branchId} onChange={setBranchId} />
          {save.isError && <p role="alert" className="text-sm text-destructive">{errorMessage(save.error)}</p>}
        </div>
        <DialogFooter>
          <Button disabled={!classId || !branchId || save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? tc("saving") : tc("add")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Add a branch, or edit one (`branch` given). */
export function BranchDialog({ evaluationId, branch, open, onOpenChange }: { evaluationId: string; branch?: EvaluationBranch; open: boolean; onOpenChange: (o: boolean) => void }) {
  const t = useTranslations("evaluations");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{branch ? t("editBranch") : t("addBranch")}</DialogTitle>
        </DialogHeader>
        {open && <BranchBody evaluationId={evaluationId} branch={branch} onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function BranchBody({ evaluationId, branch, onDone }: { evaluationId: string; branch?: EvaluationBranch; onDone: () => void }) {
  const tc = useTranslations("common");
  const errorMessage = useErrorMessage();
  const refresh = useRefresh(evaluationId);
  const [draft, setDraft] = useState<BranchDraft>(branch ? branchDraft(branch) : newBranch(""));
  const save = useMutation({
    mutationFn: () =>
      api(branch ? `/evaluations/${evaluationId}/branches/${branch.id}` : `/evaluations/${evaluationId}/branches`, {
        method: branch ? "PATCH" : "POST",
        body: branchPayload(draft),
      }),
    onSuccess: () => {
      refresh();
      onDone();
    },
  });
  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      <BranchFields value={draft} onChange={setDraft} />
      {save.isError && <p role="alert" className="text-sm text-destructive">{errorMessage(save.error)}</p>}
      <DialogFooter>
        <Button type="submit" disabled={!draft.name.trim() || save.isPending}>
          {save.isPending ? tc("saving") : tc("save")}
        </Button>
      </DialogFooter>
    </form>
  );
}

/** Yes/no dialog for actions that cannot be undone from the page. */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  destructive,
  pending,
  error,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  description?: string;
  confirmLabel: string;
  destructive?: boolean;
  pending?: boolean;
  error?: string | null;
  onConfirm: () => void;
}) {
  const tc = useTranslations("common");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>{tc("cancel")}</Button>
          <Button variant={destructive ? "destructive" : "default"} disabled={pending} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
