-- حفظ is now computed from the تنبيه / تصليح counts of each question; the final mark is stored.
ALTER TABLE "evaluation_questions"
  ADD COLUMN "tanbihCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "tashihCount" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "evaluation_candidates" ADD COLUMN "totalScore" DECIMAL(5,2);

-- Cards scored before this change keep their typed حفظ mark; only the total is filled in.
UPDATE "evaluation_candidates" SET "totalScore" = "hifzScore" + "tajwidScore" WHERE "hifzScore" IS NOT NULL;

-- Checks Prisma cannot express
ALTER TABLE "evaluation_questions" ADD CONSTRAINT "eval_question_counts_chk" CHECK (
  "tanbihCount" BETWEEN 0 AND 99 AND "tashihCount" BETWEEN 0 AND 99
);
ALTER TABLE "evaluation_candidates" ADD CONSTRAINT "eval_candidate_total_chk" CHECK (
  ("totalScore" IS NULL) = ("hifzScore" IS NULL)
  AND ("totalScore" IS NULL OR "totalScore" = "hifzScore" + "tajwidScore")
);
