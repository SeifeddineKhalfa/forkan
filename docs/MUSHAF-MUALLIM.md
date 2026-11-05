# «المصحف المعلّم» — ayah-by-ayah listening (Qalun)

Page: `/mushaf` (all roles). Linked from a student's hifz summary («استمع في المصحف المعلّم»),
which opens the student's current thumn.

## What it does

The teacher's method of the muallim mushaf: the sheikh recites an ayah, the student repeats it.

- Choose a range **by surah** (from ayah / to ayah) or **by hizb and thumn** (uses our Qalun
  athman, so it matches the hifz tracker).
- Choose the reciter, how many times each ayah is heard (×1, ×2, ×3, ×5), and the
  repetition pause (none / short / as long as the ayah / long). Optional loop.
- The player shows surah, ayah, hizb · thumn; during the pause it shows «ردِّد الآية» with a
  countdown bar. Ayah chips allow jumping anywhere in the range.
- Links can preset the range: `/mushaf?surah=2&from=1&to=5`, `/mushaf?thumn=12&to=13`.

Code: `frontend/src/lib/muallim.ts` (range builders + `MuallimEngine`),
`frontend/src/app/(app)/mushaf/page.tsx` (UI). No backend changes.

## Audio source

Streamed in the browser from **mp3quran.net**: one mp3 per surah plus their per-ayah timing
API (`https://www.mp3quran.net/api/v3/ayat_timing?surah=<n>&read=<id>`, start/end in ms).
Both send `Access-Control-Allow-Origin: *`.

| Reciter | mp3quran read | Audio folder |
|---|---|---|
| محمود خليل الحصري | 270 | `cdn.mp3quran.net/audio/mahmoud-husary/r5/` |
| علي بن عبد الرحمن الحذيفي | 75 | `cdn.mp3quran.net/audio/ali-hudhaifi/r2/` |
| الدوكالي محمد العالم | 208 | `cdn.mp3quran.net/audio/dokali-alim/r1/` |

These are the only Qalun recitations on mp3quran with ayah timings (checked 2026-11-05).

**Verified 2026-11-05:** the timings for read 270 cover all 114 surahs, with ayahs numbered
1..n and the same counts as our Qalun reference data (6214 ayahs; e.g. al-Baqara 285).
Spot checks of reads 75 and 208 (surahs 1, 2, 3, 20, 114) also match.

How playback works: the engine seeks to the ayah's start, stops at its end (checked every
frame, and on `timeupdate` so it still works with the screen locked), waits the pause, then
repeats or moves on. The first hearing of ayah 1 starts at 0 to include the basmala.

**Not verified by ear:** that every ayah boundary is cut exactly. Worth a listen by the
sheikh on a few surahs before relying on it in class.

## Licensing — why streamed, not stored

- mp3quran publishes no terms of use for the API or the audio. We **link and stream with
  credit** (shown under the player) and **do not copy files to our server**. Self-hosting
  needs written permission from mp3quran.
- If the site changes URLs or blocks cross-site use, the page shows an error; nothing else
  in the app depends on it.

## A Tunisian muallim recording — research (2026-11-05)

- **No Tunisian Qalun «المصحف المعلّم» audio was found online** (sheikh recites, children
  repeat). An archive.org item titled «… المصحف المعلم - طبعة تونس» is a scan of the printed
  Tunisian mushaf, not audio, with no licence.
- The only Qalun muallim audio found is by al-Husary (Egyptian), as private re-uploads on
  archive.org with no licence → not usable.
- Tunisian murattal (not muallim) recordings exist as unlicensed re-uploads: Radio Zitouna
  reciters (one file per hizb), Ali al-Barrak, others; a YouTube playlist (Mehdi Ben Fguir).
  No per-ayah files or timings, and no redistribution rights.
- quran.com / QuranCDN / everyayah have no Qalun recitation (unverified for everyayah licence).
- KFGQPC publishes a Qaloun font/text; whether its licence allows our use is unverified.

### To get a real Tunisian muallim version

Ask **Radio Zitouna** or the **Ministry of Religious Affairs** (or a Tunisian sheikh willing to
record) for written permission to host their recording. With per-surah files we can produce
our own ayah timings and add it as another reciter in `RECITERS` (self-hosted under
`/uploads`), with no change to the player.

### Possible next steps

- Show the ayah text in the player (needs a licensed Qalun text/font).
- Assign a listening range from the hifz entry («واجب»), and open it from a WhatsApp link.
