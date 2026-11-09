-- CreateEnum
CREATE TYPE "EvaluationKind" AS ENUM ('EXAM', 'COMPETITION');

-- CreateEnum
CREATE TYPE "EvaluationStatus" AS ENUM ('OPEN', 'CLOSED');

-- CreateTable
CREATE TABLE "evaluations" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "academicYearId" TEXT,
    "classId" TEXT,
    "kind" "EvaluationKind" NOT NULL,
    "title" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "location" TEXT,
    "status" "EvaluationStatus" NOT NULL DEFAULT 'OPEN',
    "notes" TEXT,
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "evaluations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evaluation_branches" (
    "id" TEXT NOT NULL,
    "evaluationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "quranScope" TEXT,
    "questionCount" INTEGER NOT NULL DEFAULT 4,
    "hifzMax" DECIMAL(5,2) NOT NULL DEFAULT 14,
    "tajwidMax" DECIMAL(5,2) NOT NULL DEFAULT 6,
    "passScore" DECIMAL(5,2),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "evaluation_branches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evaluation_jurors" (
    "id" TEXT NOT NULL,
    "evaluationId" TEXT NOT NULL,
    "teacherId" TEXT,
    "name" TEXT NOT NULL,
    "isPresident" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "evaluation_jurors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evaluation_candidates" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "evaluationId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "studentId" TEXT,
    "fullName" TEXT NOT NULL,
    "gender" "Gender",
    "phone" TEXT,
    "absent" BOOLEAN NOT NULL DEFAULT false,
    "hifzScore" DECIMAL(5,2),
    "tajwidScore" DECIMAL(5,2),
    "notes" TEXT,
    "scoredAt" TIMESTAMP(3),
    "scoredById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "evaluation_candidates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evaluation_questions" (
    "id" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "surahId" INTEGER,
    "ayah" INTEGER,
    "mistakes" TEXT,
    "note" TEXT,

    CONSTRAINT "evaluation_questions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "evaluations_schoolId_date_idx" ON "evaluations"("schoolId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "evaluation_branches_evaluationId_name_key" ON "evaluation_branches"("evaluationId", "name");

-- CreateIndex
CREATE INDEX "evaluation_jurors_evaluationId_idx" ON "evaluation_jurors"("evaluationId");

-- CreateIndex
CREATE INDEX "evaluation_jurors_teacherId_idx" ON "evaluation_jurors"("teacherId");

-- CreateIndex
CREATE INDEX "evaluation_candidates_branchId_idx" ON "evaluation_candidates"("branchId");

-- CreateIndex
CREATE INDEX "evaluation_candidates_studentId_idx" ON "evaluation_candidates"("studentId");

-- CreateIndex
CREATE UNIQUE INDEX "evaluation_candidates_evaluationId_number_key" ON "evaluation_candidates"("evaluationId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "evaluation_candidates_evaluationId_studentId_key" ON "evaluation_candidates"("evaluationId", "studentId");

-- CreateIndex
CREATE UNIQUE INDEX "evaluation_questions_candidateId_number_key" ON "evaluation_questions"("candidateId", "number");

-- AddForeignKey
ALTER TABLE "evaluations" ADD CONSTRAINT "evaluations_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluations" ADD CONSTRAINT "evaluations_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "academic_years"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluations" ADD CONSTRAINT "evaluations_classId_fkey" FOREIGN KEY ("classId") REFERENCES "classes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluation_branches" ADD CONSTRAINT "evaluation_branches_evaluationId_fkey" FOREIGN KEY ("evaluationId") REFERENCES "evaluations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluation_jurors" ADD CONSTRAINT "evaluation_jurors_evaluationId_fkey" FOREIGN KEY ("evaluationId") REFERENCES "evaluations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluation_jurors" ADD CONSTRAINT "evaluation_jurors_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "teachers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluation_candidates" ADD CONSTRAINT "evaluation_candidates_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluation_candidates" ADD CONSTRAINT "evaluation_candidates_evaluationId_fkey" FOREIGN KEY ("evaluationId") REFERENCES "evaluations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluation_candidates" ADD CONSTRAINT "evaluation_candidates_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "evaluation_branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluation_candidates" ADD CONSTRAINT "evaluation_candidates_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluation_candidates" ADD CONSTRAINT "evaluation_candidates_scoredById_fkey" FOREIGN KEY ("scoredById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluation_questions" ADD CONSTRAINT "evaluation_questions_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "evaluation_candidates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluation_questions" ADD CONSTRAINT "evaluation_questions_surahId_fkey" FOREIGN KEY ("surahId") REFERENCES "surahs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Checks Prisma cannot express
ALTER TABLE "evaluation_branches" ADD CONSTRAINT "eval_branch_scale_chk" CHECK (
  "questionCount" BETWEEN 1 AND 20
  AND "hifzMax" >= 0 AND "tajwidMax" >= 0 AND "hifzMax" + "tajwidMax" > 0
  AND ("passScore" IS NULL OR "passScore" BETWEEN 0 AND "hifzMax" + "tajwidMax")
);
ALTER TABLE "evaluation_candidates" ADD CONSTRAINT "eval_candidate_scores_chk" CHECK (
  ("hifzScore" IS NULL) = ("tajwidScore" IS NULL)
  AND ("hifzScore" IS NULL OR ("hifzScore" >= 0 AND "tajwidScore" >= 0))
  AND (NOT "absent" OR "hifzScore" IS NULL)
  AND "number" >= 1
);
ALTER TABLE "evaluation_questions" ADD CONSTRAINT "eval_question_chk" CHECK (
  "number" >= 1 AND ("ayah" IS NULL OR ("ayah" >= 1 AND "surahId" IS NOT NULL))
);
