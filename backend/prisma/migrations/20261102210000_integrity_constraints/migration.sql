-- Constraints Prisma cannot express (spec A7.1).

-- Partial unique indexes
CREATE UNIQUE INDEX "enrollments_one_active" ON "enrollments" ("studentId", "classId") WHERE "status" = 'ACTIVE';
CREATE UNIQUE INDEX "academic_years_one_current" ON "academic_years" ("schoolId") WHERE "isCurrent";
CREATE UNIQUE INDEX "class_teachers_one_main" ON "class_teachers" ("classId") WHERE "role" = 'MAIN';
CREATE UNIQUE INDEX "student_guardians_one_primary" ON "student_guardians" ("studentId") WHERE "isPrimary";

-- Checks
ALTER TABLE "users" ADD CONSTRAINT "users_login_chk" CHECK ("email" IS NOT NULL OR "phone" IS NOT NULL);
ALTER TABLE "charges" ADD CONSTRAINT "charges_amount_chk" CHECK ("amount" >= 0 AND "paidAmount" >= 0 AND "paidAmount" <= "amount");
ALTER TABLE "payments" ADD CONSTRAINT "payments_amount_chk" CHECK ("amount" > 0 AND "unallocatedAmount" >= 0 AND "unallocatedAmount" <= "amount");
ALTER TABLE "payments" ADD CONSTRAINT "payments_one_payer" CHECK (("payerGuardianId" IS NULL) <> ("payerStudentId" IS NULL));
ALTER TABLE "payment_allocations" ADD CONSTRAINT "alloc_amount_chk" CHECK ("amount" > 0);
ALTER TABLE "schedule_slots" ADD CONSTRAINT "slot_time_chk" CHECK ("startTime" < "endTime");
ALTER TABLE "quran_athman" ADD CONSTRAINT "thumn_range_chk" CHECK ("number" BETWEEN 1 AND 480 AND "hizb" BETWEEN 1 AND 60 AND "juz" BETWEEN 1 AND 30);
ALTER TABLE "hifz_entries" ADD CONSTRAINT "hifz_rating_chk" CHECK ("rating" IS NULL OR "rating" BETWEEN 1 AND 5);
