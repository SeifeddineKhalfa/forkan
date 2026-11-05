import { Clock, MapPin } from "lucide-react";
import type { Metadata } from "next";
import { getSchedule, getSite, type PublicClass, waNumber } from "@/lib/public-api";
import { enumT, siteT } from "@/lib/site-text";
import type { Day } from "@/lib/types";

export const metadata: Metadata = { title: siteT("scheduleTitle"), description: siteT("scheduleIntro") };

const DAYS: Day[] = ["SATURDAY", "SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"];

const teacherName = (t: PublicClass["teachers"][number]["teacher"]) => [t.title, t.firstName, t.lastName].filter(Boolean).join(" ");
/** Prayer-based label, else the hours kept left-to-right inside Arabic text. */
const time = (s: PublicClass["scheduleSlots"][number]) =>
  s.timeLabel ?? (
    <bdi dir="ltr">
      {s.startTime}–{s.endTime}
    </bdi>
  );

/** The weekly imla' schedule as already announced on Facebook (no student data). */
export default async function SchedulePage() {
  const [classes, site] = await Promise.all([getSchedule(), getSite()]);
  const byDay = DAYS.map((day) => ({
    day,
    items: classes
      .flatMap((c) => c.scheduleSlots.filter((s) => s.day === day).map((slot) => ({ c, slot })))
      .sort((a, b) => a.slot.startTime.localeCompare(b.slot.startTime)),
  })).filter((d) => d.items.length);

  return (
    <div className="grid gap-8">
      <header className="grid gap-2">
        <h1 className="text-3xl font-bold">{siteT("scheduleTitle")}</h1>
        <p className="text-muted-foreground">{siteT("scheduleIntro")}</p>
        {site.whatsappPhone && (
          <a href={`https://wa.me/${waNumber(site.whatsappPhone)}`} target="_blank" rel="noopener" className="text-sm text-primary hover:underline">
            {siteT("registerInterest")}
          </a>
        )}
      </header>

      {classes.length === 0 && <p className="text-muted-foreground">{siteT("noSchedule")}</p>}

      {byDay.length > 0 && (
        <section className="grid gap-4">
          <h2 className="text-xl font-semibold">{siteT("byDay")}</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {byDay.map(({ day, items }) => (
              <div key={day} className="overflow-hidden rounded-2xl border bg-card">
                <h3 className="border-b bg-secondary/60 px-5 py-3 font-heading text-lg font-semibold text-secondary-foreground">{enumT(`day.${day}`)}</h3>
                <ul className="grid gap-3 p-5 text-sm">
                  {items.map(({ c, slot }) => (
                    <li key={`${c.id}-${slot.startTime}`} className="grid gap-0.5 border-s-2 border-gold ps-3">
                      <span className="font-medium">{c.name}</span>
                      <span className="text-muted-foreground">
                        {time(slot)} · {enumT(`slotKind.${slot.kind}`)}
                        {c.venue && ` · ${c.venue.name}`}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      )}

      {classes.length > 0 && (
        <section className="grid gap-4">
          <h2 className="text-xl font-semibold">{siteT("byClass")}</h2>
          <div className="grid gap-4 md:grid-cols-2">
            {classes.map((c) => (
              <div key={c.id} className="grid content-start gap-3 rounded-2xl border bg-card p-5 transition hover:border-primary/30">
                <div className="grid gap-1">
                  <h3 className="font-heading text-lg font-semibold text-primary">{c.name}</h3>
                  <p className="flex flex-wrap gap-2 text-xs">
                    <span className="rounded-full bg-secondary px-2.5 py-0.5 text-secondary-foreground">{enumT(`audience.${c.audience}`)}</span>
                    <span className="rounded-full bg-accent px-2.5 py-0.5 text-accent-foreground">{enumT(`genderPolicy.${c.genderPolicy}`)}</span>
                  </p>
                </div>
                {c.quranScope && (
                  <p className="text-sm">
                    <span className="text-muted-foreground">{siteT("scope")}: </span>
                    {c.quranScope}
                  </p>
                )}
                <ul className="grid gap-1 text-sm">
                  {c.scheduleSlots.map((s) => (
                    <li key={`${s.day}-${s.startTime}`} className="flex items-center gap-2">
                      <Clock className="size-4 text-muted-foreground" />
                      {enumT(`day.${s.day}`)} · {time(s)} · {enumT(`slotKind.${s.kind}`)}
                    </li>
                  ))}
                </ul>
                {c.venue && (
                  <p className="flex items-center gap-2 text-sm">
                    <MapPin className="size-4 text-muted-foreground" />
                    {c.venue.name} – {c.venue.room}
                  </p>
                )}
                {c.teachers.length > 0 && (
                  <p className="text-sm">
                    {c.teachers
                      .map((t) => (t.role === "SUPERVISOR" ? `${siteT("supervisor")}: ${teacherName(t.teacher)}` : teacherName(t.teacher)))
                      .join(" · ")}
                  </p>
                )}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
