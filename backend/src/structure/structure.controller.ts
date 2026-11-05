import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { type AuthUser, CurrentUser, Roles } from '../common/decorators.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import {
  type AcademicYearDto,
  academicYearSchema,
  type RoomDto,
  roomSchema,
  type UpdateAcademicYearDto,
  updateAcademicYearSchema,
  type UpdateRoomDto,
  updateRoomSchema,
  type UpdateVenueDto,
  updateVenueSchema,
  type VenueDto,
  venueSchema,
} from './structure.schemas.js';
import { StructureService } from './structure.service.js';

const uuid = new ParseUUIDPipe({ version: '7' });

@Controller()
export class StructureController {
  constructor(private readonly structure: StructureService) {}

  // Every signed-in role needs the year list (teachers filter their imla'at by year).
  @Get('academic-years')
  listYears(@CurrentUser() actor: AuthUser) {
    return this.structure.listYears(actor);
  }

  @Get('academic-years/current')
  currentYear(@CurrentUser() actor: AuthUser) {
    return this.structure.currentYear(actor);
  }

  @Roles('ADMIN')
  @Post('academic-years')
  createYear(@CurrentUser() actor: AuthUser, @Body(new ZodValidationPipe(academicYearSchema)) dto: AcademicYearDto) {
    return this.structure.createYear(actor, dto);
  }

  @Roles('ADMIN')
  @Patch('academic-years/:id')
  updateYear(
    @CurrentUser() actor: AuthUser,
    @Param('id', uuid) id: string,
    @Body(new ZodValidationPipe(updateAcademicYearSchema)) dto: UpdateAcademicYearDto,
  ) {
    return this.structure.updateYear(actor, id, dto);
  }

  @Get('venues')
  listVenues(@CurrentUser() actor: AuthUser) {
    return this.structure.listVenues(actor);
  }

  @Roles('STAFF')
  @Post('venues')
  createVenue(@CurrentUser() actor: AuthUser, @Body(new ZodValidationPipe(venueSchema)) dto: VenueDto) {
    return this.structure.createVenue(actor, dto);
  }

  @Roles('STAFF')
  @Patch('venues/:id')
  updateVenue(
    @CurrentUser() actor: AuthUser,
    @Param('id', uuid) id: string,
    @Body(new ZodValidationPipe(updateVenueSchema)) dto: UpdateVenueDto,
  ) {
    return this.structure.updateVenue(actor, id, dto);
  }

  @Roles('STAFF')
  @Post('venues/:id/rooms')
  createRoom(
    @CurrentUser() actor: AuthUser,
    @Param('id', uuid) venueId: string,
    @Body(new ZodValidationPipe(roomSchema)) dto: RoomDto,
  ) {
    return this.structure.createRoom(actor, venueId, dto);
  }

  @Roles('STAFF')
  @Patch('rooms/:id')
  updateRoom(
    @CurrentUser() actor: AuthUser,
    @Param('id', uuid) id: string,
    @Body(new ZodValidationPipe(updateRoomSchema)) dto: UpdateRoomDto,
  ) {
    return this.structure.updateRoom(actor, id, dto);
  }
}
