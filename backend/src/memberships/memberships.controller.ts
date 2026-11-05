import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { type AuthUser, CurrentUser, Roles } from '../common/decorators.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import {
  type MembershipListQuery,
  membershipListQuery,
  type RegisterMembershipDto,
  registerMembershipSchema,
  updateMembershipSchema,
  yearQuery,
} from './memberships.schemas.js';
import { MembershipsService } from './memberships.service.js';

const uuid = new ParseUUIDPipe({ version: '7' });

@Roles('STAFF')
@Controller('memberships')
export class MembershipsController {
  constructor(private readonly memberships: MembershipsService) {}

  @Get()
  list(@CurrentUser() actor: AuthUser, @Query(new ZodValidationPipe(membershipListQuery)) q: MembershipListQuery) {
    return this.memberships.list(actor, q);
  }

  @Get('missing')
  missing(@CurrentUser() actor: AuthUser, @Query(new ZodValidationPipe(yearQuery)) q: { academicYearId?: string }) {
    return this.memberships.missing(actor, q.academicYearId);
  }

  @Post()
  register(
    @CurrentUser() actor: AuthUser,
    @Body(new ZodValidationPipe(registerMembershipSchema)) dto: RegisterMembershipDto,
  ) {
    return this.memberships.register(actor, dto);
  }

  @Patch(':id')
  update(
    @CurrentUser() actor: AuthUser,
    @Param('id', uuid) id: string,
    @Body(new ZodValidationPipe(updateMembershipSchema)) dto: { formReceived: boolean },
  ) {
    return this.memberships.update(actor, id, dto.formReceived);
  }
}
