"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { Field } from "@/components/form/field";
import { StudentPicker } from "@/components/student-picker";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api } from "@/lib/api";
import { useFormat } from "@/lib/format";
import type { StudentListItem } from "@/lib/types";
import { useErrorMessage } from "@/lib/use-error-message";

export interface MembershipCandidate {
  id: string;
  name: string;
  /** False when the student was a member in an earlier year. */
  isNew?: boolean;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Preselected student; otherwise a picker is shown. */
  student?: MembershipCandidate;
  year: { name: string; membershipFee: string | null };
}

export function RegisterMembershipDialog(props: Props) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent>{props.open && <Body {...props} />}</DialogContent>
    </Dialog>
  );
}

function Body({ onOpenChange, student, year }: Props) {
  const t = useTranslations("memberships");
  const tc = useTranslations("common");
  const fmt = useFormat();
  const errorMessage = useErrorMessage();
  const qc = useQueryClient();
  const [picked, setPicked] = useState<StudentListItem | null>(null);
  const [type, setType] = useState<"AUTO" | "NEW" | "RENEWAL">(
    student?.isNew === undefined ? "AUTO" : student.isNew ? "NEW" : "RENEWAL",
  );
  const [formReceived, setFormReceived] = useState(false);
  const studentId = student?.id ?? picked?.id;

  const save = useMutation({
    mutationFn: () =>
      api<{ memberNumber: string }>("/memberships", {
        method: "POST",
        body: { studentId, formReceived, isNew: type === "AUTO" ? undefined : type === "NEW" },
      }),
    onSuccess: (m) => {
      toast.success(t("registered", { number: m.memberNumber }));
      for (const key of ["memberships", "account", "charges", "classes", "finance"]) void qc.invalidateQueries({ queryKey: [key] });
      onOpenChange(false);
    },
  });

  return (
    <>
      <DialogHeader>
        <DialogTitle>
          {t("register")} — {year.name}
        </DialogTitle>
        <DialogDescription>
          {t("fee")}: {fmt.money(year.membershipFee)}
        </DialogDescription>
      </DialogHeader>
      <div className="grid gap-4">
        {student ? (
          <p className="font-medium">{student.name}</p>
        ) : (
          <StudentPicker value={picked} onChange={setPicked} />
        )}
        <Field label={t("type")}>
          <Select value={type} onValueChange={(v) => setType(v as typeof type)}>
            <SelectTrigger className="w-full" aria-label={t("type")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {type === "AUTO" && <SelectItem value="AUTO">{`${t("isNew")} / ${t("renewal")}`}</SelectItem>}
              <SelectItem value="NEW">{t("isNew")}</SelectItem>
              <SelectItem value="RENEWAL">{t("renewal")}</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={formReceived} onCheckedChange={(v) => setFormReceived(v === true)} />
          {t("formReceivedLabel")}
        </label>
        {save.isError && <p role="alert" className="text-sm text-destructive">{errorMessage(save.error)}</p>}
      </div>
      <DialogFooter>
        <Button disabled={!studentId || save.isPending} onClick={() => save.mutate()}>
          {save.isPending ? tc("saving") : t("register")}
        </Button>
      </DialogFooter>
    </>
  );
}
