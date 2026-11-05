import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Res, UploadedFile } from '@nestjs/common';
import type { Response } from 'express';
import { z } from 'zod';
import { type AuthUser, CurrentUser, Roles } from '../common/decorators.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { SingleUpload } from '../files/upload.js';
import { ImportsService, type RunOptions } from './imports.service.js';

const uuid = new ParseUUIDPipe({ version: '7' });

const mapping = z.record(z.string(), z.number().int().min(0).max(200).nullable());
const runSchema = z.object({
  studentMapping: mapping,
  teacherMapping: mapping.default({}),
  decisions: z.record(z.string().regex(/^\d+:[12]$/), z.string().max(40)).default({}),
  skipErrors: z.boolean().default(false),
});

/** Excel / CSV import wizard: upload → mapping → dry run → commit. */
@Roles('STAFF')
@Controller('imports')
export class ImportsController {
  constructor(private readonly imports: ImportsService) {}

  @Get('template')
  async template(@CurrentUser() actor: AuthUser, @Res() res: Response) {
    const buffer = await this.imports.template(actor);
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="forkan-import.xlsx"; filename*=UTF-8''${encodeURIComponent('نموذج-استيراد-الطلبة.xlsx')}`,
      'Cache-Control': 'no-store',
    });
    res.send(buffer);
  }

  @Get()
  list(@CurrentUser() actor: AuthUser) {
    return this.imports.list(actor);
  }

  @Post()
  @SingleUpload()
  upload(@CurrentUser() actor: AuthUser, @UploadedFile() file?: Express.Multer.File) {
    return this.imports.upload(actor, file);
  }

  @Post(':id/validate')
  validate(@CurrentUser() actor: AuthUser, @Param('id', uuid) id: string, @Body(new ZodValidationPipe(runSchema)) body: RunOptions) {
    return this.imports.validate(actor, id, body);
  }

  @Post(':id/commit')
  commit(@CurrentUser() actor: AuthUser, @Param('id', uuid) id: string, @Body(new ZodValidationPipe(runSchema)) body: RunOptions) {
    return this.imports.commit(actor, id, body);
  }
}
