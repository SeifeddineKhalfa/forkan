"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { Field } from "@/components/form/field";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api } from "@/lib/api";
import { useFormat } from "@/lib/format";
import type { FeeItem } from "@/lib/types";
import { useErrorMessage } from "@/lib/use-error-message";

export const FEE_ITEMS_KEY = ["fee-items"] as const;
const CUSTOM = "CUSTOM";

/** For one student, or for every active student of an imla' (bulk). */
export type ChargeTarget = { studentId: string } | { classId: string; className: string };

interface Props {
  target: ChargeTarget | null;
  onOpenChange: (open: boolean) => void;
}

/** One-off charge from the catalog or free text. */
export function ChargeDialog(props: Props) {
  return (
    <Dialog open={!!props.target} onOpenChange={props.onOpenChange}>
      <DialogContent>{props.target && <ChargeDialogBody target={props.target} onOpenChange={props.onOpenChange} />}</DialogContent>
    </Dialog>
  );
}

function ChargeDialogBody({ target, onOpenChange }: { target: ChargeTarget; onOpenChange: (open: boolean) => void }) {
  const t = useTranslations("fees");
  const tc = useTranslations("common");
  const fmt = useFormat();
  const errorMessage = useErrorMessage();
  const qc = useQueryClient();
  const bulk = "classId" in target;
  const items = useQuery({ queryKey: FEE_ITEMS_KEY, queryFn: () => api<FeeItem[]>("/fee-items") });
  const active = items.data?.filter((i) => i.isActive) ?? [];

  const [feeItemId, setFeeItemId] = useState<string>("");
  const [label, setLabel] = useState("");
  const [amount, setAmount] = useState("");
  const [dueDate, setDueDate] = useState("");
  const item = active.find((i) => i.id === feeItemId);
  const custom = feeItemId === CUSTOM;

  const save = useMutation({
    mutationFn: () => {
      const body = {
        feeItemId: custom ? undefined : feeItemId,
        label: custom ? label : undefined,
        amount: amount || undefined,
        dueDate: dueDate || undefined,
      };
      return bulk
        ? api<{ created: number; skipped: number }>("/charges/bulk", { method: "POST", body: { ...body, classId: target.classId } })
        : api("/charges", { method: "POST", body: { ...body, studentId: target.studentId } });
    },
    onSuccess: (res) => {
      if (bulk) toast.success(t("bulkDone", res as { created: number; skipped: number }));
      else toast.success(tc("saved"));
      void qc.invalidateQueries({ queryKey: ["charges"] });
      void qc.invalidateQueries({ queryKey: ["account"] });
      onOpenChange(false);
    },
  });

  return (
    <>
      <DialogHeader>
        <DialogTitle>{bulk ? `${t("bulkCharge")}: ${target.className}` : t("addCharge")}</DialogTitle>
        {bulk && <DialogDescription>{t("bulkHint")}</DialogDescription>}
      </DialogHeader>
      <div className="grid gap-4">
        <Field label={t("feeItem")}>
          <Select value={feeItemId || undefined} onValueChange={setFeeItemId}>
            <SelectTrigger className="w-full" aria-label={t("feeItem")}>
              <SelectValue placeholder={t("feeItem")} />
            </SelectTrigger>
            <SelectContent>
              {active.map((i) => (
                <SelectItem key={i.id} value={i.id}>
                  {i.name} · {fmt.money(i.defaultAmount)}
                </SelectItem>
              ))}
              <SelectItem value={CUSTOM}>{t("customItem")}</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        {custom && (
          <Field label={t("label")} htmlFor="c-label">
            <Input id="c-label" value={label} onChange={(e) => setLabel(e.target.value)} />
          </Field>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field label={`${t("amount")} (${tc("currency")})`} htmlFor="c-amount" hint={custom ? undefined : t("amountHint")}>
            <Input
              id="c-amount"
              dir="ltr"
              inputMode="decimal"
              placeholder={item?.defaultAmount}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </Field>
          <Field label={t("dueDate")} htmlFor="c-due" hint={t("dueDateHint")}>
            <Input id="c-due" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </Field>
        </div>
        {save.isError && <p role="alert" className="text-sm text-destructive">{errorMessage(save.error)}</p>}
      </div>
      <DialogFooter>
        <Button disabled={!feeItemId || (custom && (!label || !amount)) || save.isPending} onClick={() => save.mutate()}>
          {save.isPending ? tc("saving") : tc("save")}
        </Button>
      </DialogFooter>
    </>
  );
}
