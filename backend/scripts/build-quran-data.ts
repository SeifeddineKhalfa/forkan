/**
 * Builds prisma/data/quran-qalun.json (ayah counts + 480 athman, Qalun numbering)
 * from the `quran-meta` package, cross-checks the ayah counts against a Qalun text
 * dump, and writes an Excel sheet for the sheikh to verify every thumn against the
 * school's printed mushaf (spec A5: data must be verified before use).
 *
 *   npx tsx scripts/build-quran-data.ts <path-to-qalun-text.json>
 *
 * The text file (KFGQPC Qalun via quranpedia / risan quran-json, CC BY-SA 4.0) is
 * only read to cross-check counts and print each thumn's opening words; it is not
 * shipped with the app.
 */
import ExcelJS from 'exceljs';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import * as qalun from 'quran-meta/qalun';
import * as hafs from 'quran-meta/hafs';

const textPath = process.argv[2];
if (!textPath) throw new Error('usage: tsx scripts/build-quran-data.ts <qalun-text.json>');

const surahNames = JSON.parse(readFileSync(new URL('../prisma/data/surahs.json', import.meta.url), 'utf8')) as [string, string][];
const text = JSON.parse(readFileSync(textPath, 'utf8')) as { id: number; verses: { id: number; text: string }[] }[];

// ── Ayah counts, from two sources that must agree ──
const ayahCounts = Array.from({ length: 114 }, (_, i) => qalun.getAyahCountInSurah((i + 1) as never) as number);
const textCounts = text.map((s) => s.verses.length);
const mismatches = ayahCounts.flatMap((n, i) => (n === textCounts[i] ? [] : [`surah ${i + 1}: meta ${n}, text ${textCounts[i]}`]));
if (text.length !== 114 || mismatches.length) throw new Error(`ayah counts disagree:\n${mismatches.join('\n')}`);
const total = ayahCounts.reduce((a, b) => a + b, 0);
if (total !== 6214) throw new Error(`Qalun (Madani awwal) has 6214 ayahs, got ${total}`);

// ── Athman ──
const eighths = qalun.HizbEighthList as number[]; // [sentinel, start of thumn 1..480, end sentinel]
const athman = Array.from({ length: 480 }, (_, i) => {
  const number = i + 1;
  const [startSurah, startAyah] = qalun.findSurahAyahByAyahId(eighths[number] as never) as [number, number];
  return { number, hizb: Math.ceil(number / 8), juz: qalun.findJuzByAyahId(eighths[number] as never) as number, startSurah, startAyah };
});
for (const [i, t] of athman.entries()) {
  if (i > 0 && eighths[t.number] <= eighths[t.number - 1]) throw new Error(`thumn ${t.number} does not start after thumn ${t.number - 1}`);
}
if (athman[0].startSurah !== 1 || athman[0].startAyah !== 1) throw new Error('thumn 1 must start at 1:1');

const pkg = JSON.parse(readFileSync(new URL('../node_modules/quran-meta/package.json', import.meta.url), 'utf8')) as { version: string };
const data = {
  riwaya: 'QALUN',
  version: 1,
  verified: false,
  verifiedBy: null,
  verifiedAt: null,
  source: {
    athman: `quran-meta ${pkg.version} (MIT) — HizbEighthList, from KFGQPC Qaloun data via quranpedia.net`,
    ayahCounts: `quran-meta ${pkg.version}, cross-checked with the KFGQPC Qalun text (quranpedia / risan quran-json)`,
    builtAt: new Date().toISOString().slice(0, 10),
  },
  ayahCounts,
  athman,
};
writeFileSync(new URL('../prisma/data/quran-qalun.json', import.meta.url), `${JSON.stringify(data, null, 1)}\n`);

// ── Verification workbook ──
const firstWords = (surah: number, ayah: number, n = 7) => text[surah - 1].verses[ayah - 1].text.split(/\s+/).slice(0, n).join(' ');
// Where the quarter marker differs from the Mashriqi (Hafs) mushaf: worth a closer look.
const hafsQuarterStarts = new Set(
  (hafs.HizbQuarterList as number[]).slice(1, 241).map((id) => (hafs.findSurahAyahByAyahId(id as never) as number[]).join(':')),
);
const differsFromHafs = (surah: number, ayah: number) => {
  const mapped = qalun.convertAyahTo(surah as never, ayah as never, 'Hafs') as unknown as number[] | number[][];
  const first = (Array.isArray(mapped[0]) ? mapped[0] : mapped) as number[];
  return !hafsQuarterStarts.has(first.join(':'));
};

// Second signal: the KFGQPC text prints «۞» on the first ayah of each division.
const marked = new Set(text.flatMap((s) => s.verses.filter((v) => v.text.includes('۞')).map((v) => `${s.id}:${v.id}`)));
const markerCheck = (t: (typeof athman)[number]) =>
  t.startAyah === 1 ? 'بداية سورة' : marked.has(`${t.startSurah}:${t.startAyah}`) ? '۞ مطابق' : '⚠ لا علامة في النصّ';
const unconfirmed = athman.filter((t) => markerCheck(t).startsWith('⚠')).length;

const wb = new ExcelJS.Workbook();
const sheet = wb.addWorksheet('الأثمان', { views: [{ rightToLeft: true, state: 'frozen', ySplit: 1 }] });
sheet.columns = [
  { header: 'الثمن', key: 'number', width: 7 },
  { header: 'الحزب', key: 'hizb', width: 7 },
  { header: 'ثمن الحزب', key: 'eighth', width: 9 },
  { header: 'السورة', key: 'surah', width: 16 },
  { header: 'الآية (عدّ قالون)', key: 'ayah', width: 12 },
  { header: 'بداية الثمن', key: 'words', width: 60 },
  { header: 'علامة الثمن في نصّ المجمّع', key: 'marker', width: 18 },
  { header: 'يختلف عن المصحف المشرقي', key: 'diff', width: 12 },
  { header: 'صحيح؟ (نعم/لا)', key: 'ok', width: 12 },
  { header: 'التصحيح (السورة:الآية)', key: 'fix', width: 18 },
];
for (const t of athman) {
  const onQuarter = t.number % 2 === 1;
  sheet.addRow({
    number: t.number,
    hizb: t.hizb,
    eighth: ((t.number - 1) % 8) + 1,
    surah: `${t.startSurah} ${surahNames[t.startSurah - 1][0]}`,
    ayah: t.startAyah,
    words: firstWords(t.startSurah, t.startAyah),
    marker: markerCheck(t),
    diff: onQuarter && differsFromHafs(t.startSurah, t.startAyah) ? 'نعم' : '',
  });
}
sheet.eachRow((row, i) => {
  if (i > 1 && String(row.getCell('marker').value).startsWith('⚠')) {
    row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF2CC' } };
  }
});
sheet.getRow(1).font = { bold: true };

const counts = wb.addWorksheet('عدد الآيات', { views: [{ rightToLeft: true, state: 'frozen', ySplit: 1 }] });
counts.columns = [
  { header: 'السورة', key: 'n', width: 7 },
  { header: 'الاسم', key: 'name', width: 16 },
  { header: 'عدد الآيات (قالون)', key: 'count', width: 16 },
  { header: 'عدد الآيات (حفص)', key: 'hafs', width: 16 },
  { header: 'صحيح؟', key: 'ok', width: 10 },
];
ayahCounts.forEach((count, i) =>
  counts.addRow({ n: i + 1, name: surahNames[i][0], count, hafs: hafs.getAyahCountInSurah((i + 1) as never) }),
);
counts.getRow(1).font = { bold: true };

const about = wb.addWorksheet('طريقة التدقيق', { views: [{ rightToLeft: true }] });
about.getColumn(1).width = 110;
for (const line of [
  'الغاية: التأكّد من بدايات الأثمان الـ480 وعدد آيات كلّ سورة حسب المصحف المعتمد في الجمعية (رواية قالون).',
  'لكلّ سطر: قارن «بداية الثمن» بعلامة الثمن في المصحف، واكتب «نعم» أو «لا» مع التصحيح (رقم السورة:رقم الآية).',
  `الأسطر الملوّنة بالأصفر (${unconfirmed}) لا توجد في نصّ المجمّع علامة ۞ في بدايتها: يُرجى التثبّت منها أوّلاً.`,
  'العمود «يختلف عن المصحف المشرقي» يشير إلى أرباع تختلف عن علامات مصحف حفص المشرقي (اختلاف معروف بين المصاحف المغربية والمشرقية).',
  `المصدر: مكتبة quran-meta ${pkg.version} (بيانات مجمّع الملك فهد لرواية قالون عبر quranpedia.net)، والنصّ من مجمّع الملك فهد عبر quranpedia (CC BY-SA 4.0).`,
  'بعد التدقيق تُعدَّل البيانات في الملف backend/prisma/data/quran-qalun.json ويُضبط verified على true مع اسم المدقّق والتاريخ.',
]) about.addRow([line]);

mkdirSync(new URL('../../docs/quran-data/', import.meta.url), { recursive: true });
await wb.xlsx.writeFile(new URL('../../docs/quran-data/qalun-verification.xlsx', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
console.log(`quran-qalun.json: ${total} ayahs, ${athman.length} athman; ${unconfirmed} athman without a text marker; verification sheet written`);
