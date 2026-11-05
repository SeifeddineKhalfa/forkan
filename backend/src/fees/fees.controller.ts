import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { type AuthUser, CurrentUser, Roles } from '../common/decorators.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { parsePeriod } from './billing.js';
import {
  type BulkChargeDto,
  bulkChargeSchema,
  cancelChargeSchema,
  type ChargeDto,
  type ChargeListQuery,
  chargeListQuery,
  chargeSchema,
  type FeeItemDto,
  feeItemSchema,
  generateMonthlySchema,
  type UpdateFeeItemDto,
  updateFeeItemSchema,
} from './fees.schemas.js';
import { FeesService } from './fees.service.js';

const uuid = new ParseUUIDPipe({ version: '7' });

/** Fees are office work (STAFF + ADMIN); cancelling a charge is ADMIN only. */
@Roles('STAFF')
@Controller()
export class FeesController {
  constructor(private readonly fees: FeesService) {}

  @Get('fee-items')
  listFeeItems(@CurrentUser() actor: AuthUser) {
    return this.fees.listFeeItems(actor);
  }

  @Post('fee-items')
  createFeeItem(@CurrentUser() actor: AuthUser, @Body(new ZodValidationPipe(feeItemSchema)) dto: FeeItemDto) {
    return this.fees.createFeeItem(actor, dto);
  }

  @Patch('fee-items/:id')
  updateFeeItem(
    @CurrentUser() actor: AuthUser,
    @Param('id', uuid) id: string,
    @Body(new ZodValidationPipe(updateFeeItemSchema)) dto: UpdateFeeItemDto,
  ) {
    return this.fees.updateFeeItem(actor, id, dto);
  }

  @Get('charges')
  listCharges(@CurrentUser() actor: AuthUser, @Query(new ZodValidationPipe(chargeListQuery)) q: ChargeListQuery) {
    return this.fees.listCharges(actor, q);
  }

  @Post('charges')
  createCharge(@CurrentUser() actor: AuthUser, @Body(new ZodValidationPipe(chargeSchema)) dto: ChargeDto) {
    return this.fees.createCharge(actor, dto);
  }

  @Post('charges/bulk')
  bulkCharge(@CurrentUser() actor: AuthUser, @Body(new ZodValidationPipe(bulkChargeSchema)) dto: BulkChargeDto) {
    return this.fees.bulkCharge(actor, dto);
  }

  @HttpCode(200)
  @Post('charges/generate-monthly')
  generateMonthly(@CurrentUser() actor: AuthUser, @Body(new ZodValidationPipe(generateMonthlySchema)) dto: { period: string }) {
    return this.fees.generateMonthly(actor.schoolId, parsePeriod(dto.period), actor);
  }

  @Roles('ADMIN')
  @HttpCode(200)
  @Post('charges/:id/cancel')
  cancelCharge(
    @CurrentUser() actor: AuthUser,
    @Param('id', uuid) id: string,
    @Body(new ZodValidationPipe(cancelChargeSchema)) dto: { reason: string },
  ) {
    return this.fees.cancelCharge(actor, id, dto.reason);
  }

  @Get('students/:id/account')
  studentAccount(@CurrentUser() actor: AuthUser, @Param('id', uuid) id: string) {
    return this.fees.studentAccount(actor, id);
  }

  @Get('guardians/:id/account')
  guardianAccount(@CurrentUser() actor: AuthUser, @Param('id', uuid) id: string) {
    return this.fees.guardianAccount(actor, id);
  }
}
