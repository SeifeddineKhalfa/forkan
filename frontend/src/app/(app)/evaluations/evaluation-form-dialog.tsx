"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Field } from "@/components/form/field";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api } from "@/lib/api";
import type { ClassItem, EvaluationKind } from "@/lib/types";
import { useErrorMessage } from "@/lib/use-error-message";
import { BranchFields, type BranchDraft, branchPayload, newBranch } from "./branch-fields";
import { type JurorDraft, JuryEditor, juryPayload } from "./jury-editor";

const NO_CLASS = "none";

export function EvaluationFormDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const t = useTranslations("evaluations");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("new")}</DialogTitle>
        </DialogHeader>
        {open && <Body onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function Body({ onDone }: { onDone: () => void }) {
  const t = useTranslations("evaluations");
  const tc = useTranslations("common");
  const errorMessage = useErrorMessage();
  const router = useRouter();
  const qc = useQueryClient();
  const [kind, setKind] = useState<EvaluationKind>("COMPETITION");
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [location, setLocation] = useState("");
  const [classId, setClassId] = useState(NO_CLASS);
  const [branches, setBranches] = useState<BranchDraft[]>([newBranch(t("defaultBranch"))]);
  const [jurors, setJurors] = useState<JurorDraft[]>([]);
  const classes = useQuery({ queryKey: ["classes", ""], queryFn: () => api<ClassItem[]>("/classes") });

  const save = useMutation({
    mutationFn: () =>
      api<{ id: string; title: string }>("/evaluations", {
        method: "POST",
        body: {
          kind,
          title,
          date,
          location,
          classId: classId === NO_CLASS ? undefined : classId,
          branches: branches.map(branchPayload),
          jurors: juryPayload(jurors),
        },
      }),
    onSuccess: (e) => {
      toast.success(t("created", { title: e.title }));
      void qc.invalidateQueries({ queryKey: ["evaluations"] });
      onDone();
      router.push(`/evaluations/${e.id}`);
    },
  });

  const valid = title.trim() && date && branches.every((b) => b.name.trim());

  return (
    <form
      className="grid gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) save.mutate();
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("fields.kind")}>
          <Select value={kind} onValueChange={(v) => setKind(v as EvaluationKind)}>
            <SelectTrigger className="w-full" aria-label={t("fields.kind")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="COMPETITION">{t("kind.COMPETITION")}</SelectItem>
              <SelectItem value="EXAM">{t("kind.EXAM")}</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label={t("fields.date")} htmlFor="ev-date">
          <Input id="ev-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </Field>
        <Field label={t("fields.title")} htmlFor="ev-title" className="sm:col-span-2">
          <Input id="ev-title" value={title} placeholder={t("fields.titlePlaceholder")} onChange={(e) => setTitle(e.target.value)} required />
        </Field>
        <Field label={t("fields.location")} htmlFor="ev-location">
          <Input id="ev-location" value={location} onChange={(e) => setLocation(e.target.value)} />
        </Field>
        <Field label={t("fields.class")}>
          <Select value={classId} onValueChange={setClassId}>
            <SelectTrigger className="w-full" aria-label={t("fields.class")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_CLASS}>{t("fields.noClass")}</SelectItem>
              {classes.data?.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>

      <fieldset className="grid gap-3">
        <legend className="mb-2 font-heading text-lg">{t("branches")}</legend>
        {branches.map((b, i) => (
          <div key={b.key} className="grid gap-3 rounded-lg border p-3">
            <BranchFields value={b} onChange={(next) => setBranches(branches.map((x, j) => (j === i ? next : x)))} />
            {branches.length > 1 && (
              <Button type="button" variant="ghost" size="sm" className="justify-self-end text-destructive" onClick={() => setBranches(branches.filter((_, j) => j !== i))}>
                <Trash2 /> {t("removeBranch")}
              </Button>
            )}
          </div>
        ))}
        <Button type="button" variant="outline" className="justify-self-start" onClick={() => setBranches([...branches, newBranch("")])}>
          <Plus /> {t("addBranch")}
        </Button>
      </fieldset>

      <fieldset className="grid gap-3">
        <legend className="mb-2 font-heading text-lg">{t("jury")}</legend>
        <JuryEditor value={jurors} onChange={setJurors} />
      </fieldset>

      {save.isError && <p role="alert" className="text-sm text-destructive">{errorMessage(save.error)}</p>}
      <DialogFooter>
        <Button type="submit" disabled={!valid || save.isPending}>
          {save.isPending ? tc("saving") : tc("save")}
        </Button>
      </DialogFooter>
    </form>
  );
}
