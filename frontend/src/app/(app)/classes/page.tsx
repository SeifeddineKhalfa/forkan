"use client";

import { useQuery } from "@tanstack/react-query";
import { MapPin, Plus, Users } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useState } from "react";
import { ClassSchedule } from "@/components/class-schedule";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import { useMe } from "@/lib/auth";
import { useFormat } from "@/lib/format";
import type { ClassItem } from "@/lib/types";
import { useErrorMessage } from "@/lib/use-error-message";
import { CLASSES_KEY, ClassFormDialog } from "./class-form-dialog";

export default function ClassesPage() {
  const t = useTranslations("classes");
  const tc = useTranslations("common");
  const te = useTranslations("enums");
  const fmt = useFormat();
  const errorMessage = useErrorMessage();
  const { data: me } = useMe();
  const isOffice = me?.role === "ADMIN" || me?.role === "STAFF";
  const [q, setQ] = useState("");
  const [creating, setCreating] = useState(false);

  const classes = useQuery({
    queryKey: [...CLASSES_KEY, q],
    queryFn: () => api<ClassItem[]>(`/classes?active=all${q ? `&q=${encodeURIComponent(q)}` : ""}`),
  });

  return (
    <div className="grid gap-6">
      <PageHeader
        title={me?.role === "TEACHER" ? t("mine") : t("title")}
        subtitle={t("subtitle")}
        actions={
          isOffice && (
            <Button onClick={() => setCreating(true)}>
              <Plus /> {t("add")}
            </Button>
          )
        }
      />
      <Input className="max-w-sm" placeholder={tc("search")} value={q} onChange={(e) => setQ(e.target.value)} />
      {classes.isError && <p className="text-destructive">{errorMessage(classes.error)}</p>}
      {classes.data?.length === 0 && <p className="text-muted-foreground">{t("noClasses")}</p>}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {classes.data?.map((c) => {
          const main = c.teachers.find((x) => x.role === "MAIN")?.teacher;
          return (
            <Link key={c.id} href={`/classes/${c.id}`} className="group">
              <Card className={`h-full transition-colors group-hover:border-primary ${c.isActive ? "" : "opacity-60"}`}>
                <CardHeader>
                  <CardTitle className="leading-snug">{c.name}</CardTitle>
                  <CardDescription>{c.quranScope}</CardDescription>
                  <div className="flex flex-wrap gap-1 pt-1">
                    <Badge variant="secondary">{te(`audience.${c.audience}`)}</Badge>
                    {c.genderPolicy !== "MIXED" && <Badge variant="secondary">{te(`genderPolicy.${c.genderPolicy}`)}</Badge>}
                    <Badge variant="outline">{fmt.fee(c.monthlyFee)}</Badge>
                    {!c.isActive && <Badge variant="destructive">{t("inactiveClass")}</Badge>}
                  </div>
                </CardHeader>
                <CardContent className="grid gap-3 text-sm">
                  {main && (
                    <p>
                      {main.title ?? te("teachingRole.MAIN")} {main.firstName} {main.lastName}
                    </p>
                  )}
                  <ClassSchedule slots={c.scheduleSlots} />
                  <div className="flex flex-wrap items-center gap-4 text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Users className="size-4" aria-hidden />
                      <span dir="ltr">{t("places", { count: c._count.enrollments, capacity: c.capacity })}</span>
                    </span>
                    {c.room && (
                      <span className="flex items-center gap-1">
                        <MapPin className="size-4" aria-hidden />
                        {c.room.venue.name} — {c.room.name}
                      </span>
                    )}
                  </div>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
      {isOffice && <ClassFormDialog open={creating} onOpenChange={setCreating} />}
    </div>
  );
}
