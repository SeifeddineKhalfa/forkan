import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { type AuthUser, CurrentUser, Roles } from '../common/decorators.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import {
  type ClassListQuery,
  classListQuery,
  type CreateClassDto,
  createClassSchema,
  type UpdateClassDto,
  updateClassSchema,
} from './classes.schemas.js';
import { ClassesService } from './classes.service.js';

const uuid = new ParseUUIDPipe({ version: '7' });

/** Imla'at. Teachers can read their own; the office manages them. */
@Controller('classes')
export class ClassesController {
  constructor(private readonly classes: ClassesService) {}

  @Get()
  list(@CurrentUser() actor: AuthUser, @Query(new ZodValidationPipe(classListQuery)) query: ClassListQuery) {
    return this.classes.list(actor, query);
  }

  @Get(':id')
  get(@CurrentUser() actor: AuthUser, @Param('id', uuid) id: string) {
    return this.classes.get(actor, id);
  }

  @Roles('STAFF')
  @Post()
  create(@CurrentUser() actor: AuthUser, @Body(new ZodValidationPipe(createClassSchema)) dto: CreateClassDto) {
    return this.classes.create(actor, dto);
  }

  @Roles('STAFF')
  @Patch(':id')
  update(
    @CurrentUser() actor: AuthUser,
    @Param('id', uuid) id: string,
    @Body(new ZodValidationPipe(updateClassSchema)) dto: UpdateClassDto,
  ) {
    return this.classes.update(actor, id, dto);
  }
}
