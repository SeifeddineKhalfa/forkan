"use client";

import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/lib/api";
import { useFormat } from "@/lib/format";
import type { AttendanceStatus, ClassAttendance, StudentAttendance } from "@/lib/types";
import { cn } from "@/lib/utils";

export const pct = (rate: number | null) => (rate === null ? "—" : `${Math.round(rate * 100)}%`);

const CELL: Record<AttendanceStatus, string> = {
  PRESENT: "text-success",
  ABSENT: "bg-destructive/10 text-destructive font-semibold",
  LATE: "text-accent-foreground",
  EXCUSED: "text-info",
};

const shortDate = (iso: string) => `${Number(iso.slice(8, 10))}/${Number(iso.slice(5, 7))}`;

/** Students × sessions grid, last 30 days. */
export function ClassAttendanceCard({ classId, linkStudents }: { classId: string; linkStudents: boolean }) {
  const t = useTranslations("attendance");
  const te = useTranslations("enums");
  const history = useQuery({
    queryKey: ["attendance", "class", classId],
    queryFn: () => api<ClassAttendance>(`/classes/${classId}/attendance`),
  });
  const h = history.data;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle>
          {t("history")} <span className="text-sm font-normal text-muted-foreground">{t("last30")}</span>
        </CardTitle>
        {h && (
          <span className="text-sm">
            {t("rate")}: <strong>{pct(h.rate)}</strong>
          </span>
        )}
      </CardHeader>
      <CardContent className="overflow-x-auto">
        {h?.sessions.length === 0 && <p className="text-sm text-muted-foreground">{t("noHistory")}</p>}
        {h && h.sessions.length > 0 && (
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b">
                <th className="sticky start-0 bg-card py-1 pe-3 text-start font-medium">{""}</th>
                {h.sessions.map((s) => (
                  <th
                    key={s.id}
                    className={cn("px-1 py-1 text-center text-xs font-normal", s.status === "CANCELLED" && "text-muted-foreground line-through")}
                    title={s.cancelReason ?? s.startTime}
                  >
                    <span dir="ltr">{shortDate(s.date)}</span>
                  </th>
                ))}
                <th className="px-2 text-center text-xs font-medium">{t("rate")}</th>
              </tr>
            </thead>
            <tbody>
              {h.students.map((st) => (
                <tr key={st.id} className="border-b last:border-0">
                  <td className="sticky start-0 whitespace-nowrap bg-card py-1 pe-3">
                    {linkStudents ? (
                      <Link href={`/students/${st.id}`} className="hover:underline">
                        {st.firstName} {st.lastName}
                      </Link>
                    ) : (
                      `${st.firstName} ${st.lastName}`
                    )}
                  </td>
                  {h.sessions.map((s) => {
                    const status = s.attendance[st.id];
                    return (
                      <td key={s.id} className={cn("px-1 text-center", status && CELL[status])} title={status && te(`attendanceStatus.${status}`)}>
                        {s.status === "CANCELLED" ? "·" : status ? te(`attendanceShort.${status}`) : ""}
                      </td>
                    );
                  })}
                  <td className={cn("px-2 text-center font-medium", st.rate !== null && st.rate < 0.75 && "text-destructive")}>{pct(st.rate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
}

/** A student's marks over the last 90 days (office). */
export function StudentAttendanceCard({ studentId }: { studentId: string }) {
  const t = useTranslations("attendance");
  const te = useTranslations("enums");
  const tc = useTranslations("common");
  const fmt = useFormat();
  const history = useQuery({
    queryKey: ["attendance", "student", studentId],
    queryFn: () => api<StudentAttendance>(`/students/${studentId}/attendance`),
  });
  const h = history.data;
  if (!h) return <p className="text-muted-foreground">{tc("loading")}</p>;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle>{t("history")}</CardTitle>
        <span className="text-sm">
          {t("rate")}: <strong>{pct(h.rate)}</strong> ·{" "}
          {t("summaryLine", { present: h.counts.PRESENT, absent: h.counts.ABSENT, late: h.counts.LATE, excused: h.counts.EXCUSED })}
        </span>
      </CardHeader>
      <CardContent className="grid gap-1 text-sm">
        {h.records.length === 0 && <p className="text-muted-foreground">{t("noHistory")}</p>}
        {h.records.map((r) => (
          <div key={r.session.id} className="flex items-center justify-between gap-2 border-b py-1.5 last:border-0">
            <span>
              {fmt.date(r.session.date)} ·{" "}
              <Link href={`/classes/${r.session.class.id}`} className="hover:underline">
                {r.session.class.name}
              </Link>
              {r.note && <span className="text-muted-foreground"> — {r.note}</span>}
            </span>
            <span className={cn("rounded px-2", CELL[r.status])}>{te(`attendanceStatus.${r.status}`)}</span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
