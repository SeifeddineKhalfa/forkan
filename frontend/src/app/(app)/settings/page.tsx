"use client";

import { useTranslations } from "next-intl";
import { RoleGate } from "@/components/app-shell/role-gate";
import { PageHeader } from "@/components/page-header";
import { PublicSiteCard, SchoolCard, TemplatesCard } from "./school-card";
import { VenuesCard } from "./venues-card";
import { YearsCard } from "./years-card";

export default function SettingsPage() {
  const t = useTranslations("settings");
  return (
    <RoleGate roles={["ADMIN"]}>
      <div className="grid gap-6">
        <PageHeader title={t("title")} />
        <SchoolCard />
        <PublicSiteCard />
        <YearsCard />
        <VenuesCard />
        <TemplatesCard />
      </div>
    </RoleGate>
  );
}
