"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { Field } from "@/components/form/field";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import type { SchoolSettings, TemplateKind } from "@/lib/types";
import { useErrorMessage } from "@/lib/use-error-message";
import { SETTINGS_KEY, useSettings } from "@/lib/whatsapp";

const TEMPLATE_KINDS: TemplateKind[] = ["RECEIPT", "PAYMENT_REMINDER", "MEMBERSHIP_REMINDER", "ABSENCE", "CLASS_ANNOUNCEMENT"];

/** The placeholders each template can use (filled in by the frontend). */
const PLACEHOLDERS: Record<TemplateKind, string[]> = {
  RECEIPT: ["studentName", "amount", "receiptUrl", "receiptNumber"],
  PAYMENT_REMINDER: ["studentName", "amount", "label"],
  MEMBERSHIP_REMINDER: ["studentName", "amount", "year", "deadline"],
  ABSENCE: ["studentName", "className", "date"],
  CLASS_ANNOUNCEMENT: ["text"],
};

function useSaveSettings() {
  const tc = useTranslations("common");
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) => api<SchoolSettings>("/settings", { method: "PATCH", body }),
    onSuccess: (data) => {
      qc.setQueryData(SETTINGS_KEY, data);
      toast.success(tc("saved"));
    },
  });
}

export function SchoolCard() {
  const settings = useSettings();
  if (!settings.data) return null;
  return <SchoolForm settings={settings.data} />;
}

function SchoolForm({ settings }: { settings: SchoolSettings }) {
  const t = useTranslations("settings");
  const tc = useTranslations("common");
  const errorMessage = useErrorMessage();
  const save = useSaveSettings();
  const [form, setForm] = useState({
    schoolAddress: settings.school.address ?? "",
    contactPhone: settings.contactPhone ?? "",
    whatsappPhone: settings.whatsappPhone ?? "",
    receiptFooter: settings.receiptFooter ?? "",
    billingDay: String(settings.billingDay),
    paymentDueDays: String(settings.paymentDueDays),
    showHijriDates: settings.showHijriDates,
  });
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("school")}</CardTitle>
        <CardDescription>{settings.school.name}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2">
        <Field label={t("schoolAddress")} htmlFor="s-address" className="sm:col-span-2">
          <Input id="s-address" value={form.schoolAddress} onChange={(e) => set("schoolAddress", e.target.value)} />
        </Field>
        <Field label={t("contactPhone")} htmlFor="s-phone">
          <Input id="s-phone" dir="ltr" value={form.contactPhone} onChange={(e) => set("contactPhone", e.target.value)} />
        </Field>
        <Field label={t("whatsappPhone")} htmlFor="s-wa">
          <Input id="s-wa" dir="ltr" value={form.whatsappPhone} onChange={(e) => set("whatsappPhone", e.target.value)} />
        </Field>
        <Field label={t("receiptFooter")} htmlFor="s-footer" className="sm:col-span-2">
          <Input id="s-footer" value={form.receiptFooter} onChange={(e) => set("receiptFooter", e.target.value)} />
        </Field>
        <Field label={t("billingDay")} htmlFor="s-day">
          <Input id="s-day" type="number" min={1} max={28} value={form.billingDay} onChange={(e) => set("billingDay", e.target.value)} />
        </Field>
        <Field label={t("paymentDueDays")} htmlFor="s-due">
          <Input id="s-due" type="number" min={0} max={90} value={form.paymentDueDays} onChange={(e) => set("paymentDueDays", e.target.value)} />
        </Field>
        <label className="flex items-center gap-2 text-sm sm:col-span-2">
          <Switch checked={form.showHijriDates} onCheckedChange={(v) => set("showHijriDates", v)} />
          {t("showHijri")}
        </label>
        {save.isError && <p role="alert" className="text-sm text-destructive sm:col-span-2">{errorMessage(save.error)}</p>}
        <div className="sm:col-span-2">
          <Button
            disabled={save.isPending}
            onClick={() =>
              save.mutate({
                schoolAddress: form.schoolAddress,
                contactPhone: form.contactPhone || null,
                whatsappPhone: form.whatsappPhone || null,
                receiptFooter: form.receiptFooter || null,
                billingDay: Number(form.billingDay),
                paymentDueDays: Number(form.paymentDueDays),
                showHijriDates: form.showHijriDates,
              })
            }
          >
            {save.isPending ? tc("saving") : tc("save")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export function TemplatesCard() {
  const settings = useSettings();
  if (!settings.data) return null;
  return <TemplatesForm settings={settings.data} />;
}

function TemplatesForm({ settings }: { settings: SchoolSettings }) {
  const t = useTranslations("settings");
  const tc = useTranslations("common");
  const errorMessage = useErrorMessage();
  const save = useSaveSettings();
  const [templates, setTemplates] = useState<Partial<Record<TemplateKind, string>>>(settings.whatsappTemplates);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("templates")}</CardTitle>
        <CardDescription>{t("templatesHint", { example: "{{studentName}}" })}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {TEMPLATE_KINDS.map((kind) => (
          <Field
            key={kind}
            label={t(`templateKind.${kind}`)}
            htmlFor={`tpl-${kind}`}
            hint={<span dir="ltr">{PLACEHOLDERS[kind].map((p) => `{{${p}}}`).join("  ")}</span>}
          >
            <Textarea
              id={`tpl-${kind}`}
              rows={2}
              value={templates[kind] ?? ""}
              onChange={(e) => setTemplates({ ...templates, [kind]: e.target.value })}
            />
          </Field>
        ))}
        {save.isError && <p role="alert" className="text-sm text-destructive">{errorMessage(save.error)}</p>}
        <div>
          <Button
            disabled={save.isPending}
            onClick={() =>
              save.mutate({ whatsappTemplates: Object.fromEntries(Object.entries(templates).filter(([, v]) => v?.trim())) })
            }
          >
            {save.isPending ? tc("saving") : tc("save")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export function PublicSiteCard() {
  const settings = useSettings();
  if (!settings.data) return null;
  return <PublicSiteForm settings={settings.data} />;
}

function PublicSiteForm({ settings }: { settings: SchoolSettings }) {
  const t = useTranslations("settings");
  const tc = useTranslations("common");
  const errorMessage = useErrorMessage();
  const save = useSaveSettings();
  const links = settings.socialLinks ?? {};
  const [form, setForm] = useState({
    aboutHtml: settings.aboutHtml ?? "",
    mapEmbedUrl: settings.mapEmbedUrl ?? "",
    facebook: links.facebook ?? "",
    instagram: links.instagram ?? "",
    youtube: links.youtube ?? "",
  });
  const set = <K extends keyof typeof form>(k: K, v: string) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("publicSite")}</CardTitle>
        <CardDescription>{t("publicSiteHint")}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2">
        <Field label={t("about")} htmlFor="ps-about" hint={t("aboutHint")} className="sm:col-span-2">
          <Textarea id="ps-about" rows={5} value={form.aboutHtml} onChange={(e) => set("aboutHtml", e.target.value)} />
        </Field>
        <Field label={t("mapEmbed")} htmlFor="ps-map" className="sm:col-span-2">
          <Input id="ps-map" dir="ltr" value={form.mapEmbedUrl} onChange={(e) => set("mapEmbedUrl", e.target.value)} />
        </Field>
        {(["facebook", "instagram", "youtube"] as const).map((k) => (
          <Field key={k} label={t(k)} htmlFor={`ps-${k}`}>
            <Input id={`ps-${k}`} dir="ltr" placeholder="https://" value={form[k]} onChange={(e) => set(k, e.target.value)} />
          </Field>
        ))}
        {save.isError && <p role="alert" className="text-sm text-destructive sm:col-span-2">{errorMessage(save.error)}</p>}
        <div className="sm:col-span-2">
          <Button
            disabled={save.isPending}
            onClick={() =>
              save.mutate({
                aboutHtml: form.aboutHtml.trim() || null,
                mapEmbedUrl: form.mapEmbedUrl.trim() || null,
                socialLinks: { facebook: form.facebook.trim(), instagram: form.instagram.trim(), youtube: form.youtube.trim() },
              })
            }
          >
            {save.isPending ? tc("saving") : tc("save")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
