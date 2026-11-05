import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { type AuthUser, CurrentUser } from '../common/decorators.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { type HifzSessionDto, hifzSessionSchema, timelineQuery } from './hifz.schemas.js';
import { HifzService } from './hifz.service.js';

const uuid = new ParseUUIDPipe({ version: '7' });

/** Every signed-in role: teachers are limited to their own students inside the service. */
@Controller()
export class HifzController {
  constructor(private readonly hifz: HifzService) {}

  @Post('hifz/sessions')
  record(@CurrentUser() actor: AuthUser, @Body(new ZodValidationPipe(hifzSessionSchema)) dto: HifzSessionDto) {
    return this.hifz.record(actor, dto);
  }

  @HttpCode(204)
  @Delete('hifz/sessions/:id')
  remove(@CurrentUser() actor: AuthUser, @Param('id', uuid) id: string) {
    return this.hifz.remove(actor, id);
  }

  @Get('students/:id/hifz')
  student(@CurrentUser() actor: AuthUser, @Param('id', uuid) id: string, @Query(new ZodValidationPipe(timelineQuery)) q: { limit: number }) {
    return this.hifz.student(actor, id, q.limit);
  }

  @Get('classes/:id/hifz')
  classOverview(@CurrentUser() actor: AuthUser, @Param('id', uuid) id: string) {
    return this.hifz.classOverview(actor, id);
  }

  @Get('classes/:id/hifz/report.pdf')
  async report(@CurrentUser() actor: AuthUser, @Param('id', uuid) id: string, @Res() res: Response) {
    const { buffer } = await this.hifz.classReport(actor, id);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'inline; filename="hifz-report.pdf"',
      'Cache-Control': 'private, no-store',
    });
    res.send(buffer);
  }
}
