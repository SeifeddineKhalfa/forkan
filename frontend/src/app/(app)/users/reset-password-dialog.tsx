"use client";

import { useMutation } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";
import { useErrorMessage } from "@/lib/use-error-message";
import type { ListedUser } from "./types";

export function ResetPasswordDialog({ user, onClose }: { user: ListedUser | null; onClose: () => void }) {
  const t = useTranslations("users");
  const tc = useTranslations("common");
  const errorMessage = useErrorMessage();
  const [password, setPassword] = useState("");

  const reset = useMutation({
    mutationFn: () => api(`/users/${user!.id}/reset-password`, { method: "POST", body: { temporaryPassword: password } }),
    onSuccess: () => {
      toast.success(t("passwordReset"));
      setPassword("");
      onClose();
    },
  });

  return (
    <Dialog open={!!user} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {t("resetPassword")} — {user?.firstName} {user?.lastName}
          </DialogTitle>
          <DialogDescription>{t("temporaryPasswordHint")}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-2">
          <Label htmlFor="reset-password">{t("temporaryPassword")}</Label>
          <Input id="reset-password" dir="ltr" autoComplete="off" value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        {reset.isError && <p role="alert" className="text-sm text-destructive">{errorMessage(reset.error)}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {tc("cancel")}
          </Button>
          <Button disabled={password.length < 10 || reset.isPending} onClick={() => reset.mutate()}>
            {tc("confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
