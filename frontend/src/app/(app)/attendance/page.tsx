"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { CalendarX, ChevronLeft, ChevronRight, Clock, MapPin, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { type CancelTarget, CancelSessionDialog } from "@/components/attendance/cancel-session-dialog";
import { Field } from "@/components/form/field";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { useFormat } from "@/lib/format";
import type { DayItem, DayView, SessionDetail } from "@/lib/types";
import { useErrorMessage } from "@/lib/use-error-message";
import { cn } from "@/lib/utils";

/** Today in Tunis as "YYYY-MM-DD". */
const tunisToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Tunis" }).format(new Date());
const shift = (day: string, days: number) => new Date(Date.parse(`${day}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

/** The teacher's phone screen: today's sessions, one tap to mark. */
export default function AttendancePage() {
  const t = useTranslations("attendance");
  const te = useTranslations("enums");
  const fmt = useFormat();
  const errorMessage = useErrorMessage();
  const router = useRouter();
  const [date, setDate] = useState(tunisToday);
  const [cancelling, setCancelling] = useState<CancelTarget | null>(null);
  const [adHoc, setAdHoc] = useState(false);
  const today = tunisToday();

  const day = useQuery({ queryKey: ["attendance", "day", date], queryFn: () => api<DayView>(`/attendance/day?date=${date}`) });
  const open = useMutation({
    mutationFn: (body: { classId: string; startTime: string; endTime?: string }) =>
      api<SessionDetail>("/sessions/open", { method: "POST", body: { ...body, date } }),
    onSuccess: (s) => router.push(`/attendance/${s.id}`),
  });

  const go = (item: DayItem) => {
    if (item.session) router.push(`/attendance/${item.session.id}`);
    else open.mutate({ classId: item.class.id, startTime: item.startTime, endTime: item.slot?.endTime });
  };

  return (
    <div className="mx-auto grid w-full max-w-2xl gap-4">
      <PageHeader title={t("title")} />
      <div className="flex items-center gap-2">
        {/* RTL: "previous" points right. */}
        <Button size="icon" variant="outline" aria-label={t("previousDay")} onClick={() => setDate(shift(date, -1))}>
          <ChevronRight />
        </Button>
        <Input type="date" className="flex-1" value={date} max={today} onChange={(e) => e.target.value && setDate(e.target.value)} />
        <Button size="icon" variant="outline" aria-label={t("nextDay")} onClick={() => setDate(shift(date, 1))}>
          <ChevronLeft />
        </Button>
        {date !== today && (
          <Button variant="ghost" onClick={() => setDate(today)}>
            {t("today")}
          </Button>
        )}
      </div>
      <WeekStrip date={date} today={today} onPick={setDate} />
      {day.data && (
        <p className="text-sm text-muted-foreground">
          {te(`day.${day.data.weekday}`)} · {fmt.date(day.data.date)}
        </p>
      )}

      {day.isError && <p className="text-destructive">{errorMessage(day.error)}</p>}
      {open.isError && <p role="alert" className="text-destructive">{errorMessage(open.error)}</p>}
      {day.isPending && (
        <>
          <Skeleton className="h-36 rounded-xl" />
          <Skeleton className="h-36 rounded-xl" />
        </>
      )}
      {day.data?.items.length === 0 && <p className="rounded-xl border border-dashed py-8 text-center text-muted-foreground">{t("noSessions")}</p>}

      {day.data?.items.map((item) => {
        const s = item.session;
        const cancelled = s?.status === "CANCELLED";
        const marked = s?.counts && Object.values(s.counts).some(Boolean);
        return (
          <Card key={`${item.class.id}-${item.startTime}`} className={cancelled ? "opacity-70" : undefined}>
            <CardContent className="grid gap-3">
              <button
                type="button"
                className="grid gap-1 text-start disabled:cursor-not-allowed"
                disabled={cancelled || date > today || open.isPending}
                onClick={() => go(item)}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="font-heading text-lg font-semibold">{item.class.name}</span>
                  {!item.slot && <Badge variant="outline">{t("adHoc")}</Badge>}
                </span>
                <span className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Clock className="size-4" />
                    {item.slot?.timeLabel ?? <span dir="ltr">{item.startTime}</span>}
                  </span>
                  {item.class.room && (
                    <span className="flex items-center gap-1">
                      <MapPin className="size-4" />
                      {item.class.room.venue.name} – {item.class.room.name}
                    </span>
                  )}
                  <span>{t("students", { count: item.class.students })}</span>
                </span>
                <span className="text-sm">
                  {cancelled ? (
                    <span className="text-destructive">{t("cancelled", { reason: s.cancelReason ?? "" })}</span>
                  ) : marked ? (
                    <span className="text-primary">{t("marked", { present: s.counts!.PRESENT + s.counts!.LATE, absent: s.counts!.ABSENT })}</span>
                  ) : (
                    <span className="text-muted-foreground">{t("notOpened")}</span>
                  )}
                </span>
              </button>
              <div className="flex gap-2">
                {!cancelled && date <= today && (
                  <Button className="flex-1" size="lg" disabled={open.isPending} onClick={() => go(item)}>
                    {marked ? t("edit") : t("open")}
                  </Button>
                )}
                {!cancelled && (
                  <Button
                    size="lg"
                    variant="outline"
                    aria-label={t("cancel")}
                    title={t("cancel")}
                    onClick={() =>
                      setCancelling({ classId: item.class.id, className: item.class.name, date, startTime: item.startTime, endTime: item.slot?.endTime })
                    }
                  >
                    <CalendarX />
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })}

      {day.data && day.data.classes.length > 0 && date <= today && (
        <Button variant="outline" onClick={() => setAdHoc(true)}>
          <Plus /> {t("addAdHoc")}
        </Button>
      )}

      <CancelSessionDialog target={cancelling} onClose={() => setCancelling(null)} />
      <AdHocDialog
        open={adHoc}
        onOpenChange={setAdHoc}
        classes={day.data?.classes ?? []}
        pending={open.isPending}
        onConfirm={(classId, startTime) => open.mutate({ classId, startTime })}
      />
    </div>
  );
}

const weekdayFmt = new Intl.DateTimeFormat("ar-TN", { weekday: "short", timeZone: "UTC" });

/** The Saturday-to-Friday school week around `date`, one tap per day. */
function WeekStrip({ date, today, onPick }: { date: string; today: string; onPick: (d: string) => void }) {
  const sinceSaturday = (new Date(`${date}T00:00:00Z`).getUTCDay() + 1) % 7;
  const days = Array.from({ length: 7 }, (_, i) => shift(date, i - sinceSaturday));
  return (
    <div className="grid grid-cols-7 gap-1.5" role="group">
      {days.map((d) => {
        const selected = d === date;
        return (
          <button
            key={d}
            type="button"
            disabled={d > today}
            aria-pressed={selected}
            onClick={() => onPick(d)}
            className={cn(
              "grid h-14 place-content-center gap-0.5 rounded-xl border text-center transition-colors disabled:opacity-35",
              selected ? "border-primary bg-primary text-primary-foreground shadow-sm" : "bg-card hover:border-primary/40",
              !selected && d === today && "border-gold ring-1 ring-gold/60",
            )}
          >
            <span className="text-[0.7rem] leading-none opacity-80">{weekdayFmt.format(new Date(`${d}T00:00:00Z`))}</span>
            <span className="font-heading text-lg leading-none font-semibold">{Number(d.slice(8))}</span>
          </button>
        );
      })}
    </div>
  );
}

function AdHocDialog({
  open,
  onOpenChange,
  classes,
  pending,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  classes: { id: string; name: string }[];
  pending: boolean;
  onConfirm: (classId: string, startTime: string) => void;
}) {
  const t = useTranslations("attendance");
  const tc = useTranslations("common");
  const [classId, setClassId] = useState("");
  const [startTime, setStartTime] = useState("");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("addAdHoc")}</DialogTitle>
        </DialogHeader>
        <Field label={t("class")}>
          <Select value={classId || undefined} onValueChange={setClassId}>
            <SelectTrigger className="w-full" aria-label={t("class")}>
              <SelectValue placeholder={t("class")} />
            </SelectTrigger>
            <SelectContent>
              {classes.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label={t("startTime")} htmlFor="adhoc-time">
          <Input id="adhoc-time" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
        </Field>
        <DialogFooter>
          <Button disabled={!classId || !startTime || pending} onClick={() => onConfirm(classId, startTime)}>
            {tc("confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
