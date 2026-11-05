"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CalendarPlus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Field } from "@/components/form/field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import type { GenerationResult } from "@/lib/types";
import { useErrorMessage } from "@/lib/use-error-message";

const thisMonth = () => new Date().toISOString().slice(0, 7);

/** Manual trigger of the monthly job (it also runs every morning). */
export function GenerateCard() {
  const t = useTranslations("fees");
  const errorMessage = useErrorMessage();
  const qc = useQueryClient();
  const [period, setPeriod] = useState(thisMonth);
  const generate = useMutation({
    mutationFn: () => api<GenerationResult>("/charges/generate-monthly", { method: "POST", body: { period } }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["charges"] });
      void qc.invalidateQueries({ queryKey: ["account"] });
    },
  });

  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle>{t("generateTitle")}</CardTitle>
        <CardDescription>{t("generateHint")}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="flex flex-wrap items-end gap-3">
          <Field label={t("period")} htmlFor="gen-period">
            <Input id="gen-period" type="month" className="w-48" value={period} onChange={(e) => setPeriod(e.target.value)} />
          </Field>
          <Button disabled={!period || generate.isPending} onClick={() => generate.mutate()}>
            <CalendarPlus /> {t("generate")}
          </Button>
        </div>
        {generate.isError && <p role="alert" className="text-sm text-destructive">{errorMessage(generate.error)}</p>}
        {generate.data && (
          <Alert>
            <AlertDescription>{t("generated", { ...generate.data })}</AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}
