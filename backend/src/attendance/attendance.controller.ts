import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { type AuthUser, CurrentUser, Roles } from '../common/decorators.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import {
  type CancelSessionDto,
  cancelSessionSchema,
  dayQuery,
  type MarkDto,
  markSchema,
  type OpenSessionDto,
  openSessionSchema,
  type PublishDto,
  publishSchema,
  type RangeQuery,
  rangeQuery,
} from './attendance.schemas.js';
import { AttendanceService } from './attendance.service.js';

const uuid = new ParseUUIDPipe({ version: '7' });

/** Every signed-in role: teachers are limited to their own imla'at inside the service. */
@Controller()
export class AttendanceController {
  constructor(private readonly attendance: AttendanceService) {}

  @Get('attendance/day')
  day(@CurrentUser() actor: AuthUser, @Query(new ZodValidationPipe(dayQuery)) q: { date?: Date }) {
    return this.attendance.day(actor, q.date);
  }

  @Get('attendance/summary')
  summary(@CurrentUser() actor: AuthUser, @Query(new ZodValidationPipe(rangeQuery)) q: RangeQuery) {
    return this.attendance.summary(actor, q);
  }

  @HttpCode(200)
  @Post('sessions/open')
  open(@CurrentUser() actor: AuthUser, @Body(new ZodValidationPipe(openSessionSchema)) dto: OpenSessionDto) {
    return this.attendance.open(actor, dto);
  }

  @HttpCode(200)
  @Post('sessions/cancel')
  cancel(@CurrentUser() actor: AuthUser, @Body(new ZodValidationPipe(cancelSessionSchema)) dto: CancelSessionDto) {
    return this.attendance.cancel(actor, dto);
  }

  @Get('sessions/:id')
  get(@CurrentUser() actor: AuthUser, @Param('id', uuid) id: string) {
    return this.attendance.get(actor, id);
  }

  @Put('sessions/:id/attendance')
  mark(@CurrentUser() actor: AuthUser, @Param('id', uuid) id: string, @Body(new ZodValidationPipe(markSchema)) dto: MarkDto) {
    return this.attendance.mark(actor, id, dto);
  }

  @HttpCode(200)
  @Post('sessions/:id/reopen')
  reopen(@CurrentUser() actor: AuthUser, @Param('id', uuid) id: string) {
    return this.attendance.reopen(actor, id);
  }

  @Roles('STAFF')
  @Post('sessions/:id/publish')
  publish(@CurrentUser() actor: AuthUser, @Param('id', uuid) id: string, @Body(new ZodValidationPipe(publishSchema)) dto: PublishDto) {
    return this.attendance.publish(actor, id, dto);
  }

  @Get('classes/:id/attendance')
  classHistory(@CurrentUser() actor: AuthUser, @Param('id', uuid) id: string, @Query(new ZodValidationPipe(rangeQuery)) q: RangeQuery) {
    return this.attendance.classHistory(actor, id, q);
  }

  @Roles('STAFF')
  @Get('students/:id/attendance')
  studentHistory(@CurrentUser() actor: AuthUser, @Param('id', uuid) id: string, @Query(new ZodValidationPipe(rangeQuery)) q: RangeQuery) {
    return this.attendance.studentHistory(actor, id, q);
  }
}
