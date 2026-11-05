import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { todayInSchool } from '../common/dates.js';
import { BossService } from '../jobs/boss.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { periodOf } from './billing.js';
import { FeesService } from './fees.service.js';

export const MONTHLY_CHARGES_QUEUE = 'charges.generate-monthly';

/**
 * Runs every morning and generates the month's charges once the school's billing
 * day has come. Daily (not only on the billing day) so a server that was down on
 * the 1st catches up, and later enrollments get their month; generation is idempotent.
 */
@Injectable()
export class MonthlyChargesJob implements OnApplicationBootstrap {
  constructor(
    private readonly boss: BossService,
    private readonly prisma: PrismaService,
    private readonly fees: FeesService,
  ) {}

  async onApplicationBootstrap() {
    await this.boss.schedule(MONTHLY_CHARGES_QUEUE, '0 6 * * *', () => this.run());
  }

  async run(today = todayInSchool()) {
    const schools = await this.prisma.schoolSettings.findMany({ select: { schoolId: true, billingDay: true } });
    const results = [];
    for (const s of schools) {
      if (today.getUTCDate() < s.billingDay) continue;
      results.push({ schoolId: s.schoolId, ...(await this.fees.generateMonthly(s.schoolId, periodOf(today))) });
    }
    return results;
  }
}
