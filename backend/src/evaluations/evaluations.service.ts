import { HttpStatus, Injectable } from '@nestjs/common';
import { AuditService } from '../audit/audit.service.js';
import { ApiError, notFound } from '../common/api-error.js';
import { nextCounter } from '../common/counters.js';
import type { AuthUser } from '../common/decorators.js';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService, type SchoolTx } from '../prisma/prisma.service.js';
import type {
  AddCandidateDto,
  BranchDto,
  CardDto,
  CreateEvaluationDto,
  EvaluationListQuery,
  JurorDto,
  UpdateBranchDto,
  UpdateCandidateDto,
  UpdateEvaluationDto,
} from './evaluations.schemas.js';
import { candidateResult, maxTotal, rankBranch, type Scale, scoreError } from './scoring.js';

const conflict = (code: string, params?: Record<string, unknown>) => new ApiError(HttpStatus.CONFLICT, code, params);
const invalid = (code: string, params?: Record<string, unknown>) => new ApiError(HttpStatus.BAD_REQUEST, code, params);

/** Teachers only see the evaluations where they sit on the jury. */
const visibleTo = (actor: AuthUser): Prisma.EvaluationWhereInput =>
  actor.role === 'TEACHER' ? { jurors: { some: { teacher: { userId: actor.id } } } } : {};

const isOffice = (actor: AuthUser) => actor.role !== 'TEACHER';

const branchOrder = [{ sortOrder: 'asc' }, { name: 'asc' }] satisfies Prisma.EvaluationBranchOrderByWithRelationInput[];

const candidateSelect = {
  id: true,
  number: true,
  branchId: true,
  studentId: true,
  fullName: true,
  gender: true,
  // No phone: jurors (teachers) see these rows, and phones are for the office only.
  absent: true,
  hifzScore: true,
  tajwidScore: true,
  notes: true,
  scoredAt: true,
  student: { select: { code: true } },
  _count: { select: { questions: true } },
} satisfies Prisma.EvaluationCandidateSelect;

type CandidateRow = Prisma.EvaluationCandidateGetPayload<{ select: typeof candidateSelect }>;

const withResult = (scale: Scale, c: CandidateRow) => {
  const { _count, student, ...rest } = c;
  return { ...rest, studentCode: student?.code ?? null, questionsFilled: _count.questions, ...candidateResult(scale, c) };
};

/** Exams and competitions (الامتحانات والمسابقات), scored with the school's «بطاقة تقييم». */
@Injectable()
export class EvaluationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ───────────── Evaluations ─────────────

  async list(actor: AuthUser, q: EvaluationListQuery) {
    const db = this.prisma.forSchool(actor.schoolId);
    const items = await db.evaluation.findMany({
      where: {
        AND: [
          visibleTo(actor),
          q.kind ? { kind: q.kind } : {},
          q.status ? { status: q.status } : {},
          q.academicYearId ? { academicYearId: q.academicYearId } : {},
        ],
      },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      include: {
        class: { select: { id: true, name: true } },
        branches: { orderBy: branchOrder, select: { id: true, name: true } },
        _count: { select: { candidates: true } },
      },
    });
    const scored = await db.evaluationCandidate.groupBy({
      by: ['evaluationId'],
      where: { evaluationId: { in: items.map((e) => e.id) }, OR: [{ hifzScore: { not: null } }, { absent: true }] },
      _count: { _all: true },
    });
    const done = new Map(scored.map((s) => [s.evaluationId, s._count._all]));
    return items.map(({ _count, ...e }) => ({ ...e, candidates: _count.candidates, cardsDone: done.get(e.id) ?? 0 }));
  }

  async get(actor: AuthUser, id: string) {
    const db = this.prisma.forSchool(actor.schoolId);
    const e = await db.evaluation.findFirst({
      where: { AND: [{ id }, visibleTo(actor)] },
      include: {
        class: { select: { id: true, name: true } },
        academicYear: { select: { id: true, name: true } },
        branches: { orderBy: branchOrder },
        jurors: {
          orderBy: [{ isPresident: 'desc' }, { sortOrder: 'asc' }],
          select: { id: true, name: true, isPresident: true, teacherId: true, teacher: { select: { userId: true } } },
        },
        candidates: { orderBy: { number: 'asc' }, select: candidateSelect },
      },
    });
    if (!e) throw notFound('Evaluation');
    const scales = new Map(e.branches.map((b) => [b.id, b]));
    const { candidates, jurors, ...rest } = e;
    return {
      ...rest,
      branches: e.branches.map((b) => ({
        ...b,
        maxTotal: maxTotal(b),
        candidates: candidates.filter((c) => c.branchId === b.id).length,
      })),
      jurors: jurors.map(({ teacher: _teacher, ...j }) => j),
      candidates: candidates.map((c) => withResult(scales.get(c.branchId)!, c)),
      canManage: isOffice(actor),
      canScore: e.status === 'OPEN' && (isOffice(actor) || jurors.some((j) => j.teacher?.userId === actor.id)),
    };
  }

  async create(actor: AuthUser, dto: CreateEvaluationDto) {
    const db = this.prisma.forSchool(actor.schoolId);
    this.assertUniqueNames(dto.branches.map((b) => b.name));
    for (const b of dto.branches) this.assertScale(b);
    if (dto.academicYearId && !(await db.academicYear.count({ where: { id: dto.academicYearId } }))) throw notFound('AcademicYear');
    const academicYearId = dto.academicYearId ?? (await db.academicYear.findFirst({ where: { isCurrent: true }, select: { id: true } }))?.id;
    if (dto.classId) await this.assertClass(actor, dto.classId);
    await this.assertTeachers(actor, dto.jurors);
    const created = await db.evaluation.create({
      data: {
        schoolId: actor.schoolId,
        kind: dto.kind,
        title: dto.title,
        date: dto.date,
        location: dto.location,
        notes: dto.notes,
        classId: dto.classId,
        academicYearId,
        branches: { create: dto.branches.map((b, i) => ({ ...b, sortOrder: b.sortOrder ?? i })) },
        jurors: { create: dto.jurors.map((j, i) => ({ ...j, sortOrder: i })) },
      },
      select: { id: true },
    });
    await this.audit.log(actor, 'EVALUATION_CREATE', 'Evaluation', created.id, null, { kind: dto.kind, title: dto.title });
    return this.get(actor, created.id);
  }

  async update(actor: AuthUser, id: string, dto: UpdateEvaluationDto) {
    await this.openEvaluation(actor, id);
    if (dto.classId) await this.assertClass(actor, dto.classId);
    await this.prisma.forSchool(actor.schoolId).evaluation.update({ where: { id }, data: dto });
    return this.get(actor, id);
  }

  /** ADMIN, and only before any card is filled: results are records of the association. */
  async remove(actor: AuthUser, id: string) {
    const db = this.prisma.forSchool(actor.schoolId);
    const e = await db.evaluation.findUnique({ where: { id }, select: { id: true, title: true } });
    if (!e) throw notFound('Evaluation');
    const scored = await db.evaluationCandidate.count({ where: { evaluationId: id, OR: [{ hifzScore: { not: null } }, { absent: true }] } });
    if (scored) throw conflict('EVALUATION_HAS_SCORES');
    await db.evaluation.delete({ where: { id } });
    await this.audit.log(actor, 'EVALUATION_DELETE', 'Evaluation', id, e, null);
  }

  async close(actor: AuthUser, id: string) {
    await this.openEvaluation(actor, id);
    await this.prisma.forSchool(actor.schoolId).evaluation.update({ where: { id }, data: { status: 'CLOSED', closedAt: new Date() } });
    await this.audit.log(actor, 'EVALUATION_CLOSE', 'Evaluation', id);
    return this.get(actor, id);
  }

  async reopen(actor: AuthUser, id: string) {
    const db = this.prisma.forSchool(actor.schoolId);
    const e = await db.evaluation.findUnique({ where: { id }, select: { status: true } });
    if (!e) throw notFound('Evaluation');
    await db.evaluation.update({ where: { id }, data: { status: 'OPEN', closedAt: null } });
    await this.audit.log(actor, 'EVALUATION_REOPEN', 'Evaluation', id);
    return this.get(actor, id);
  }

  async setJurors(actor: AuthUser, id: string, jurors: JurorDto[]) {
    await this.openEvaluation(actor, id);
    await this.assertTeachers(actor, jurors);
    await this.prisma.forSchool(actor.schoolId).$transaction(async (tx) => {
      await this.assertEvaluationInTx(tx, id);
      await tx.evaluationJuror.deleteMany({ where: { evaluationId: id } });
      await tx.evaluationJuror.createMany({ data: jurors.map((j, i) => ({ ...j, evaluationId: id, sortOrder: i })) });
    });
    return this.get(actor, id);
  }

  // ───────────── Branches (الفروع) ─────────────

  async addBranch(actor: AuthUser, id: string, dto: BranchDto) {
    await this.openEvaluation(actor, id);
    this.assertScale(dto);
    const db = this.prisma.forSchool(actor.schoolId);
    const last = await db.evaluationBranch.aggregate({ where: { evaluationId: id }, _max: { sortOrder: true } });
    await db.evaluationBranch.create({ data: { ...dto, evaluationId: id, sortOrder: dto.sortOrder ?? (last._max.sortOrder ?? -1) + 1 } });
    return this.get(actor, id);
  }

  async updateBranch(actor: AuthUser, id: string, branchId: string, dto: UpdateBranchDto) {
    await this.openEvaluation(actor, id);
    const db = this.prisma.forSchool(actor.schoolId);
    const branch = await this.branch(actor, id, branchId);
    const scale = { ...branch, ...dto };
    this.assertScale(scale);
    // Lowering a maximum must not leave a filled card above it.
    const above = await db.evaluationCandidate.count({
      where: { branchId, OR: [{ hifzScore: { gt: scale.hifzMax } }, { tajwidScore: { gt: scale.tajwidMax } }] },
    });
    if (above) throw conflict('SCORES_ABOVE_NEW_MAX', { count: above });
    if (dto.questionCount !== undefined) {
      const beyond = await db.evaluationQuestion.count({ where: { candidate: { branchId }, number: { gt: dto.questionCount } } });
      if (beyond) throw conflict('QUESTIONS_BEYOND_NEW_COUNT', { count: beyond });
    }
    await db.evaluationBranch.update({ where: { id: branchId }, data: dto });
    return this.get(actor, id);
  }

  async removeBranch(actor: AuthUser, id: string, branchId: string) {
    await this.openEvaluation(actor, id);
    const db = this.prisma.forSchool(actor.schoolId);
    await this.branch(actor, id, branchId);
    if (await db.evaluationCandidate.count({ where: { branchId } })) throw conflict('BRANCH_HAS_CANDIDATES');
    if ((await db.evaluationBranch.count({ where: { evaluationId: id } })) <= 1) throw conflict('LAST_BRANCH');
    await db.evaluationBranch.delete({ where: { id: branchId } });
    return this.get(actor, id);
  }

  // ───────────── Candidates (المتسابقون) ─────────────

  async addCandidate(actor: AuthUser, id: string, dto: AddCandidateDto) {
    await this.openEvaluation(actor, id);
    await this.branch(actor, id, dto.branchId);
    const db = this.prisma.forSchool(actor.schoolId);
    let person: { fullName: string; gender: 'MALE' | 'FEMALE' | null; phone: string | null };
    if (dto.studentId) {
      const s = await db.student.findUnique({
        where: { id: dto.studentId },
        select: { firstName: true, lastName: true, gender: true, phone: true },
      });
      if (!s) throw notFound('Student');
      if (await db.evaluationCandidate.count({ where: { evaluationId: id, studentId: dto.studentId } })) {
        throw conflict('CANDIDATE_ALREADY_ADDED');
      }
      person = { fullName: `${s.firstName} ${s.lastName}`, gender: s.gender, phone: s.phone };
    } else {
      person = { fullName: dto.fullName!, gender: dto.gender ?? null, phone: dto.phone ?? null };
    }
    const created = await db.$transaction(async (tx) => {
      const number = await nextCounter(tx, actor.schoolId, `evaluation:${id}`);
      return tx.evaluationCandidate.create({
        data: { schoolId: actor.schoolId, evaluationId: id, branchId: dto.branchId, studentId: dto.studentId, number, ...person },
        select: { id: true },
      });
    });
    return created;
  }

  /** Adds the active students of an imla' who are not candidates yet, in name order. */
  async addFromClass(actor: AuthUser, id: string, classId: string, branchId: string) {
    await this.openEvaluation(actor, id);
    await this.branch(actor, id, branchId);
    await this.assertClass(actor, classId);
    const db = this.prisma.forSchool(actor.schoolId);
    const enrolled = await db.enrollment.findMany({
      where: { classId, status: 'ACTIVE' },
      select: { student: { select: { id: true, firstName: true, lastName: true, gender: true, phone: true } } },
      orderBy: [{ student: { lastName: 'asc' } }, { student: { firstName: 'asc' } }],
    });
    const already = new Set(
      (await db.evaluationCandidate.findMany({ where: { evaluationId: id, studentId: { not: null } }, select: { studentId: true } })).map(
        (c) => c.studentId,
      ),
    );
    const toAdd = enrolled.map((e) => e.student).filter((s) => !already.has(s.id));
    await db.$transaction(async (tx) => {
      for (const s of toAdd) {
        const number = await nextCounter(tx, actor.schoolId, `evaluation:${id}`);
        await tx.evaluationCandidate.create({
          data: {
            schoolId: actor.schoolId,
            evaluationId: id,
            branchId,
            studentId: s.id,
            number,
            fullName: `${s.firstName} ${s.lastName}`,
            gender: s.gender,
            phone: s.phone,
          },
        });
      }
    });
    return { added: toAdd.length, skipped: enrolled.length - toAdd.length };
  }

  async updateCandidate(actor: AuthUser, id: string, candidateId: string, dto: UpdateCandidateDto) {
    await this.openEvaluation(actor, id);
    const db = this.prisma.forSchool(actor.schoolId);
    const c = await this.candidate(actor, id, candidateId);
    if (dto.branchId && dto.branchId !== c.branchId) {
      const target = await this.branch(actor, id, dto.branchId);
      // A filled card moves only if it still fits the new scale.
      const err = scoreError(target, c);
      if (err) throw conflict(err);
      const beyond = await db.evaluationQuestion.count({ where: { candidateId, number: { gt: target.questionCount } } });
      if (beyond) throw conflict('QUESTIONS_BEYOND_NEW_COUNT', { count: beyond });
    }
    await db.evaluationCandidate.update({ where: { id: candidateId }, data: dto });
    return { id: candidateId };
  }

  async removeCandidate(actor: AuthUser, id: string, candidateId: string) {
    await this.openEvaluation(actor, id);
    const c = await this.candidate(actor, id, candidateId);
    await this.prisma.forSchool(actor.schoolId).evaluationCandidate.delete({ where: { id: candidateId } });
    if (c.hifzScore !== null || c.absent) {
      await this.audit.log(actor, 'EVALUATION_CANDIDATE_DELETE', 'EvaluationCandidate', candidateId, c, null);
    }
  }

  // ───────────── Score card (بطاقة التقييم) ─────────────

  async card(actor: AuthUser, id: string, candidateId: string) {
    const e = await this.visibleEvaluation(actor, id);
    const db = this.prisma.forSchool(actor.schoolId);
    const c = await db.evaluationCandidate.findFirst({
      where: { id: candidateId, evaluationId: id },
      select: {
        ...candidateSelect,
        branch: true,
        scoredBy: { select: { firstName: true, lastName: true } },
        questions: { orderBy: { number: 'asc' }, select: { number: true, surahId: true, ayah: true, mistakes: true, note: true } },
      },
    });
    if (!c) throw notFound('EvaluationCandidate');
    const { branch, questions, scoredBy, ...row } = c;
    return {
      evaluation: { id: e.id, title: e.title, kind: e.kind, date: e.date, status: e.status },
      branch: { ...branch, maxTotal: maxTotal(branch) },
      candidate: withResult(branch, row),
      questions,
      scoredBy,
      canScore: e.status === 'OPEN' && (await this.canScore(actor, id)),
    };
  }

  /** Every card with its questions, for printing (blank cards keep the passages already drawn). */
  async cards(actor: AuthUser, id: string) {
    const e = await this.get(actor, id);
    const questions = await this.prisma.evaluationQuestion.findMany({
      where: { candidate: { evaluationId: id, schoolId: actor.schoolId } },
      orderBy: { number: 'asc' },
      select: { candidateId: true, number: true, surahId: true, ayah: true, mistakes: true, note: true },
    });
    const byCandidate = new Map<string, typeof questions>();
    for (const q of questions) byCandidate.set(q.candidateId, [...(byCandidate.get(q.candidateId) ?? []), q]);
    return {
      evaluation: { id: e.id, title: e.title, kind: e.kind, date: e.date, location: e.location, status: e.status },
      branches: e.branches,
      jurors: e.jurors,
      cards: e.candidates.map((c) => ({
        candidate: c,
        questions: (byCandidate.get(c.id) ?? []).map(({ candidateId: _c, ...q }) => q),
      })),
    };
  }

  async saveCard(actor: AuthUser, id: string, candidateId: string, dto: CardDto) {
    const e = await this.visibleEvaluation(actor, id);
    if (e.status === 'CLOSED') throw conflict('EVALUATION_CLOSED');
    if (!(await this.canScore(actor, id))) throw new ApiError(HttpStatus.FORBIDDEN, 'NOT_A_JUROR');
    const db = this.prisma.forSchool(actor.schoolId);
    const c = await db.evaluationCandidate.findFirst({
      where: { id: candidateId, evaluationId: id },
      select: { id: true, absent: true, hifzScore: true, tajwidScore: true, notes: true, branch: true },
    });
    if (!c) throw notFound('EvaluationCandidate');

    const err = scoreError(c.branch, dto);
    if (err) throw invalid(err);
    const numbers = dto.questions.map((q) => q.number);
    if (new Set(numbers).size !== numbers.length || numbers.some((n) => n > c.branch.questionCount)) {
      throw invalid('QUESTION_NUMBER_INVALID', { max: c.branch.questionCount });
    }
    await this.assertAyahs(actor.schoolId, dto.questions);

    const questions = dto.questions.filter((q) => q.surahId !== null || q.mistakes || q.note);
    const filled = dto.absent || dto.hifzScore !== null;
    await db.$transaction(async (tx) => {
      await tx.evaluationCandidate.update({
        where: { id: candidateId },
        data: {
          absent: dto.absent,
          hifzScore: dto.hifzScore,
          tajwidScore: dto.tajwidScore,
          notes: dto.notes || null,
          scoredAt: filled ? new Date() : null,
          scoredById: filled ? actor.id : null,
        },
      });
      await tx.evaluationQuestion.deleteMany({ where: { candidateId } });
      await tx.evaluationQuestion.createMany({ data: questions.map((q) => ({ ...q, candidateId, mistakes: q.mistakes || null, note: q.note || null })) });
    });
    const { branch: _branch, ...before } = c;
    await this.audit.log(actor, 'EVALUATION_CARD_SAVE', 'EvaluationCandidate', candidateId, before, {
      absent: dto.absent,
      hifzScore: dto.hifzScore,
      tajwidScore: dto.tajwidScore,
      notes: dto.notes,
    });
    return this.card(actor, id, candidateId);
  }

  // ───────────── Results ─────────────

  async results(actor: AuthUser, id: string) {
    const e = await this.get(actor, id);
    const branches = e.branches.map((b) => {
      const rows = rankBranch(e.candidates.filter((c) => c.branchId === b.id));
      const scored = rows.filter((r) => r.state === 'SCORED');
      const sum = scored.reduce((acc, r) => acc.add(r.total!), new Prisma.Decimal(0));
      return {
        branch: b,
        rows,
        stats: {
          candidates: rows.length,
          scored: scored.length,
          absent: rows.filter((r) => r.state === 'ABSENT').length,
          pending: rows.filter((r) => r.state === 'PENDING').length,
          passed: b.passScore === null ? null : scored.filter((r) => r.passed).length,
          average: scored.length ? sum.div(scored.length).toDecimalPlaces(2) : null,
          best: scored[0]?.total ?? null,
        },
      };
    });
    return {
      evaluation: { id: e.id, title: e.title, kind: e.kind, date: e.date, location: e.location, status: e.status, class: e.class },
      jurors: e.jurors,
      branches,
    };
  }

  /** The student's exam and competition results, newest first (student profile). */
  async forStudent(actor: AuthUser, studentId: string) {
    const db = this.prisma.forSchool(actor.schoolId);
    if (!(await db.student.count({ where: { id: studentId } }))) throw notFound('Student');
    const rows = await db.evaluationCandidate.findMany({
      where: { studentId, evaluation: visibleTo(actor) },
      orderBy: { evaluation: { date: 'desc' } },
      select: {
        ...candidateSelect,
        branch: true,
        evaluation: { select: { id: true, title: true, kind: true, date: true, status: true } },
      },
    });
    return rows.map(({ branch, evaluation, ...c }) => ({
      evaluation,
      branch: { id: branch.id, name: branch.name, maxTotal: maxTotal(branch), passScore: branch.passScore },
      ...withResult(branch, c),
    }));
  }

  // ───────────── Guards & helpers ─────────────

  private async visibleEvaluation(actor: AuthUser, id: string) {
    const e = await this.prisma
      .forSchool(actor.schoolId)
      .evaluation.findFirst({ where: { AND: [{ id }, visibleTo(actor)] }, select: { id: true, title: true, kind: true, date: true, status: true } });
    if (!e) throw notFound('Evaluation');
    return e;
  }

  private async openEvaluation(actor: AuthUser, id: string) {
    const e = await this.visibleEvaluation(actor, id);
    if (e.status === 'CLOSED') throw conflict('EVALUATION_CLOSED');
    return e;
  }

  private async assertEvaluationInTx(tx: SchoolTx, id: string) {
    if (!(await tx.evaluation.count({ where: { id } }))) throw notFound('Evaluation');
  }

  /** Office staff, or a teacher listed on this evaluation's jury. */
  private async canScore(actor: AuthUser, id: string) {
    if (isOffice(actor)) return true;
    return (await this.prisma.evaluationJuror.count({ where: { evaluationId: id, teacher: { userId: actor.id, schoolId: actor.schoolId } } })) > 0;
  }

  // Child rows carry no schoolId: they are always reached through an evaluation checked above.
  private async branch(actor: AuthUser, evaluationId: string, branchId: string) {
    const b = await this.prisma.forSchool(actor.schoolId).evaluationBranch.findFirst({ where: { id: branchId, evaluationId } });
    if (!b) throw notFound('EvaluationBranch');
    return b;
  }

  private async candidate(actor: AuthUser, evaluationId: string, candidateId: string) {
    const c = await this.prisma.forSchool(actor.schoolId).evaluationCandidate.findFirst({ where: { id: candidateId, evaluationId } });
    if (!c) throw notFound('EvaluationCandidate');
    return c;
  }

  private async assertClass(actor: AuthUser, classId: string) {
    if (!(await this.prisma.forSchool(actor.schoolId).class.count({ where: { id: classId } }))) throw notFound('Class');
  }

  private async assertTeachers(actor: AuthUser, jurors: JurorDto[]) {
    if (jurors.filter((j) => j.isPresident).length > 1) throw invalid('ONE_JURY_PRESIDENT');
    const ids = [...new Set(jurors.map((j) => j.teacherId).filter((t): t is string => !!t))];
    if (!ids.length) return;
    const found = await this.prisma.forSchool(actor.schoolId).teacher.count({ where: { id: { in: ids } } });
    if (found !== ids.length) throw notFound('Teacher');
  }

  private assertUniqueNames(names: string[]) {
    if (new Set(names.map((n) => n.trim())).size !== names.length) throw invalid('BRANCH_NAME_DUPLICATE');
  }

  private assertScale(s: { hifzMax: Prisma.Decimal | string; tajwidMax: Prisma.Decimal | string; passScore: Prisma.Decimal | string | null }) {
    const total = maxTotal(s);
    if (total.lte(0)) throw invalid('BRANCH_SCALE_EMPTY');
    if (s.passScore !== null && new Prisma.Decimal(s.passScore).gt(total)) throw invalid('PASS_SCORE_ABOVE_MAX', { max: total });
  }

  /** Ayah numbers follow the school's default riwaya (Qalun counts differ from Hafs). */
  private async assertAyahs(schoolId: string, questions: CardDto['questions']) {
    for (const q of questions) if (q.ayah !== null && q.surahId === null) throw invalid('AYAH_WITHOUT_SURAH');
    const surahs = [...new Set(questions.filter((q) => q.ayah !== null).map((q) => q.surahId!))];
    if (!surahs.length) return;
    const riwaya = (await this.prisma.schoolSettings.findUnique({ where: { schoolId }, select: { defaultRiwaya: true } }))?.defaultRiwaya ?? 'QALUN';
    const counts = new Map(
      (await this.prisma.surahAyahCount.findMany({ where: { riwaya, surahId: { in: surahs } } })).map((r) => [r.surahId, r.ayahCount]),
    );
    for (const q of questions) {
      if (q.ayah === null) continue;
      const max = counts.get(q.surahId!);
      if (max !== undefined && q.ayah > max) throw invalid('AYAH_OUT_OF_RANGE', { surahId: q.surahId, max });
    }
  }
}
