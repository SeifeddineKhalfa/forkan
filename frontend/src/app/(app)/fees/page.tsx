"use client";

import { useTranslations } from "next-intl";
import { RoleGate } from "@/components/app-shell/role-gate";
import { PageHeader } from "@/components/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ChargesTab } from "./charges-tab";
import { FeeItemsCard } from "./fee-items-card";
import { GenerateCard } from "./generate-card";

export default function FeesPage() {
  return (
    <RoleGate roles={["STAFF"]}>
      <Fees />
    </RoleGate>
  );
}

function Fees() {
  const t = useTranslations("fees");
  return (
    <div className="grid gap-6">
      <PageHeader title={t("title")} subtitle={t("subtitle")} />
      <Tabs defaultValue="charges">
        <TabsList>
          <TabsTrigger value="charges">{t("tabs.charges")}</TabsTrigger>
          <TabsTrigger value="generate">{t("tabs.generate")}</TabsTrigger>
          <TabsTrigger value="items">{t("tabs.items")}</TabsTrigger>
        </TabsList>
        <TabsContent value="charges">
          <ChargesTab />
        </TabsContent>
        <TabsContent value="generate">
          <GenerateCard />
        </TabsContent>
        <TabsContent value="items">
          <FeeItemsCard />
        </TabsContent>
      </Tabs>
    </div>
  );
}
