"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { StarMark } from "@/components/brand/star-mark";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLogin } from "@/lib/auth";
import { useErrorMessage } from "@/lib/use-error-message";

const schema = z.object({
  login: z.string().trim().min(3),
  password: z.string().min(1),
});

/** Only allow in-app redirects after login. */
function safeNext(next: string | null) {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
}

export function LoginForm() {
  const t = useTranslations("auth");
  const tApp = useTranslations("app");
  const errorMessage = useErrorMessage();
  const router = useRouter();
  const params = useSearchParams();
  const login = useLogin();
  const form = useForm({ resolver: zodResolver(schema), defaultValues: { login: "", password: "" } });

  const onSubmit = form.handleSubmit((values) =>
    login.mutate(values, {
      onSuccess: (user) =>
        router.replace(user.mustChangePassword ? "/change-password" : safeNext(params.get("next"))),
    }),
  );

  return (
    <Card className="w-full max-w-sm">
      <CardHeader className="justify-items-center text-center">
        <StarMark className="mb-2 size-12 text-gold lg:hidden" />
        <p className="text-sm font-medium text-muted-foreground lg:hidden">{tApp("name")}</p>
        <CardTitle className="text-2xl">{t("loginTitle")}</CardTitle>
        <CardDescription>{t("loginSubtitle")}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="grid gap-4" noValidate>
          <div className="grid gap-2">
            <Label htmlFor="login">{t("login")}</Label>
            <Input id="login" dir="ltr" autoComplete="username" autoFocus {...form.register("login")} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="password">{t("password")}</Label>
            <Input id="password" type="password" dir="ltr" autoComplete="current-password" {...form.register("password")} />
          </div>
          {login.isError && (
            <p role="alert" className="text-sm text-destructive">
              {errorMessage(login.error)}
            </p>
          )}
          <Button type="submit" size="lg" disabled={login.isPending}>
            {login.isPending ? t("submitting") : t("submit")}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
