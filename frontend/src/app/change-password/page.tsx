"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useChangePassword, useMe } from "@/lib/auth";
import { useErrorMessage } from "@/lib/use-error-message";

const schema = z
  .object({
    currentPassword: z.string().min(1),
    newPassword: z.string().min(10),
    confirm: z.string(),
  })
  .refine((v) => v.newPassword === v.confirm, { path: ["confirm"], message: "mismatch" });

export default function ChangePasswordPage() {
  const t = useTranslations("auth");
  const errorMessage = useErrorMessage();
  const router = useRouter();
  const me = useMe();
  const change = useChangePassword();
  const form = useForm({
    resolver: zodResolver(schema),
    defaultValues: { currentPassword: "", newPassword: "", confirm: "" },
  });
  const { errors } = form.formState;

  const onSubmit = form.handleSubmit(({ currentPassword, newPassword }) =>
    change.mutate(
      { currentPassword, newPassword },
      {
        onSuccess: () => {
          toast.success(t("changed"));
          router.replace("/dashboard");
        },
      },
    ),
  );

  return (
    <main className="flex min-h-svh items-center justify-center bg-background p-4 text-primary/60 girih-overlay">
      <Card className="w-full max-w-sm text-card-foreground">
        <CardHeader>
          <CardTitle>{t("changeTitle")}</CardTitle>
          {me.data?.mustChangePassword && <CardDescription>{t("changeRequired")}</CardDescription>}
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="grid gap-4" noValidate>
            <div className="grid gap-2">
              <Label htmlFor="currentPassword">{t("currentPassword")}</Label>
              <Input id="currentPassword" type="password" dir="ltr" autoComplete="current-password" {...form.register("currentPassword")} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="newPassword">{t("newPassword")}</Label>
              <Input id="newPassword" type="password" dir="ltr" autoComplete="new-password" aria-invalid={!!errors.newPassword} {...form.register("newPassword")} />
              <p className={errors.newPassword ? "text-sm text-destructive" : "text-sm text-muted-foreground"}>{t("passwordHint")}</p>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="confirm">{t("confirmPassword")}</Label>
              <Input id="confirm" type="password" dir="ltr" autoComplete="new-password" aria-invalid={!!errors.confirm} {...form.register("confirm")} />
              {errors.confirm && <p className="text-sm text-destructive">{t("mismatch")}</p>}
            </div>
            {change.isError && (
              <p role="alert" className="text-sm text-destructive">
                {errorMessage(change.error)}
              </p>
            )}
            <Button type="submit" disabled={change.isPending}>
              {t("changeTitle")}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
