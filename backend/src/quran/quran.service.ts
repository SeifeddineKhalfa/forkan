import { HttpStatus, Injectable } from '@nestjs/common';
import { ApiError } from '../common/api-error.js';
import type { Riwaya } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { QuranIndex } from './quran-index.js';

/** Reference data per riwaya, read once from the database (it only changes on reload + restart). */
@Injectable()
export class QuranService {
  private readonly cache = new Map<Riwaya, Promise<QuranIndex>>();

  constructor(private readonly prisma: PrismaService) {}

  index(riwaya: Riwaya): Promise<QuranIndex> {
    let index = this.cache.get(riwaya);
    if (!index) {
      index = this.load(riwaya);
      this.cache.set(riwaya, index);
      index.catch(() => this.cache.delete(riwaya));
    }
    return index;
  }

  /** What the hifz screens need to label positions (surah names, ayah counts, athman starts). */
  async meta(riwaya: Riwaya) {
    await this.index(riwaya);
    const [dataset, surahs, athman] = await Promise.all([
      this.prisma.quranDataset.findUnique({ where: { riwaya } }),
      this.prisma.surah.findMany({
        orderBy: { id: 'asc' },
        select: { id: true, nameAr: true, ayahCounts: { where: { riwaya }, select: { ayahCount: true } } },
      }),
      this.prisma.quranThumn.findMany({
        where: { riwaya },
        orderBy: { number: 'asc' },
        select: { number: true, hizb: true, juz: true, startSurah: true, startAyah: true },
      }),
    ]);
    return {
      riwaya,
      version: dataset?.version ?? null,
      verified: dataset?.verified ?? false,
      surahs: surahs.map((s) => ({ id: s.id, nameAr: s.nameAr, ayahCount: s.ayahCounts[0]?.ayahCount ?? 0 })),
      athman,
    };
  }

  private async load(riwaya: Riwaya) {
    const [counts, athman] = await Promise.all([
      this.prisma.surahAyahCount.findMany({ where: { riwaya }, orderBy: { surahId: 'asc' } }),
      this.prisma.quranThumn.findMany({ where: { riwaya }, orderBy: { number: 'asc' } }),
    ]);
    if (counts.length !== 114 || athman.length === 0) {
      throw new ApiError(HttpStatus.UNPROCESSABLE_ENTITY, 'NO_QURAN_DATA', { riwaya });
    }
    return new QuranIndex(
      counts.map((c) => c.ayahCount),
      athman,
    );
  }
}
