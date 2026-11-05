import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put, Query, Res, UploadedFile } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { type AuthUser, CurrentUser, Public, Roles } from '../common/decorators.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { SingleUpload, sendPrivateFile } from '../files/upload.js';
import {
  type NewsDto,
  type NewsListQuery,
  newsListQuery,
  newsSchema,
  type PublicNewsQuery,
  publicNewsQuery,
  type UpdateNewsDto,
  updateNewsSchema,
} from './news.schemas.js';
import { NewsService } from './news.service.js';

const uuid = new ParseUUIDPipe({ version: '7' });

/** News CMS (STAFF + ADMIN). */
@Roles('STAFF')
@Controller('news')
export class NewsController {
  constructor(private readonly news: NewsService) {}

  @Get()
  list(@CurrentUser() actor: AuthUser, @Query(new ZodValidationPipe(newsListQuery)) q: NewsListQuery) {
    return this.news.list(actor, q);
  }

  @Post()
  create(@CurrentUser() actor: AuthUser, @Body(new ZodValidationPipe(newsSchema)) dto: NewsDto) {
    return this.news.create(actor, dto);
  }

  @Get(':id')
  get(@CurrentUser() actor: AuthUser, @Param('id', uuid) id: string) {
    return this.news.get(actor, id);
  }

  @Patch(':id')
  update(@CurrentUser() actor: AuthUser, @Param('id', uuid) id: string, @Body(new ZodValidationPipe(updateNewsSchema)) dto: UpdateNewsDto) {
    return this.news.update(actor, id, dto);
  }

  @HttpCode(200)
  @Post(':id/publish')
  publish(@CurrentUser() actor: AuthUser, @Param('id', uuid) id: string) {
    return this.news.setStatus(actor, id, 'PUBLISHED');
  }

  @HttpCode(200)
  @Post(':id/unpublish')
  unpublish(@CurrentUser() actor: AuthUser, @Param('id', uuid) id: string) {
    return this.news.setStatus(actor, id, 'DRAFT');
  }

  @HttpCode(204)
  @Delete(':id')
  remove(@CurrentUser() actor: AuthUser, @Param('id', uuid) id: string) {
    return this.news.remove(actor, id);
  }

  @Put(':id/cover')
  @SingleUpload()
  setCover(@CurrentUser() actor: AuthUser, @Param('id', uuid) id: string, @UploadedFile() file?: Express.Multer.File) {
    return this.news.setCover(actor, id, file?.buffer);
  }

  @Delete(':id/cover')
  removeCover(@CurrentUser() actor: AuthUser, @Param('id', uuid) id: string) {
    return this.news.removeCover(actor, id);
  }

  @Get(':id/cover')
  async cover(@CurrentUser() actor: AuthUser, @Param('id', uuid) id: string, @Res() res: Response) {
    sendPrivateFile(res, await this.news.coverPath(actor, id));
  }
}

/** The public website's read-only API: published content and public structure, never student data. */
@Public()
@Throttle({ default: { ttl: 60_000, limit: 120 } })
@Controller('public')
export class PublicController {
  constructor(private readonly news: NewsService) {}

  @Get('site')
  site() {
    return this.news.publicSite();
  }

  @Get('schedule')
  schedule() {
    return this.news.publicSchedule();
  }

  @Get('news')
  list(@Query(new ZodValidationPipe(publicNewsQuery)) q: PublicNewsQuery) {
    return this.news.publicNews(q);
  }

  @Get('news/:slug')
  post(@Param('slug') slug: string) {
    return this.news.publicPost(slug.slice(0, 100));
  }

  @Get('news/:slug/cover')
  async cover(@Param('slug') slug: string, @Res() res: Response) {
    const path = await this.news.publicCover(slug.slice(0, 100));
    res.set({ 'Cache-Control': 'public, max-age=86400', 'X-Content-Type-Options': 'nosniff' });
    res.sendFile(path);
  }
}
