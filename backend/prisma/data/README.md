# Qur'an reference data

| File | Content |
|---|---|
| `surahs.json` | 114 surah names (Arabic, Latin) |
| `quran-qalun.json` | Qalun (Madani awwal count): ayahs per surah (6214 in total) and the 480 athman start positions |

## Status: NOT verified yet

`quran-qalun.json` was generated on 2026-11-04 by `scripts/build-quran-data.ts` from:

- [`quran-meta`](https://github.com/quran-center/quran-meta) 7.0.0 (MIT): `HizbEighthList` and ayah counts,
  built from the King Fahd Complex (KFGQPC) Qaloun data published on quranpedia.net;
- cross-checked against the KFGQPC Qalun text (quranpedia via risan/quran-json, CC BY-SA 4.0): the
  114 ayah counts agree, and 464 of the 480 athman starts carry the «۞» division mark in that text
  (the others start a surah, or are listed first in the verification sheet).

The spec requires the school's sheikh to verify the data against the mushaf used in the association
before it is trusted. The app shows a warning until then.

## Verifying and correcting

1. Open `docs/quran-data/qalun-verification.xlsx` (one row per thumn with its opening words; the 16
   rows highlighted in yellow have no «۞» mark in the text and should be checked first).
2. Fix any start position in `quran-qalun.json` (`athman[n].startSurah` / `startAyah`), then set
   `"verified": true`, `"verifiedBy"` and `"verifiedAt"` (YYYY-MM-DD) and increase `"version"`.
3. Reload: `npm run db:quran`, restart the API, then re-save or recompute affected students
   (summaries are recomputed on their next hifz save).

To rebuild from the sources: `npx tsx scripts/build-quran-data.ts <qalun-text.json>`
(the text file is not committed: download `qalun-*.json` from iptvchecker/content-quran-json).
