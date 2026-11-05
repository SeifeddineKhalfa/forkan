import { Injectable } from '@nestjs/common';
import { AuditService } from '../audit/audit.service.js';
import { notFound } from '../common/api-error.js';
import type { AuthUser } from '../common/decorators.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type {
  AcademicYearDto,
  RoomDto,
  UpdateAcademicYearDto,
  UpdateRoomDto,
  UpdateVenueDto,
  VenueDto,
} from './structure.schemas.js';

/** Academic years, venues and rooms: the frame every imla' hangs on. */
@Injectable()
export class StructureService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  listYears(actor: AuthUser) {
    return this.prisma.forSchool(actor.schoolId).academicYear.findMany({
      orderBy: { startDate: 'desc' },
    });
  }

  async currentYear(actor: AuthUser) {
    const year = await this.prisma.forSchool(actor.schoolId).academicYear.findFirst({
      where: { isCurrent: true },
    });
    if (!year) throw notFound('AcademicYear');
    return year;
  }

  async createYear(actor: AuthUser, dto: AcademicYearDto) {
    const db = this.prisma.forSchool(actor.schoolId);
    const year = await db.$transaction(async (tx) => {
      // Only one current year per school (also enforced by a partial unique index).
      if (dto.isCurrent) await tx.academicYear.updateMany({ data: { isCurrent: false } });
      return tx.academicYear.create({ data: { ...dto, schoolId: actor.schoolId } });
    });
    await this.audit.log(actor, 'ACADEMIC_YEAR_CREATE', 'AcademicYear', year.id, undefined, { name: year.name });
    return year;
  }

  async updateYear(actor: AuthUser, id: string, dto: UpdateAcademicYearDto) {
    const db = this.prisma.forSchool(actor.schoolId);
    if (!(await db.academicYear.findUnique({ where: { id } }))) throw notFound('AcademicYear');
    const year = await db.$transaction(async (tx) => {
      if (dto.isCurrent) {
        await tx.academicYear.updateMany({ where: { id: { not: id } }, data: { isCurrent: false } });
      }
      return tx.academicYear.update({ where: { id }, data: dto });
    });
    await this.audit.log(actor, 'ACADEMIC_YEAR_UPDATE', 'AcademicYear', id, undefined, dto);
    return year;
  }

  listVenues(actor: AuthUser) {
    return this.prisma.forSchool(actor.schoolId).venue.findMany({
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
      include: { rooms: { orderBy: { name: 'asc' } } },
    });
  }

  async createVenue(actor: AuthUser, dto: VenueDto) {
    const venue = await this.prisma.forSchool(actor.schoolId).venue.create({
      data: { ...dto, schoolId: actor.schoolId },
    });
    await this.audit.log(actor, 'VENUE_CREATE', 'Venue', venue.id, undefined, { name: venue.name });
    return venue;
  }

  async updateVenue(actor: AuthUser, id: string, dto: UpdateVenueDto) {
    const db = this.prisma.forSchool(actor.schoolId);
    if (!(await db.venue.findUnique({ where: { id } }))) throw notFound('Venue');
    return db.venue.update({ where: { id }, data: dto });
  }

  async createRoom(actor: AuthUser, venueId: string, dto: RoomDto) {
    const db = this.prisma.forSchool(actor.schoolId);
    if (!(await db.venue.findUnique({ where: { id: venueId } }))) throw notFound('Venue');
    return db.room.create({ data: { ...dto, venueId, schoolId: actor.schoolId } });
  }

  async updateRoom(actor: AuthUser, id: string, dto: UpdateRoomDto) {
    const db = this.prisma.forSchool(actor.schoolId);
    if (!(await db.room.findUnique({ where: { id } }))) throw notFound('Room');
    return db.room.update({ where: { id }, data: dto });
  }
}
