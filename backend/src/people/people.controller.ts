import {
  Body,
  Controller,
  Delete,
  Get,
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
  type CreateStudentDto,
  createStudentSchema,
  endEnrollmentSchema,
  type EnrollDto,
  enrollSchema,
  type GuardianDto,
  type GuardianLinkDto,
  guardianLinkSchema,
  guardianSchema,
  type GuardianSearchQuery,
  guardianSearchQuery,
  type StudentListQuery,
  studentListQuery,
  type UpdateGuardianDto,
  updateGuardianSchema,
  type UpdateStudentDto,
  updateStudentSchema,
} from './people.schemas.js';
import { PeopleService } from './people.service.js';

const uuid = new ParseUUIDPipe({ version: '7' });

/** Students, guardians and enrollments: managed by the office (STAFF + ADMIN). */
@Roles('STAFF')
@Controller()
export class PeopleController {
  constructor(private readonly people: PeopleService) {}

  @Get('guardians')
  searchGuardians(@CurrentUser() actor: AuthUser, @Query(new ZodValidationPipe(guardianSearchQuery)) q: GuardianSearchQuery) {
    return this.people.searchGuardians(actor, q);
  }

  @Post('guardians')
  createGuardian(@CurrentUser() actor: AuthUser, @Body(new ZodValidationPipe(guardianSchema)) dto: GuardianDto) {
    return this.people.createGuardian(actor, dto);
  }

  @Patch('guardians/:id')
  updateGuardian(
    @CurrentUser() actor: AuthUser,
    @Param('id', uuid) id: string,
    @Body(new ZodValidationPipe(updateGuardianSchema)) dto: UpdateGuardianDto,
  ) {
    return this.people.updateGuardian(actor, id, dto);
  }

  @Get('students')
  listStudents(@CurrentUser() actor: AuthUser, @Query(new ZodValidationPipe(studentListQuery)) q: StudentListQuery) {
    return this.people.listStudents(actor, q);
  }

  @Get('students/:id')
  getStudent(@CurrentUser() actor: AuthUser, @Param('id', uuid) id: string) {
    return this.people.getStudent(actor, id);
  }

  @Post('students')
  createStudent(@CurrentUser() actor: AuthUser, @Body(new ZodValidationPipe(createStudentSchema)) dto: CreateStudentDto) {
    return this.people.createStudent(actor, dto);
  }

  @Patch('students/:id')
  updateStudent(
    @CurrentUser() actor: AuthUser,
    @Param('id', uuid) id: string,
    @Body(new ZodValidationPipe(updateStudentSchema)) dto: UpdateStudentDto,
  ) {
    return this.people.updateStudent(actor, id, dto);
  }

  @Put('students/:id/photo')
  @SingleUpload()
  setPhoto(@CurrentUser() actor: AuthUser, @Param('id', uuid) id: string, @UploadedFile() file?: Express.Multer.File) {
    return this.people.setPhoto(actor, id, file?.buffer);
  }

  @Delete('students/:id/photo')
  removePhoto(@CurrentUser() actor: AuthUser, @Param('id', uuid) id: string) {
    return this.people.removePhoto(actor, id);
  }

  @Get('students/:id/photo')
  async photo(@CurrentUser() actor: AuthUser, @Param('id', uuid) id: string, @Res() res: Response) {
    sendPrivateFile(res, await this.people.photoPath(actor, id));
  }

  @Post('students/:id/guardians')
  addGuardian(
    @CurrentUser() actor: AuthUser,
    @Param('id', uuid) id: string,
    @Body(new ZodValidationPipe(guardianLinkSchema)) dto: GuardianLinkDto,
  ) {
    return this.people.addGuardian(actor, id, dto);
  }

  @Delete('students/:id/guardians/:guardianId')
  removeGuardian(
    @CurrentUser() actor: AuthUser,
    @Param('id', uuid) id: string,
    @Param('guardianId', uuid) guardianId: string,
  ) {
    return this.people.removeGuardian(actor, id, guardianId);
  }

  @Post('enrollments')
  enroll(@CurrentUser() actor: AuthUser, @Body(new ZodValidationPipe(enrollSchema)) dto: EnrollDto) {
    return this.people.enroll(actor, dto);
  }

  @Post('enrollments/:id/end')
  endEnrollment(
    @CurrentUser() actor: AuthUser,
    @Param('id', uuid) id: string,
    @Body(new ZodValidationPipe(endEnrollmentSchema)) body: { endDate?: Date },
  ) {
    return this.people.endEnrollment(actor, id, body.endDate);
  }
}
