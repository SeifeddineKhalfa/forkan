"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Field } from "@/components/form/field";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import { useFormat } from "@/lib/format";
import type { Charge } from "@/lib/types";
import { useErrorMessage } from "@/lib/use-error-message";

/** ADMIN only (the API refuses others). */
export function CancelChargeDialog({ charge, onClose }: { charge: Charge | null; onClose: () => void }) {
  return (
    <Dialog open={!!charge} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>{charge && <Body charge={charge} onClose={onClose} />}</DialogContent>
    </Dialog>
  );
}

function Body({ charge, onClose }: { charge: Charge; onClose: () => void }) {
  const t = useTranslations("fees");
  const tc = useTranslations("common");
  const fmt = useFormat();
  const errorMessage = useErrorMessage();
  const qc = useQueryClient();
  const [reason, setReason] = useState("");
  const cancel = useMutation({
    mutationFn: () => api(`/charges/${charge.id}/cancel`, { method: "POST", body: { reason } }),
    onSuccess: () => {
      for (const key of ["charges", "account", "memberships", "classes"]) void qc.invalidateQueries({ queryKey: [key] });
      onClose();
    },
  });

  return (
    <>
      <DialogHeader>
        <DialogTitle>{t("cancel")}</DialogTitle>
        <DialogDescription>
          {charge.label} · {fmt.money(charge.amount)}
        </DialogDescription>
      </DialogHeader>
      <p className="text-sm text-muted-foreground">{t("cancelHint")}</p>
      <Field label={t("cancelReason")} htmlFor="cancel-reason">
        <Textarea id="cancel-reason" value={reason} onChange={(e) => setReason(e.target.value)} />
      </Field>
      {cancel.isError && <p role="alert" className="text-sm text-destructive">{errorMessage(cancel.error)}</p>}
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>{tc("close")}</Button>
        <Button variant="destructive" disabled={reason.trim().length < 3 || cancel.isPending} onClick={() => cancel.mutate()}>
          {tc("confirm")}
        </Button>
      </DialogFooter>
    </>
  );
}
