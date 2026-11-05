import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { type AuthUser, CurrentUser, Public, Roles } from '../common/decorators.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { sendPrivateFile } from '../files/upload.js';
import {
  financeQuery,
  type PaymentListQuery,
  paymentListQuery,
  type PayerQuery,
  payerQuery,
  type RecordPaymentDto,
  recordPaymentSchema,
  remindersQuery,
  voidPaymentSchema,
} from './payments.schemas.js';
import { PaymentsService } from './payments.service.js';

const uuid = new ParseUUIDPipe({ version: '7' });

const sendPdf = (res: Response, file: { path: string; receiptNumber: string }) => {
  res.set('Content-Disposition', `inline; filename="receipt-${file.receiptNumber}.pdf"`);
  sendPrivateFile(res, file.path);
};

@Roles('STAFF')
@Controller()
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Get('payments/open-charges')
  openCharges(@CurrentUser() actor: AuthUser, @Query(new ZodValidationPipe(payerQuery)) q: PayerQuery) {
    return this.payments.openCharges(actor, q);
  }

  @Get('payments/reminders')
  reminders(@CurrentUser() actor: AuthUser, @Query(new ZodValidationPipe(remindersQuery)) q: { type: 'OVERDUE' | 'MEMBERSHIP' }) {
    return this.payments.reminders(actor, q.type);
  }

  @Get('finance/summary')
  finance(@CurrentUser() actor: AuthUser, @Query(new ZodValidationPipe(financeQuery)) q: { period?: string }) {
    return this.payments.finance(actor, q.period);
  }

  @Get('payments')
  list(@CurrentUser() actor: AuthUser, @Query(new ZodValidationPipe(paymentListQuery)) q: PaymentListQuery) {
    return this.payments.list(actor, q);
  }

  @Post('payments')
  record(@CurrentUser() actor: AuthUser, @Body(new ZodValidationPipe(recordPaymentSchema)) dto: RecordPaymentDto) {
    return this.payments.record(actor, dto);
  }

  @Get('payments/:id')
  get(@CurrentUser() actor: AuthUser, @Param('id', uuid) id: string) {
    return this.payments.get(actor, id);
  }

  @Get('payments/:id/receipt.pdf')
  async receipt(@CurrentUser() actor: AuthUser, @Param('id', uuid) id: string, @Res() res: Response) {
    sendPdf(res, await this.payments.receiptFile(actor.schoolId, id));
  }

  @Roles('ADMIN')
  @HttpCode(200)
  @Post('payments/:id/void')
  void(
    @CurrentUser() actor: AuthUser,
    @Param('id', uuid) id: string,
    @Body(new ZodValidationPipe(voidPaymentSchema)) dto: { reason: string },
  ) {
    return this.payments.void(actor, id, dto.reason);
  }

  /** Shared on WhatsApp: no login, the unguessable token is the key. */
  @Public()
  @Throttle({ default: { ttl: 60_000, limit: 30 } })
  @Get('r/:token')
  async publicReceipt(@Param('token') token: string, @Res() res: Response) {
    sendPdf(res, await this.payments.publicReceipt(token.slice(0, 64)));
  }
}
