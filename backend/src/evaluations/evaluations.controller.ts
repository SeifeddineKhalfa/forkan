import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put, Query } from '@nestjs/common';
import { type AuthUser, CurrentUser, Roles } from '../common/decorators.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import {
  type AddCandidateDto,
  addCandidateSchema,
  addFromClassSchema,
  type BranchDto,
  branchSchema,
  type CardDto,
  cardSchema,
  type CreateEvaluationDto,
  createEvaluationSchema,
  type EvaluationListQuery,
  evaluationListQuery,
  type JurorDto,
  jurorsSchema,
  type UpdateBranchDto,
  updateBranchSchema,
  type UpdateCandidateDto,
  updateCandidateSchema,
  type UpdateEvaluationDto,
  updateEvaluationSchema,
} from './evaluations.schemas.js';
import { EvaluationsService } from './evaluations.service.js';

const uuid = new ParseUUIDPipe({ version: '7' });

/**
 * Reading and score cards: every signed-in role (teachers only for evaluations where they are jurors,
 * checked in the service). Setting up an evaluation is office work (STAFF; ADMIN always passes).
 */
@Controller()
export class EvaluationsController {
  constructor(private readonly evaluations: EvaluationsService) {}

  @Get('evaluations')
  list(@CurrentUser() actor: AuthUser, @Query(new ZodValidationPipe(evaluationListQuery)) q: EvaluationListQuery) {
    return this.evaluations.list(actor, q);
  }

  @Get('evaluations/:id')
  get(@CurrentUser() actor: AuthUser, @Param('id', uuid) id: string) {
    return this.evaluations.get(actor, id);
  }

  @Roles('STAFF')
  @Post('evaluations')
  create(@CurrentUser() actor: AuthUser, @Body(new ZodValidationPipe(createEvaluationSchema)) dto: CreateEvaluationDto) {
    return this.evaluations.create(actor, dto);
  }

  @Roles('STAFF')
  @Patch('evaluations/:id')
  update(@CurrentUser() actor: AuthUser, @Param('id', uuid) id: string, @Body(new ZodValidationPipe(updateEvaluationSchema)) dto: UpdateEvaluationDto) {
    return this.evaluations.update(actor, id, dto);
  }

  @Roles('ADMIN')
  @HttpCode(204)
  @Delete('evaluations/:id')
  remove(@CurrentUser() actor: AuthUser, @Param('id', uuid) id: string) {
    return this.evaluations.remove(actor, id);
  }

  @Roles('STAFF')
  @HttpCode(200)
  @Post('evaluations/:id/close')
  close(@CurrentUser() actor: AuthUser, @Param('id', uuid) id: string) {
    return this.evaluations.close(actor, id);
  }

  @Roles('ADMIN')
  @HttpCode(200)
  @Post('evaluations/:id/reopen')
  reopen(@CurrentUser() actor: AuthUser, @Param('id', uuid) id: string) {
    return this.evaluations.reopen(actor, id);
  }

  @Roles('STAFF')
  @Put('evaluations/:id/jurors')
  setJurors(@CurrentUser() actor: AuthUser, @Param('id', uuid) id: string, @Body(new ZodValidationPipe(jurorsSchema)) dto: { jurors: JurorDto[] }) {
    return this.evaluations.setJurors(actor, id, dto.jurors);
  }

  @Roles('STAFF')
  @Post('evaluations/:id/branches')
  addBranch(@CurrentUser() actor: AuthUser, @Param('id', uuid) id: string, @Body(new ZodValidationPipe(branchSchema)) dto: BranchDto) {
    return this.evaluations.addBranch(actor, id, dto);
  }

  @Roles('STAFF')
  @Patch('evaluations/:id/branches/:branchId')
  updateBranch(
    @CurrentUser() actor: AuthUser,
    @Param('id', uuid) id: string,
    @Param('branchId', uuid) branchId: string,
    @Body(new ZodValidationPipe(updateBranchSchema)) dto: UpdateBranchDto,
  ) {
    return this.evaluations.updateBranch(actor, id, branchId, dto);
  }

  @Roles('STAFF')
  @Delete('evaluations/:id/branches/:branchId')
  removeBranch(@CurrentUser() actor: AuthUser, @Param('id', uuid) id: string, @Param('branchId', uuid) branchId: string) {
    return this.evaluations.removeBranch(actor, id, branchId);
  }

  @Roles('STAFF')
  @Post('evaluations/:id/candidates')
  addCandidate(@CurrentUser() actor: AuthUser, @Param('id', uuid) id: string, @Body(new ZodValidationPipe(addCandidateSchema)) dto: AddCandidateDto) {
    return this.evaluations.addCandidate(actor, id, dto);
  }

  @Roles('STAFF')
  @Post('evaluations/:id/candidates/from-class')
  addFromClass(
    @CurrentUser() actor: AuthUser,
    @Param('id', uuid) id: string,
    @Body(new ZodValidationPipe(addFromClassSchema)) dto: { classId: string; branchId: string },
  ) {
    return this.evaluations.addFromClass(actor, id, dto.classId, dto.branchId);
  }

  @Roles('STAFF')
  @Patch('evaluations/:id/candidates/:candidateId')
  updateCandidate(
    @CurrentUser() actor: AuthUser,
    @Param('id', uuid) id: string,
    @Param('candidateId', uuid) candidateId: string,
    @Body(new ZodValidationPipe(updateCandidateSchema)) dto: UpdateCandidateDto,
  ) {
    return this.evaluations.updateCandidate(actor, id, candidateId, dto);
  }

  @Roles('STAFF')
  @HttpCode(204)
  @Delete('evaluations/:id/candidates/:candidateId')
  removeCandidate(@CurrentUser() actor: AuthUser, @Param('id', uuid) id: string, @Param('candidateId', uuid) candidateId: string) {
    return this.evaluations.removeCandidate(actor, id, candidateId);
  }

  @Get('evaluations/:id/cards')
  cards(@CurrentUser() actor: AuthUser, @Param('id', uuid) id: string) {
    return this.evaluations.cards(actor, id);
  }

  @Get('evaluations/:id/candidates/:candidateId/card')
  card(@CurrentUser() actor: AuthUser, @Param('id', uuid) id: string, @Param('candidateId', uuid) candidateId: string) {
    return this.evaluations.card(actor, id, candidateId);
  }

  @Put('evaluations/:id/candidates/:candidateId/card')
  saveCard(
    @CurrentUser() actor: AuthUser,
    @Param('id', uuid) id: string,
    @Param('candidateId', uuid) candidateId: string,
    @Body(new ZodValidationPipe(cardSchema)) dto: CardDto,
  ) {
    return this.evaluations.saveCard(actor, id, candidateId, dto);
  }

  @Get('evaluations/:id/results')
  results(@CurrentUser() actor: AuthUser, @Param('id', uuid) id: string) {
    return this.evaluations.results(actor, id);
  }

  @Get('students/:id/evaluations')
  forStudent(@CurrentUser() actor: AuthUser, @Param('id', uuid) id: string) {
    return this.evaluations.forStudent(actor, id);
  }
}
