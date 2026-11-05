"use client";

import { Headphones, Pause, Play, Repeat, SkipBack, SkipForward } from "lucide-react";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { UnverifiedBanner } from "@/components/hifz/hifz-grid";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { type AyahRef, ayahRange, type EngineState, MuallimEngine, RECITERS, thumnRange } from "@/lib/muallim";
import { ofThumn, toThumn, useQuranMeta } from "@/lib/quran";
import type { QuranMeta } from "@/lib/types";
import { cn } from "@/lib/utils";

const REPEATS = [1, 2, 3, 5];
const GAPS = [
  { key: "pauseNone", value: 0 },
  { key: "pauseShort", value: 0.6 },
  { key: "pauseEqual", value: 1 },
  { key: "pauseLong", value: 1.5 },
] as const;

export default function MushafPage() {
  return (
    <Suspense fallback={<Skeleton className="h-96 rounded-2xl" />}>
      <Mushaf />
    </Suspense>
  );
}

function Mushaf() {
  const t = useTranslations("mushaf");
  const meta = useQuranMeta();
  return (
    <div className="grid gap-6">
      <PageHeader title={t("title")} subtitle={t("subtitle")} />
      <UnverifiedBanner verified={meta.data?.verified} />
      {meta.data ? <Studio meta={meta.data} /> : <Skeleton className="h-96 rounded-2xl" />}
      <p className="text-xs text-muted-foreground">{t("credit")}</p>
    </div>
  );
}

const clampInt = (v: string | null, min: number, max: number, fallback: number) => {
  const n = Number(v);
  return Number.isInteger(n) && n >= min && n <= max ? n : fallback;
};

/** Range and listening settings, then the player. Links may preset the range (?surah=&from=&to= or ?thumn=&to=). */
function Studio({ meta }: { meta: QuranMeta }) {
  const t = useTranslations("mushaf");
  const params = useSearchParams();
  const [mode, setMode] = useState<"surah" | "thumn">(params.has("thumn") ? "thumn" : "surah");
  const [surah, setSurah] = useState(() => clampInt(params.get("surah"), 1, 114, 1));
  const count = meta.surahs[surah - 1].ayahCount;
  const [fromAyah, setFromAyah] = useState(() => clampInt(params.get("from"), 1, 286, 1));
  const [toAyah, setToAyah] = useState(() => clampInt(params.get("to"), 1, 286, 0));
  const [fromThumn, setFromThumn] = useState(() => clampInt(params.get("thumn"), 1, 480, 1));
  const [toThumnN, setToThumn] = useState(() => clampInt(params.get("to"), 1, 480, clampInt(params.get("thumn"), 1, 480, 1)));
  const [read, setRead] = useState(RECITERS[0].read);
  const [repeat, setRepeat] = useState(3);
  const [gap, setGap] = useState(1);
  const [loop, setLoop] = useState(false);

  const from = Math.min(fromAyah, count);
  const to = toAyah ? Math.max(from, Math.min(toAyah, count)) : count;
  const lastThumn = Math.max(fromThumn, toThumnN);
  const queue = useMemo<AyahRef[]>(
    () => (mode === "surah" ? ayahRange(meta, { surah, ayah: from }, { surah, ayah: to }) : thumnRange(meta, fromThumn, lastThumn)),
    [meta, mode, surah, from, to, fromThumn, lastThumn],
  );

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <Player meta={meta} queue={queue} read={read} repeat={repeat} gap={gap} loop={loop} />

      <Card className="lg:order-first">
        <CardHeader>
          <CardTitle>{t("settings")}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-5">
          <Labeled label={t("reciter")}>
            <Select value={String(read)} onValueChange={(v) => setRead(Number(v))}>
              <SelectTrigger className="w-full" aria-label={t("reciter")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RECITERS.map((r) => (
                  <SelectItem key={r.read} value={String(r.read)}>{r.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Labeled>

          <Tabs value={mode} onValueChange={(v) => setMode(v as "surah" | "thumn")}>
            <TabsList className="w-full">
              <TabsTrigger value="surah">{t("bySurah")}</TabsTrigger>
              <TabsTrigger value="thumn">{t("byThumn")}</TabsTrigger>
            </TabsList>
          </Tabs>

          {mode === "surah" ? (
            <div className="grid grid-cols-2 gap-3">
              <Labeled label={t("surah")} className="col-span-2">
                <Select
                  value={String(surah)}
                  onValueChange={(v) => {
                    setSurah(Number(v));
                    setFromAyah(1);
                    setToAyah(0);
                  }}
                >
                  <SelectTrigger className="w-full" aria-label={t("surah")}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="max-h-80">
                    {meta.surahs.map((s) => (
                      <SelectItem key={s.id} value={String(s.id)}>
                        {s.id}. {s.nameAr}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Labeled>
              <Labeled label={t("fromAyah")}>
                <Input type="number" inputMode="numeric" min={1} max={count} value={from} onChange={(e) => setFromAyah(clampInt(e.target.value, 1, count, 1))} />
              </Labeled>
              <Labeled label={t("toAyah")}>
                <Input type="number" inputMode="numeric" min={from} max={count} value={to} onChange={(e) => setToAyah(clampInt(e.target.value, 1, count, count))} />
              </Labeled>
            </div>
          ) : (
            <div className="grid gap-3">
              <ThumnPicker label={t("from")} value={fromThumn} onChange={setFromThumn} />
              <ThumnPicker label={t("to")} value={lastThumn} onChange={setToThumn} min={fromThumn} />
            </div>
          )}

          <Labeled label={t("repeat")}>
            <Segmented options={REPEATS.map((n) => ({ value: n, label: `×${n}` }))} value={repeat} onChange={setRepeat} />
          </Labeled>
          <Labeled label={t("pause")}>
            <Segmented options={GAPS.map((g) => ({ value: g.value, label: t(g.key) }))} value={gap} onChange={setGap} />
          </Labeled>
          <label className="flex items-center justify-between gap-2 text-sm">
            {t("loop")}
            <Switch checked={loop} onCheckedChange={setLoop} />
          </label>
        </CardContent>
      </Card>
    </div>
  );
}

function Player({ meta, queue, read, repeat, gap, loop }: { meta: QuranMeta; queue: AyahRef[]; read: number; repeat: number; gap: number; loop: boolean }) {
  const t = useTranslations("mushaf");
  const [state, setState] = useState<EngineState>({ index: 0, rep: 1, phase: "idle", echoMs: 0, echoId: 0 });
  const engine = useRef<MuallimEngine | null>(null);
  const reciter = RECITERS.find((r) => r.read === read)!;

  useEffect(() => {
    const e = new MuallimEngine({ queue, reciter, repeat, gap, loop }, setState);
    engine.current = e;
    return () => e.destroy();
    // The engine lives for the page; option changes go through configure() below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    engine.current?.configure({ queue, reciter, repeat, gap, loop });
  }, [queue, reciter, repeat, gap, loop]);

  const current = queue[Math.min(state.index, queue.length - 1)];
  const active = state.phase === "playing" || state.phase === "echo" || state.phase === "loading";
  const surahName = current ? meta.surahs[current.surah - 1].nameAr : "";
  const thumn = current && thumnOf(meta, current);

  return (
    <Card className="overflow-hidden p-0 lg:sticky lg:top-20">
      <div className="relative grid gap-4 bg-sidebar px-5 py-6 text-center text-sidebar-foreground girih-overlay dark:bg-secondary">
        <p className="text-sm text-sidebar-primary">
          {thumn && `${t("hizb")} ${thumn.hizb} · ${t("thumn")} ${thumn.thumn}`}
        </p>
        <h2 className="font-heading text-3xl font-bold text-sidebar-accent-foreground md:text-4xl">{surahName}</h2>
        <p className="font-heading text-xl text-sidebar-accent-foreground">
          {current && (
            <>
              <span className="inline-flex size-12 items-center justify-center rounded-full border-2 border-sidebar-primary text-sidebar-primary">
                {current.ayah}
              </span>
            </>
          )}
        </p>
        <div className="min-h-12" aria-live="polite">
          {state.phase === "echo" ? (
            <div className="mx-auto grid max-w-xs gap-2">
              <p className="font-heading text-xl font-semibold text-sidebar-primary">{t("repeatNow")}</p>
              <span className="h-1.5 overflow-hidden rounded-full bg-sidebar-accent">
                <span key={state.echoId} className="block h-full origin-right rounded-full bg-sidebar-primary" style={{ animation: `muallim-echo ${state.echoMs}ms linear forwards` }} />
              </span>
            </div>
          ) : state.phase === "playing" ? (
            <p className="flex items-center justify-center gap-2 text-sidebar-foreground/80">
              <Headphones className="size-4" /> {t("listen")} · {t("repCount", { rep: state.rep, total: repeat })}
            </p>
          ) : state.phase === "done" ? (
            <p className="text-sidebar-primary">{t("done")}</p>
          ) : state.phase === "error" ? (
            <p className="text-sm text-destructive">{t("error")}</p>
          ) : (
            <p className="text-sm text-sidebar-foreground/60">{t("range", { count: queue.length })}</p>
          )}
        </div>
        <div className="flex items-center justify-center gap-3">
          {/* RTL: "previous" sits on the right. */}
          <RoundButton label={t("prev")} disabled={state.index === 0} onClick={() => engine.current?.jump(state.index - 1)}>
            <SkipForward className="size-5" />
          </RoundButton>
          <button
            type="button"
            aria-label={active ? t("stop") : t("play")}
            onClick={() => (active ? engine.current?.pause() : engine.current?.play(state.phase === "done" ? 0 : state.index))}
            className="flex size-16 items-center justify-center rounded-full bg-sidebar-primary text-sidebar-primary-foreground shadow-lg transition hover:brightness-105 active:scale-95"
          >
            {active ? <Pause className="size-7" /> : <Play className="size-7 -scale-x-100" />}
          </button>
          <RoundButton label={t("next")} disabled={state.index >= queue.length - 1} onClick={() => engine.current?.jump(state.index + 1)}>
            <SkipBack className="size-5" />
          </RoundButton>
        </div>
      </div>

      <div className="grid gap-2 p-4">
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Repeat className="size-3.5" /> {t("range", { count: queue.length })}
        </p>
        <div className="flex max-h-56 flex-wrap gap-1.5 overflow-y-auto">
          {queue.map((a, i) => (
            <button
              key={`${a.surah}:${a.ayah}`}
              type="button"
              onClick={() => engine.current?.jump(i)}
              title={`${meta.surahs[a.surah - 1].nameAr} ${a.ayah}`}
              className={cn(
                "h-9 min-w-9 rounded-lg border px-1.5 text-sm tabular-nums transition-colors",
                i === state.index ? "border-primary bg-primary text-primary-foreground" : i < state.index ? "bg-secondary text-secondary-foreground" : "bg-card hover:border-primary/40",
                a.ayah === 1 && i > 0 && "ms-2",
              )}
            >
              {a.ayah}
            </button>
          ))}
        </div>
      </div>
    </Card>
  );
}

function RoundButton({ label, disabled, onClick, children }: { label: string; disabled?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="flex size-12 items-center justify-center rounded-full bg-sidebar-accent text-sidebar-accent-foreground ring-1 ring-sidebar-border transition hover:bg-sidebar-accent/70 disabled:opacity-35"
    >
      {children}
    </button>
  );
}

/** The thumn an ayah falls in: the last thumn starting at or before it. */
function thumnOf(meta: QuranMeta, a: AyahRef) {
  let lo = 0;
  let hi = meta.athman.length - 1;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    const s = meta.athman[mid];
    if (s.startSurah < a.surah || (s.startSurah === a.surah && s.startAyah <= a.ayah)) lo = mid;
    else hi = mid - 1;
  }
  return ofThumn(meta.athman[lo].number);
}

function ThumnPicker({ label, value, onChange, min = 1 }: { label: string; value: number; onChange: (n: number) => void; min?: number }) {
  const t = useTranslations("mushaf");
  const { hizb, thumn } = ofThumn(value);
  const minHizb = ofThumn(min).hizb;
  return (
    <Labeled label={label}>
      <div className="grid grid-cols-2 gap-2">
        <Select value={String(hizb)} onValueChange={(v) => onChange(Math.max(min, toThumn(Number(v), thumn)))}>
          <SelectTrigger className="w-full" aria-label={`${label} — ${t("hizb")}`}>
            <span className="text-muted-foreground">{t("hizb")}</span> <SelectValue />
          </SelectTrigger>
          <SelectContent className="max-h-80">
            {Array.from({ length: 60 - minHizb + 1 }, (_, i) => minHizb + i).map((h) => (
              <SelectItem key={h} value={String(h)}>{h}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={String(thumn)} onValueChange={(v) => onChange(Math.max(min, toThumn(hizb, Number(v))))}>
          <SelectTrigger className="w-full" aria-label={`${label} — ${t("thumn")}`}>
            <span className="text-muted-foreground">{t("thumn")}</span> <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Array.from({ length: 8 }, (_, i) => i + 1).map((n) => (
              <SelectItem key={n} value={String(n)} disabled={toThumn(hizb, n) < min}>{n}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </Labeled>
  );
}

function Segmented<T extends number>({ options, value, onChange }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="grid auto-cols-fr grid-flow-col gap-1 rounded-lg bg-muted p-1" role="radiogroup">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn("h-8 rounded-md px-2 text-sm transition-colors", value === o.value ? "bg-card font-semibold text-primary shadow-sm" : "text-muted-foreground hover:text-foreground")}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Labeled({ label, className, children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={cn("grid gap-1.5", className)}>
      <span className="text-sm font-medium">{label}</span>
      {children}
    </div>
  );
}
