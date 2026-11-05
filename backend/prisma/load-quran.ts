import { readFileSync } from 'node:fs';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, type Riwaya } from '../src/generated/prisma/client.js';

interface QuranData {
  riwaya: Riwaya;
  version: number;
  verified: boolean;
  verifiedBy: string | null;
  verifiedAt: string | null;
  source: Record<string, string>;
  ayahCounts: number[];
  athman: { number: number; hizb: number; juz: number; startSurah: number; startAyah: number }[];
}

/** Riwayas with a reference file in prisma/data (quran-<riwaya>.json). */
const FILES = ['quran-qalun.json'];

/**
 * Loads the Qur'an reference data: the 114 surah names, then ayah counts + athman per
 * riwaya (replacing what was there). Idempotent; re-run after editing a data file.
 */
export async function loadQuranReference(prisma: PrismaClient) {
  const surahs = JSON.parse(readFileSync(new URL('./data/surahs.json', import.meta.url), 'utf8')) as [string, string][];
  if (surahs.length !== 114) throw new Error('surahs.json must contain 114 entries');
  for (const [i, [nameAr, nameLatin]] of surahs.entries()) {
    await prisma.surah.upsert({ where: { id: i + 1 }, update: { nameAr, nameLatin }, create: { id: i + 1, nameAr, nameLatin } });
  }
  for (const file of FILES) {
    const d = JSON.parse(readFileSync(new URL(`./data/${file}`, import.meta.url), 'utf8')) as QuranData;
    if (d.ayahCounts.length !== 114 || d.athman.length !== 480) throw new Error(`${file}: 114 counts and 480 athman expected`);
    await prisma.$transaction([
      prisma.quranThumn.deleteMany({ where: { riwaya: d.riwaya } }),
      prisma.surahAyahCount.deleteMany({ where: { riwaya: d.riwaya } }),
      prisma.surahAyahCount.createMany({
        data: d.ayahCounts.map((ayahCount, i) => ({ riwaya: d.riwaya, surahId: i + 1, ayahCount })),
      }),
      prisma.quranThumn.createMany({ data: d.athman.map((t) => ({ riwaya: d.riwaya, ...t })) }),
      prisma.quranDataset.upsert({
        where: { riwaya: d.riwaya },
        create: {
          riwaya: d.riwaya,
          version: d.version,
          verified: d.verified,
          verifiedBy: d.verifiedBy,
          verifiedAt: d.verifiedAt ? new Date(d.verifiedAt) : null,
          source: d.source,
        },
        update: {
          version: d.version,
          verified: d.verified,
          verifiedBy: d.verifiedBy,
          verifiedAt: d.verifiedAt ? new Date(d.verifiedAt) : null,
          source: d.source,
          loadedAt: new Date(),
        },
      }),
    ]);
    console.log(`Qur'an reference ${d.riwaya} v${d.version} loaded (${d.verified ? 'verified' : 'NOT verified yet'})`);
  }
}
