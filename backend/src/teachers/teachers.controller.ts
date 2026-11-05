import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Res,
  UploadedFile,
} from '@nestjs/common';
import type { Response } from 'express';
import { SingleUpload, sendPrivateFile } from '../files/upload.js';
import { type AuthUser, CurrentUser, Roles } from '../common/decorators.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import {
  type CreateTeacherDto,
  createTeacherSchema,
  type IjazaDto,
  ijazaSchema,
  type LoginDto,
  loginSchema,
  type TeacherListQuery,
  teacherListQuery,
  type UpdateTeacherDto,
  updateTeacherSchema,
} from './teachers.schemas.js';
import { TeachersService } from './teachers.service.js';

const uuid = new ParseUUIDPipe({ version: '7' });

@Roles('STAFF')
@Controller('teachers')
export class TeachersController {
  constructor(private readonly teachers: TeachersService) {}

  @Get()
  list(@CurrentUser() actor: AuthUser, @Query(new ZodValidationPipe(teacherListQuery)) query: TeacherListQuery) {
    return this.teachers.list(actor, query);
  }

  @Get(':id')
  get(@CurrentUser() actor: AuthUser, @Param('id', uuid) id: string) {
    return this.teachers.get(actor, id);
  }

  @Post()
  create(@CurrentUser() actor: AuthUser, @Body(new ZodValidationPipe(createTeacherSchema)) dto: CreateTeacherDto) {
    return this.teachers.create(actor, dto);
  }

  @Patch(':id')
  update(
    @CurrentUser() actor: AuthUser,
    @Param('id', uuid) id: string,
    @Body(new ZodValidationPipe(updateTeacherSchema)) dto: UpdateTeacherDto,
  ) {
    return this.teachers.update(actor, id, dto);
  }

  @Roles('ADMIN')
  @Post(':id/login')
  addLogin(
    @CurrentUser() actor: AuthUser,
    @Param('id', uuid) id: string,
    @Body(new ZodValidationPipe(loginSchema)) dto: LoginDto,
  ) {
    return this.teachers.addLogin(actor, id, dto);
  }

  @Post(':id/ijazas')
  addIjaza(
    @CurrentUser() actor: AuthUser,
    @Param('id', uuid) id: string,
    @Body(new ZodValidationPipe(ijazaSchema)) dto: IjazaDto,
  ) {
    return this.teachers.addIjaza(actor, id, dto);
  }

  @Put(':id/ijazas/:ijazaId/document')
  @SingleUpload()
  setIjazaDocument(
    @CurrentUser() actor: AuthUser,
    @Param('id', uuid) id: string,
    @Param('ijazaId', uuid) ijazaId: string,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.teachers.setIjazaDocument(actor, id, ijazaId, file?.buffer);
  }

  @Get(':id/ijazas/:ijazaId/document')
  async ijazaDocument(
    @CurrentUser() actor: AuthUser,
    @Param('id', uuid) id: string,
    @Param('ijazaId', uuid) ijazaId: string,
    @Res() res: Response,
  ) {
    sendPrivateFile(res, await this.teachers.ijazaDocumentPath(actor, id, ijazaId));
  }

  @Delete(':id/ijazas/:ijazaId')
  @HttpCode(204)
  async removeIjaza(
    @CurrentUser() actor: AuthUser,
    @Param('id', uuid) id: string,
    @Param('ijazaId', uuid) ijazaId: string,
  ) {
    await this.teachers.removeIjaza(actor, id, ijazaId);
  }
}
