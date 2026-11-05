import { Module } from '@nestjs/common';
import { CreditService } from './credit.service.js';
import { FeesController } from './fees.controller.js';
import { FeesService } from './fees.service.js';
import { MonthlyChargesJob } from './monthly-charges.job.js';

@Module({
  controllers: [FeesController],
  providers: [FeesService, CreditService, MonthlyChargesJob],
  exports: [FeesService, CreditService],
})
export class FeesModule {}
