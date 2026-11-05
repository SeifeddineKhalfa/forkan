"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarX, CheckCheck, MessageCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { type CancelTarget, CancelSessionDialog } from "@/components/attendance/cancel-session-dialog";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import { useMe } from "@/lib/auth";
import { useFormat } from "@/lib/format";
import { ATTENDANCE_STATUSES, type AttendanceStatus, type SessionDetail } from "@/lib/types";
import { useErrorMessage } from "@/lib/use-error-message";
import { cn } from "@/lib/utils";
import { fillTemplate, sendWhatsApp, useSettings } from "@/lib/whatsapp";

const STYLE: Record<AttendanceStatus, string> = {
  PRESENT: "bg-success text-white border-success",
  ABSENT: "bg-destructive text-white border-destructive",
  LATE: "bg-warning text-black/80 border-warning",
  EXCUSED: "bg-info text-white border-info",
};

export default function SessionPage() {
  const { id } = useParams<{ id: string }>();
  const tc = useTranslations("common");
  const errorMessage = useErrorMessage();
  const session = useQuery({ queryKey: ["attendance", "session", id], queryFn: () => api<SessionDetail>(`/sessions/${id}`) });
  if (session.isError) return <p className="text-destructive">{errorMessage(session.error)}</p>;
  if (!session.data) return <p className="text-muted-foreground">{tc("loading")}</p>;
  // Re-mounts with fresh marks whenever the saved sheet changes.
  return <Sheet key={session.data.roster.map((s) => s.attendance?.markedAt ?? "").join()} session={session.data} />;
}

/** Everyone starts PRESENT; tap the absent ones; save. */
function Sheet({ session }: { session: SessionDetail }) {
  const t = useTranslations("attendance");
  const te = useTranslations("enums");
  const fmt = useFormat();
  const errorMessage = useErrorMessage();
  const router = useRouter();
  const qc = useQueryClient();
  const { data: me } = useMe();
  const settings = useSettings();
  const [marks, setMarks] = useState<Record<string, AttendanceStatus>>(() =>
    Object.fromEntries(session.roster.map((s) => [s.id, s.attendance?.status ?? "PRESENT"])),
  );
  const [notes, setNotes] = useState(session.notes ?? "");
  const [cancelling, setCancelling] = useState<CancelTarget | null>(null);
  const cancelled = session.status === "CANCELLED";
  const office = me?.role !== "TEACHER";

  const save = useMutation({
    mutationFn: () =>
      api<SessionDetail>(`/sessions/${session.id}/attendance`, {
        method: "PUT",
        body: { entries: session.roster.map((s) => ({ studentId: s.id, status: marks[s.id] })), notes: notes || undefined },
      }),
    onSuccess: (data) => {
      qc.setQueryData(["attendance", "session", session.id], data);
      void qc.invalidateQueries({ queryKey: ["attendance"] });
      toast.success(t("saved"));
      router.push("/attendance");
    },
  });
  const reopen = useMutation({
    mutationFn: () => api<SessionDetail>(`/sessions/${session.id}/reopen`, { method: "POST" }),
    onSuccess: (data) => {
      qc.setQueryData(["attendance", "session", session.id], data);
      void qc.invalidateQueries({ queryKey: ["attendance", "day"] });
    },
  });

  const counts = Object.fromEntries(ATTENDANCE_STATUSES.map((st) => [st, 0])) as Record<AttendanceStatus, number>;
  for (const st of Object.values(marks)) counts[st]++;

  const notify = (s: SessionDetail["roster"][number]) => {
    const phone = s.guardians?.[0]?.guardian.phone ?? s.phone;
    if (!phone) return;
    const body = fillTemplate(settings.data?.whatsappTemplates.ABSENCE ?? "", {
      studentName: `${s.firstName} ${s.lastName}`,
      className: session.class.name,
      date: fmt.date(session.date),
    });
    sendWhatsApp({ kind: "ABSENCE", phone, body, studentId: s.id, guardianId: s.guardians?.[0]?.guardian.id }).catch((e: unknown) =>
      toast.error(errorMessage(e)),
    );
  };

  return (
    <div className="mx-auto grid w-full max-w-2xl gap-4">
      <PageHeader
        backHref="/attendance"
        title={session.class.name}
        subtitle={
          <>
            {fmt.date(session.date)} · <span dir="ltr">{session.startTime}</span>
            {session.teacher && ` · ${[session.teacher.title, session.teacher.firstName, session.teacher.lastName].filter(Boolean).join(" ")}`}
          </>
        }
        actions={
          !cancelled && (
            <Button
              variant="outline"
              size="icon"
              aria-label={t("cancel")}
              title={t("cancel")}
              onClick={() =>
                setCancelling({
                  classId: session.classId,
                  className: session.class.name,
                  date: session.date.slice(0, 10),
                  startTime: session.startTime,
                  endTime: session.endTime,
                })
              }
            >
              <CalendarX />
            </Button>
          )
        }
      />

      {cancelled ? (
        <div className="grid gap-3 rounded-md border border-destructive/40 bg-destructive/5 p-4">
          <p className="text-destructive">{t("sessionCancelled", { reason: session.cancelReason ?? "" })}</p>
          <div>
            <Button variant="outline" disabled={reopen.isPending} onClick={() => reopen.mutate()}>{t("reopen")}</Button>
          </div>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm text-muted-foreground">{t("tapHint")}</p>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setMarks(Object.fromEntries(session.roster.map((s) => [s.id, "PRESENT" as const])))}
            >
              <CheckCheck /> {t("allPresent")}
            </Button>
          </div>

          {session.roster.length === 0 && <p className="rounded-md border p-4 text-sm text-muted-foreground">{t("emptyRoster")}</p>}
          <ul className="divide-y overflow-hidden rounded-xl border bg-card empty:hidden">
            {session.roster.map((s) => {
              const status = marks[s.id];
              return (
                <li key={s.id} className={cn("flex items-center gap-2 px-3 py-2 transition-colors", status === "ABSENT" && "bg-destructive/6")}>
                  <button
                    type="button"
                    className="flex min-h-11 min-w-0 flex-1 items-center gap-3 text-start text-base font-medium"
                    onClick={() => setMarks((m) => ({ ...m, [s.id]: m[s.id] === "PRESENT" ? "ABSENT" : "PRESENT" }))}
                  >
                    <span
                      className={cn(
                        "flex size-9 shrink-0 items-center justify-center rounded-full border-2 font-heading text-sm",
                        status === "PRESENT" ? "border-success/50 text-success" : STYLE[status],
                      )}
                      aria-hidden
                    >
                      {s.firstName.slice(0, 1)}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate">
                        {s.firstName} {s.lastName}
                      </span>
                      <span className={cn("block text-xs font-normal", status === "PRESENT" ? "text-muted-foreground" : "text-foreground")}>
                        {te(`attendanceStatus.${status}`)}
                      </span>
                    </span>
                  </button>
                  {office && status === "ABSENT" && (s.guardians?.[0] || s.phone) && (
                    <Button size="icon" variant="ghost" aria-label={t("sendAbsence")} title={t("sendAbsence")} onClick={() => notify(s)}>
                      <MessageCircle />
                    </Button>
                  )}
                  <div className="flex gap-1" role="radiogroup" aria-label={`${s.firstName} ${s.lastName}`}>
                    {ATTENDANCE_STATUSES.map((st) => (
                      <button
                        key={st}
                        type="button"
                        role="radio"
                        aria-checked={status === st}
                        aria-label={te(`attendanceStatus.${st}`)}
                        title={te(`attendanceStatus.${st}`)}
                        className={cn(
                          "size-10 rounded-lg border text-sm font-semibold transition-colors",
                          status === st ? STYLE[st] : "bg-background text-muted-foreground hover:bg-muted",
                        )}
                        onClick={() => setMarks((m) => ({ ...m, [s.id]: st }))}
                      >
                        {te(`attendanceShort.${st}`)}
                      </button>
                    ))}
                  </div>
                </li>
              );
            })}
          </ul>

          <details className="rounded-xl border bg-card p-3 text-sm">
            <summary className="cursor-pointer">{t("notes")}</summary>
            <Textarea className="mt-2" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </details>

          {/* Sticky, so it stays inside the content column and above the phone tab bar. */}
          <div className="sticky bottom-[4.75rem] z-10 rounded-xl border bg-card/95 p-3 shadow-lg backdrop-blur lg:bottom-4">
            <div className="flex items-center gap-3">
              <p className="sr-only">
                {t("summaryLine", { present: counts.PRESENT, absent: counts.ABSENT, late: counts.LATE, excused: counts.EXCUSED })}
              </p>
              <div className="flex flex-1 flex-wrap gap-1.5" aria-hidden>
                {ATTENDANCE_STATUSES.map((st) => (
                  <span
                    key={st}
                    className={cn("inline-flex h-8 min-w-8 items-center justify-center gap-1 rounded-lg border px-2 text-sm font-semibold", counts[st] ? STYLE[st] : "text-muted-foreground")}
                    title={te(`attendanceStatus.${st}`)}
                  >
                    {te(`attendanceShort.${st}`)} {counts[st]}
                  </span>
                ))}
              </div>
              <Button size="lg" disabled={save.isPending} onClick={() => save.mutate()}>
                {t("save")}
              </Button>
            </div>
            {save.isError && <p role="alert" className="mt-1 text-sm text-destructive">{errorMessage(save.error)}</p>}
          </div>
        </>
      )}

      <CancelSessionDialog target={cancelling} onClose={() => setCancelling(null)} />
    </div>
  );
}
