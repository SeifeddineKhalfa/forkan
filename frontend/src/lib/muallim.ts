/**
 * «المصحف المعلّم» engine: plays one ayah at a time from a full-surah recitation,
 * pauses for the student to repeat it, repeats it, then moves on.
 *
 * Audio and per-ayah timings are streamed from mp3quran.net (not self-hosted:
 * no redistribution licence). Their Qalun timings use Qalun ayah numbering — all
 * 114 surahs match our reference data (6214 ayahs), checked on 2026-11-05.
 */
import type { QuranMeta } from "./types";

export interface Reciter {
  /** mp3quran "read" id (has ayah timings). */
  read: number;
  name: string;
  server: string;
}

export const RECITERS: Reciter[] = [
  { read: 270, name: "محمود خليل الحصري", server: "https://cdn.mp3quran.net/audio/mahmoud-husary/r5/" },
  { read: 75, name: "علي بن عبد الرحمن الحذيفي", server: "https://cdn.mp3quran.net/audio/ali-hudhaifi/r2/" },
  { read: 208, name: "الدوكالي محمد العالم", server: "https://cdn.mp3quran.net/audio/dokali-alim/r1/" },
];

export interface AyahRef {
  surah: number;
  ayah: number;
}
interface Segment {
  ayah: number;
  start_time: number;
  end_time: number;
}

/** Every ayah from `from` to `to` inclusive, crossing surahs as needed. */
export function ayahRange(meta: QuranMeta, from: AyahRef, to: AyahRef): AyahRef[] {
  const out: AyahRef[] = [];
  for (let s = from.surah; s <= to.surah; s++) {
    const count = meta.surahs[s - 1].ayahCount;
    const first = s === from.surah ? from.ayah : 1;
    const last = s === to.surah ? Math.min(to.ayah, count) : count;
    for (let a = first; a <= last; a++) out.push({ surah: s, ayah: a });
  }
  return out;
}

/** The ayahs of athman `first`..`last` (1..480). */
export function thumnRange(meta: QuranMeta, first: number, last: number): AyahRef[] {
  const start = meta.athman[first - 1];
  const next = meta.athman[last];
  let end: AyahRef;
  if (!next) end = { surah: 114, ayah: meta.surahs[113].ayahCount };
  else if (next.startAyah > 1) end = { surah: next.startSurah, ayah: next.startAyah - 1 };
  else end = { surah: next.startSurah - 1, ayah: meta.surahs[next.startSurah - 2].ayahCount };
  return ayahRange(meta, { surah: start.startSurah, ayah: start.startAyah }, end);
}

export type Phase = "idle" | "loading" | "playing" | "echo" | "paused" | "done" | "error";

export interface EngineState {
  index: number;
  rep: number;
  phase: Phase;
  /** While echoing: how long the pause lasts, for the countdown bar. */
  echoMs: number;
  /** Changes on every pause so the UI can restart its countdown animation. */
  echoId: number;
}

export interface EngineOptions {
  queue: AyahRef[];
  reciter: Reciter;
  /** Times each ayah is heard. */
  repeat: number;
  /** Pause after each ayah, as a multiple of its length (0 = continuous). */
  gap: number;
  loop: boolean;
}

const pad = (n: number) => String(n).padStart(3, "0");

export class MuallimEngine {
  private audio: HTMLAudioElement;
  private timings = new Map<string, Promise<Segment[]>>();
  private raf = 0;
  private onTime: (() => void) | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;
  /** Bumped on every user action, so stale async steps stop. */
  private gen = 0;
  state: EngineState = { index: 0, rep: 1, phase: "idle", echoMs: 0, echoId: 0 };

  constructor(
    private opts: EngineOptions,
    private onChange: (s: EngineState) => void,
  ) {
    this.audio = new Audio();
    this.audio.preload = "auto";
    this.audio.onerror = () => this.set({ phase: "error" });
  }

  configure(opts: EngineOptions) {
    const reset = opts.reciter.read !== this.opts.reciter.read || opts.queue !== this.opts.queue;
    this.opts = opts;
    if (reset) this.stop({ index: 0, rep: 1, phase: "idle" });
  }

  play(index = this.state.index) {
    this.halt();
    const rep = index === this.state.index ? this.state.rep : 1;
    void this.step(++this.gen, index, rep);
  }

  pause() {
    this.halt();
    this.set({ phase: "paused" });
  }

  /** Jump to an ayah of the queue (keeps playing if it was). */
  jump(index: number) {
    const active = this.state.phase === "playing" || this.state.phase === "echo" || this.state.phase === "loading";
    this.halt();
    this.set({ index: Math.max(0, Math.min(index, this.opts.queue.length - 1)), rep: 1, phase: active ? "loading" : "paused" });
    if (active) void this.step(++this.gen, this.state.index, 1);
  }

  destroy() {
    this.halt();
    this.audio.removeAttribute("src");
    this.audio.load();
  }

  private stop(patch: Partial<EngineState>) {
    this.halt();
    this.set(patch);
  }

  private halt() {
    this.gen++;
    cancelAnimationFrame(this.raf);
    if (this.onTime) this.audio.removeEventListener("timeupdate", this.onTime);
    this.onTime = null;
    clearTimeout(this.timer);
    this.audio.pause();
  }

  private set(patch: Partial<EngineState>) {
    this.state = { ...this.state, ...patch };
    this.onChange(this.state);
  }

  private segments(surah: number): Promise<Segment[]> {
    const key = `${this.opts.reciter.read}:${surah}`;
    let p = this.timings.get(key);
    if (!p) {
      p = fetch(`https://www.mp3quran.net/api/v3/ayat_timing?surah=${surah}&read=${this.opts.reciter.read}`).then((r) => {
        if (!r.ok) throw new Error(`timing ${r.status}`);
        return r.json() as Promise<Segment[]>;
      });
      p.catch(() => this.timings.delete(key));
      this.timings.set(key, p);
    }
    return p;
  }

  private async step(gen: number, index: number, rep: number) {
    const { queue, reciter } = this.opts;
    const item = queue[index];
    if (!item) return;
    this.set({ index, rep, phase: "loading" });
    try {
      const seg = (await this.segments(item.surah))[item.ayah - 1];
      if (gen !== this.gen) return;
      const src = `${reciter.server}${pad(item.surah)}.mp3`;
      if (this.audio.src !== src) {
        this.audio.src = src;
        await new Promise<void>((ok, ko) => {
          this.audio.addEventListener("loadedmetadata", () => ok(), { once: true });
          this.audio.addEventListener("error", () => ko(new Error("audio")), { once: true });
        });
        if (gen !== this.gen) return;
      }
      // The first hearing of ayah 1 includes the basmala before it.
      this.audio.currentTime = item.ayah === 1 && rep === 1 ? 0 : seg.start_time / 1000;
      await this.audio.play();
      if (gen !== this.gen) return;
      this.set({ phase: "playing" });
      // rAF stops within a frame of the ayah's end; timeupdate (~250 ms) keeps it
      // working when the page is hidden or the phone screen is locked (no rAF there).
      const end = seg.end_time / 1000 - 0.04;
      let finished = false;
      const check = () => {
        if (gen !== this.gen || finished) return true;
        if (this.audio.currentTime < end && !this.audio.ended) return false;
        finished = true;
        cancelAnimationFrame(this.raf);
        if (this.onTime) this.audio.removeEventListener("timeupdate", this.onTime);
        this.onTime = null;
        this.after(gen, seg);
        return true;
      };
      const tick = () => {
        if (!check()) this.raf = requestAnimationFrame(tick);
      };
      this.onTime = () => void check();
      this.audio.addEventListener("timeupdate", this.onTime);
      this.raf = requestAnimationFrame(tick);
    } catch {
      if (gen === this.gen) this.set({ phase: "error" });
    }
  }

  private after(gen: number, seg: Segment) {
    const { queue, repeat, gap, loop } = this.opts;
    const { index, rep } = this.state;
    let next: [number, number] | null;
    if (rep < repeat) next = [index, rep + 1];
    else if (index + 1 < queue.length) next = [index + 1, 1];
    else next = loop ? [0, 1] : null;

    const pauseMs = Math.round(gap * (seg.end_time - seg.start_time));
    if (pauseMs > 0) {
      this.audio.pause();
      this.set({ phase: "echo", echoMs: pauseMs, echoId: this.state.echoId + 1 });
      this.timer = setTimeout(() => {
        if (gen !== this.gen) return;
        if (next) void this.step(gen, ...next);
        else this.set({ phase: "done" });
      }, pauseMs);
    } else if (next) {
      void this.step(gen, ...next);
    } else {
      this.audio.pause();
      this.set({ phase: "done" });
    }
  }
}
