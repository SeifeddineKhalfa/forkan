"use client";

import { useQuery } from "@tanstack/react-query";
import { BellRing, BookMarked, CalendarCheck, UserPlus, Wallet } from "lucide-react";
import { useTimeZone, useTranslations } from "next-intl";
import Link from "next/link";
import { pct } from "@/components/attendance/attendance-views";
import { StarMark } from "@/components/brand/star-mark";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { type SessionUser, useMe } from "@/lib/auth";
import { useFormat } from "@/lib/format";
import type { AttendanceSummary, DayView, FinanceSummary } from "@/lib/types";
import { cn } from "@/lib/utils";

export default function DashboardPage() {
  const { data: user } = useMe();

  return (
    <div className="grid gap-6">
      {user ? (
        <Welcome user={user} />
      ) : (
        <Skeleton className="h-40 rounded-2xl" />
      )}
      {user && (
        <div className="grid gap-6 lg:grid-cols-2">
          <TodayCard />
          {user.role !== "TEACHER" && <FinanceCard />}
          <AttendanceCard office={user.role !== "TEACHER"} />
        </div>
      )}
    </div>
  );
}

/** Greeting banner: today in both calendars, and the role's usual first moves. */
function Welcome({ user }: { user: SessionUser }) {
  const t = useTranslations("dashboard");
  const tr = useTranslations("roles");
  const timeZone = useTimeZone();
  const now = new Date();
  const gregorian = new Intl.DateTimeFormat("ar-TN", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone }).format(now);
  const hijri = new Intl.DateTimeFormat("ar-TN-u-ca-islamic-umalqura", { day: "numeric", month: "long", year: "numeric", timeZone }).format(now);
  const actions =
    user.role === "TEACHER"
      ? [
          { href: "/attendance", icon: CalendarCheck, label: t("takeAttendance") },
          { href: "/hifz", icon: BookMarked, label: t("hifzEntry") },
        ]
      : [
          { href: "/payments/new", icon: Wallet, label: t("newPayment") },
          { href: "/students/new", icon: UserPlus, label: t("newStudent") },
          { href: "/attendance", icon: CalendarCheck, label: t("takeAttendance") },
          { href: "/payments/reminders", icon: BellRing, label: t("reminders") },
        ];
  return (
    <section className="relative overflow-hidden rounded-2xl bg-sidebar px-5 py-6 text-sidebar-foreground ring-1 ring-sidebar-border girih-overlay dark:bg-secondary md:px-8 md:py-8">
      <StarMark className="pointer-events-none absolute -end-10 -top-10 size-48 text-sidebar-primary/15 md:size-64" />
      <div className="relative grid gap-5">
        <div className="grid gap-1">
          <p className="text-sm text-sidebar-primary" suppressHydrationWarning>
            {gregorian} · {hijri}
          </p>
          <h1 className="text-3xl font-bold text-sidebar-accent-foreground md:text-4xl">{t("welcome", { name: user.firstName })}</h1>
          <p className="text-sm text-sidebar-foreground/70">{t("roleLine", { role: tr(user.role) })}</p>
        </div>
        <nav aria-label={t("quick")} className="flex flex-wrap gap-2">
          {actions.map((a) => (
            <Link
              key={a.href}
              href={a.href}
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-sidebar-accent px-4 text-sm font-medium text-sidebar-accent-foreground ring-1 ring-sidebar-border transition-colors hover:bg-sidebar-primary hover:text-sidebar-primary-foreground"
            >
              <a.icon className="size-4" /> {a.label}
            </Link>
          ))}
        </nav>
      </div>
    </section>
  );
}

function TodayCard() {
  const t = useTranslations("attendance");
  const day = useQuery({ queryKey: ["attendance", "day", "dashboard"], queryFn: () => api<DayView>("/attendance/day") });
  const items = day.data?.items ?? [];
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle>{t("todaySessions")}</CardTitle>
        <Button size="sm" asChild>
          <Link href="/attendance">
            <CalendarCheck /> {t("title")}
          </Link>
        </Button>
      </CardHeader>
      <CardContent className="grid gap-2 text-sm">
        {day.data && items.length === 0 && <p className="text-muted-foreground">{t("noSessions")}</p>}
        {items.map((i) => (
          <div key={`${i.class.id}-${i.startTime}`} className="flex items-center justify-between gap-2 rounded-lg border-s-4 border-gold bg-muted/50 px-3 py-2">
            <span className="font-medium">{i.class.name}</span>
            <span className="text-muted-foreground">
              {i.session?.status === "CANCELLED"
                ? t("cancelled", { reason: i.session.cancelReason ?? "" })
                : (i.slot?.timeLabel ?? <span dir="ltr">{i.startTime}</span>)}
            </span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function FinanceCard() {
  const t = useTranslations("payments");
  const fmt = useFormat();
  const f = useQuery({ queryKey: ["finance", "dashboard"], queryFn: () => api<FinanceSummary>("/finance/summary") }).data;
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle>{t("finance")}</CardTitle>
        <Button size="sm" variant="outline" asChild>
          <Link href="/payments">
            <Wallet /> {t("title")}
          </Link>
        </Button>
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-4 text-sm">
        <Figure label={t("collected")} value={f && fmt.money(f.collected)} />
        <Figure label={t("rate")} value={f && pct(f.month.rate)} />
        <Figure label={t("outstanding")} value={f && fmt.money(f.outstanding)} />
        <Figure label={t("overdue")} value={f && fmt.money(f.overdue)} danger={!!f && Number(f.overdue) > 0} />
      </CardContent>
    </Card>
  );
}

function AttendanceCard({ office }: { office: boolean }) {
  const t = useTranslations("attendance");
  const s = useQuery({ queryKey: ["attendance", "summary"], queryFn: () => api<AttendanceSummary>("/attendance/summary") }).data;
  return (
    <Card className="lg:col-span-2">
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle>{t("dashboardTitle")}</CardTitle>
        {s && (
          <span className="text-sm">
            {t("rate")}: <strong>{pct(s.rate)}</strong>
          </span>
        )}
      </CardHeader>
      <CardContent className="grid gap-6 md:grid-cols-2">
        <div className="grid content-start gap-3 text-sm">
          {s?.classes.map((c) => (
            <Link key={c.id} href={`/classes/${c.id}`} className="grid gap-1 hover:opacity-80">
              <span className="flex justify-between gap-2">
                <span>{c.name}</span>
                <span className="text-muted-foreground">
                  {pct(c.rate)} · {t("held", { count: c.held })}
                  {c.cancelled > 0 && ` · ${t("cancelledCount", { count: c.cancelled })}`}
                </span>
              </span>
              <span className="h-2 overflow-hidden rounded-full bg-muted" role="presentation">
                <span className="block h-full rounded-full bg-gradient-to-l from-primary to-primary/70" style={{ width: `${Math.round((c.rate ?? 0) * 100)}%` }} />
              </span>
            </Link>
          ))}
        </div>
        {s && s.lowStudents.length > 0 && (
          <div className="grid content-start gap-2 text-sm">
            <p className="font-medium">{t("lowStudents")}</p>
            {s.lowStudents.map((st) => (
              <div key={st.id} className="flex justify-between gap-2">
                {office ? (
                  <Link href={`/students/${st.id}`} className="hover:underline">
                    {st.firstName} {st.lastName}
                  </Link>
                ) : (
                  <span>
                    {st.firstName} {st.lastName}
                  </span>
                )}
                <span className="text-destructive">{pct(st.rate)}</span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Figure({ label, value, danger }: { label: string; value?: string; danger?: boolean }) {
  return (
    <div className={cn("grid gap-1 rounded-xl bg-muted/60 p-3", danger && "bg-destructive/8")}>
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={cn("font-heading text-xl font-semibold tabular-nums", danger && "text-destructive")}>{value ?? "…"}</span>
    </div>
  );
}
