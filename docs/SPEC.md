# Quranic School Management System — Spec v3
## نظام إدارة مدارس تحفيظ القرآن الكريم

> **How to use this document with an AI IDE (Antigravity, Cursor, Claude Code…)**
> - Keep **Part A (Spec)** permanently in context — it is the source of truth.
> - Execute **Part B (Build Slices)** one slice per session. Each slice ends with
>   a migration, passing tests and a working screen. Do **not** ask the IDE to
>   generate the whole codebase at once — that is the main reason v2 would fail.
> - When a slice contradicts Part A, Part A wins; update Part A first, then code.

---

# PART A — SPECIFICATION

## A1. Context & decisions (from stakeholder interview, 2026-11-02)

| Topic | Decision | Changed vs v2 |
|---|---|---|
| Customer | **One real school first.** Multi-school is "maybe later". | Keep `schoolId` columns, drop subdomain/tenant-resolution work |
| Size | **200–1000 students**, staff on desktop + teachers on phones | Mobile-first screens for teacher flows |
| Students | Children (4–15), teens and adults; **some classes gender-separated** | New: class `audience` + `genderPolicy`; adults need no guardian |
| Hifz tracking | **Hizb/thumn (60 × 8 = 480)**, but entry may also be by surah or ayah range | Replaced per-surah model with ayah-range log + thumn coverage |
| Hifz log | **New memorization (sabaq) + revision (muraja'a) + riwaya** per student | New `HifzSession`/`HifzEntry`; riwaya-aware Quran reference data |
| Fees | **Flat monthly fee + one-off fees.** No discounts in v1 | Charge/Payment ledger; per-enrollment fee override kept as an escape hatch |
| Parent comms | **WhatsApp, free tools only, no credit card** | `wa.me` click-to-send links; no email/SMS in v1 |
| Parent portal | **Not in v1.** A **public front page with news** instead | `(parent)` routes removed; public site + news CMS added |
| MVP | **Students + classes, Payments + receipts, Hifz, Attendance** | Exams moved to Phase 2 |
| Language | **Arabic only in v1**, i18n-ready for French | `fr.json` deferred |
| Data import | **Existing Excel / Google Sheets** | New import wizard |
| Hosting | **Single VPS + Docker** | Caddy (HTTPS), backups, 5 containers |
| Stack changes accepted | **pg-boss** (no Redis/BullMQ), **Gotenberg** (Arabic PDF), **httpOnly cookie sessions** | See A2 |
| Versions | Latest stable at scaffold time | See A2 |
| Overpayment (schema review) | **Kept as family credit**, auto-applied to next charges | `Payment.unallocatedAmount`, `PaymentAllocation.fromCredit` |
| Class teachers (schema review) | **Main + assistant teachers** per class | `ClassTeacher` join table |
| Guardian phone (schema review) | **Duplicates allowed, UI warns** | Phone index, not unique |
| Teacher data (schema review) | **Ijazas, hire date/contract/salary, teachers without login** | `Teacher` separate from `User`, `TeacherIjaza` |
| Fees (Facebook review) | **Depends on the imla'**: some free, some monthly; plus **annual membership** (20 TND in 2026-2027) | `Class.monthlyFee` null = free; `Membership` + `MEMBERSHIP` charges |
| Programs | **Quran imla'at only in v1** (literacy & preachers' course stay on paper) | — |
| Association | **Membership register** in v1; donations & governance later | `Membership` model |
| Mawlid competition | **Phase 2, with exams** | Backlog |

### A1.1 Context from the school's Facebook page (الجمعية القرآنية بسليمان الفرقان)
- The school is the **local branch of a Quranic association** in Soliman
  (الفرع المحلّي للقرآن الكريم الفرقان بسليمان), seat on Avenue de l'Environnement
  opposite Jami' an-Nour. It holds elective general assemblies and collects an
  **annual membership fee** (20 TND for 2026-2027, window 1 Nov – 30 Jan, new members
  fill a membership form). Receipts carry the **association's** identity.
- Classes run in **several venues** (association seat, Jami' Gaza – Hay Ennaifer…).
- A class is an **imla'** organised around a portion of the Quran (e.g. Al-Baqarah +
  Aal Imran for women, 3 sessions/week: Monday 10–12 revision, Wednesday & Friday after
  'Asr memorization). Some times are prayer-based ("بعد العصر").
- Typical announcements: session added, teacher absent tomorrow, imla' resumes,
  children's Saturday imla' (parents register names at the office), membership
  campaign, general assembly, condolences, thanks to volunteers. These drive the
  news categories and WhatsApp class announcements.
- The annual **Mawlid competition** (3 local editions) has categories by number of
  ahzab (60, 45, …), a jury, and honours sheikhs — confirms hizb as the unit.
- Other programs exist (literacy, preachers' training) but are **out of v1**.

### A1.2 Glossary (use these words in the UI)
| Term | Meaning | In the app |
|---|---|---|
| إملاء (imla') | A Quran class/circle with its weekly sessions | `Class` — UI label **"الإملاء"**, not "الصف" |
| حصّة | One session of an imla' | `ClassSession` |
| تحفيظ / مراجعة | Memorization session / revision session | `ScheduleSlot.kind` |
| المؤدّب / المؤدّبة | The teacher of an imla' | `ClassTeacher.role = MAIN` |
| الشيخ المشرف | Sheikh supervising one or more imla'at | `ClassTeacher.role = SUPERVISOR` |
| المؤدّبة الطالبة | A student who also teaches | `Teacher.studentId` |
| المنخرط / الانخراط | Association member / annual membership | `Membership` |
| كتابة الجمعية | The association's office (secretariat) | `STAFF` role |

## A2. Tech stack

Use the **latest stable** release of each at scaffold time and pin exact versions
in the lockfile. Expected majors as of Nov 2026 shown — verify before scaffolding.

```
Runtime        Node.js 24 LTS
Backend        NestJS 11            REST API, modular
ORM            Prisma 7             Pin prisma@7 — `latest` tag points to 8.0 RC (Nov 2026). Schema validated on 7.10.1
Database       PostgreSQL 18
Jobs           pg-boss              Queue + cron stored in Postgres (replaces Redis/BullMQ)
PDF            Gotenberg 8          HTML → PDF via Chromium; correct Arabic shaping & RTL
Validation     Zod + nestjs-zod     Backend DTOs + Swagger; Zod also in frontend forms
Auth           argon2id + JWT in httpOnly cookies (access 15 min, rotating refresh 30 d)
Frontend       Next.js 16           App Router, React 19, TypeScript strict
UI             Tailwind CSS 4       Logical utilities (ms-/me-/ps-/pe-/start-/end-) — no RTL plugin
Components     shadcn/ui            Wrap app in Radix DirectionProvider dir="rtl"
i18n           next-intl            ar only in v1; fr later
Forms/Data     React Hook Form + Zod, TanStack Query, TanStack Table
Charts         Recharts
Rich text      Tiptap               News editor (RTL)
Excel import   exceljs              .xlsx parse + template generation
Phones         libphonenumber-js    Store E.164 (+216…); build wa.me links
Reverse proxy  Caddy 2              Auto HTTPS, routes /api → backend, rest → frontend
Tests          Jest (backend unit + e2e on real Postgres), Playwright (critical flows)
CI             GitHub Actions       lint, type-check, test, build images
```

**Removed from v2:** Redis, BullMQ, Redis Commander, pgAdmin, Prisma Studio container,
pdf-lib, Nodemailer/Handlebars, class-validator, `tailwindcss-rtl`, localStorage JWT.

## A3. Users & roles (v1)

| Role | Who | Can |
|---|---|---|
| `ADMIN` | Director / owner | Everything, incl. settings, users, voiding receipts, audit log |
| `STAFF` | Secretary / accountant | Students, guardians, enrollments, payments, imports, news, WhatsApp messages |
| `TEACHER` | Teachers | **Only imla'at where they are MAIN, ASSISTANT or SUPERVISOR:** attendance, hifz log, view their students |

Parents and students have **no login in v1**. `PARENT` role is reserved for Phase 2.

**Teachers vs users:** a `Teacher` is a person who teaches; a `User` is a login.
A teacher may have no login (e.g. an elderly sheikh) — STAFF then records
attendance and hifz **on their behalf** (`teacher` = who taught/listened,
`recordedBy`/`markedBy` = who typed it). Teacher contract type and salary are
visible to ADMIN only. Ijazas are stored with an optional scanned certificate.

## A4. Domain rules

### Students, guardians, classes
- A **student** may be a child or an adult. A **guardian** is required only if the
  student is under 18 (configurable). Adults use their own phone.
- **Guardians are shared** between siblings (many-to-many). When adding a student,
  typing a phone shows existing guardians with that phone ("هذا الرقم مسجّل لـ…")
  and offers to link instead of creating. Phones are **not unique** (parents
  often share one phone, or one phone serves two families) — the UI warns, it
  does not block.
- One guardian per student is `isPrimary` (receives WhatsApp messages) and one is
  `isPayer` (default: same).
- A **class** belongs to an academic year and has `audience` (CHILDREN/TEENS/ADULTS),
  `genderPolicy` (MIXED/MALE_ONLY/FEMALE_ONLY), **one MAIN teacher and optional
  ASSISTANT teachers**, optional room, optional riwaya and a monthly fee. A class
  session records who actually taught it (substitutes allowed).
- An **enrollment** links a student to a class with start/end dates. A student can
  be enrolled in several classes (e.g. an adult in hifz + tajweed). Enrolling a
  student in a class that violates `genderPolicy` is rejected; exceeding capacity
  shows a warning (ADMIN can override).
- **Student code** `YYYY-NNNN` (year of first enrollment, per-school counter) is
  generated atomically (see A6). Codes are never reused.
- Students are never hard-deleted: status `LEFT` / `GRADUATED` / `INACTIVE`.
- An imla' has an optional **Quran scope** (free text, e.g. "سورة البقرة وآل عمران"),
  weekly **schedule slots** typed as memorization or revision, and an optional
  `timeLabel` for prayer-based times ("بعد العصر"); `startTime` stays for sorting.
- Rooms belong to **venues**; the public site lists public venues with a map.
- A **supervising sheikh** sees all imla'at he supervises (same access as MAIN).
- A teacher can also be a student (`Teacher.studentId`); their own hifz is tracked
  like any other student.

### Membership (الانخراط)
- Each academic year can define a `membershipFee` and a campaign window
  (e.g. 1 Nov – 30 Jan). `null` fee = no membership that year.
- Registering a membership creates a `Membership` (member number from the counter
  `member:<year>`, new vs renewal, form received for new members) **and** a
  `MEMBERSHIP` charge paid through the normal payment flow (same receipts, credit,
  WhatsApp share).
- Imla'at with `requiresMembership = true` show a badge on students without a paid
  membership for the current year (warning only, never blocks attendance).
- Membership page: members per year, paid/unpaid, new vs renewals, a one-by-one
  WhatsApp reminder runner during the window (`MEMBERSHIP_REMINDER`), printable
  member list for the general assembly.
- v1 covers members who are students (children's memberships are paid by the payer
  guardian). Non-student members (supporters, board) are an open question.

### Attendance
- Attendance is per **class session** (a class can meet several times per day/week).
- Sessions come from the class **schedule slots**; the session for "today" is
  created on demand when the teacher opens the class. Ad-hoc sessions allowed.
- Teacher flow (phone): open class → everyone defaults to PRESENT → tap the absent/late
  ones → save. Must take < 30 s for 25 students.
- Statuses: PRESENT, ABSENT, LATE, EXCUSED.
- Staff can send a WhatsApp absence message to the primary guardian (click-to-send).
- **Cancelling a session** (e.g. "تغيّب المؤدّبة") requires a reason, excludes it
  from attendance stats, and offers a **class announcement**: the app prepares the
  Arabic text ("تتغيّب المؤدّبة … عن إملاء يوم … وتستأنف يوم …"), lets staff copy it
  to the imla' WhatsApp group and/or publish it as a news post linked to the class.

### Fees & payments
- **Charges** are what is owed; **payments** are money received; **allocations**
  link them. This supports paying several months, several siblings, or part of a
  month in one receipt without special cases.
- **Monthly charges** are generated by a pg-boss cron on `billingDay` (default 1st)
  for every active enrollment whose class has a fee (or whose enrollment has a
  `monthlyFeeOverride`; `0` = free place). Many imla'at are **free**
  (`monthlyFee` null or 0) and never generate charges. Generation is **idempotent**
  (`@@unique([enrollmentId, period])`). Billable months are configured per academic
  year (default Sep–Jun). Staff can also trigger generation manually for a month.
- **One-off charges** (registration, books, exam, trip…) are created from a
  `FeeItem` catalog, per student or in bulk for a class.
- Charge state is derived: `OPEN` with `paidAmount = 0` → unpaid; `0 < paidAmount < amount`
  → partial; `dueDate < today` and not fully paid → overdue; `PAID`; `CANCELLED`.
- **Recording a payment:** pick a student or a **family** (guardian) → list open
  charges oldest first → enter amount → auto-allocate oldest first (editable) →
  save → receipt. The payer is either a guardian (family) or an adult student.
- **Family credit:** if the amount exceeds the open charges, the remainder stays on
  the payment as `unallocatedAmount` (= credit of that payer). The receipt shows
  "رصيد دائن: X". Whenever new charges are created (monthly job or one-off) for a
  student whose payer has credit, the credit is **auto-applied** oldest payment
  first (`fromCredit = true`, no new receipt). Family credit balance =
  Σ `unallocatedAmount` of the payer's non-voided payments, shown on the family
  and student pages. Cash refunds are out of scope in v1 (void + re-record).
- **Receipts** are numbered `YYYY-NNNNN` per school per calendar year, gap-free,
  generated inside the same DB transaction as the payment (see A6).
- Payments are **never deleted or edited**. ADMIN can **void** with a mandatory
  reason; all its allocations (including later credit applications) are reversed
  and the affected charges reopen; the receipt number stays (marked void).
- Every receipt has a random `publicToken`; `GET /r/:token` serves the PDF without
  login so it can be shared on WhatsApp. Tokens are unguessable (≥ 128 bits).
- Amounts: `Decimal(10,3)` (TND has millimes). Never use JS floats for money —
  use `Prisma.Decimal` end-to-end and format on the frontend.
- Payment methods: CASH, BANK_TRANSFER, CHECK, MOBILE (D17/Flouci…), OTHER.

### Hifz (memorization)
- Each student has a **riwaya** (default from class, then school; Tunisia default
  **QALUN**). Ayah numbering and thumn boundaries depend on riwaya.
- Quran reference data (seeded, read-only, not tenant-scoped):
  - `Surah` (114): Arabic name.
  - `SurahAyahCount` (riwaya × 114): ayah count in that riwaya's numbering.
  - `QuranThumn` (riwaya × 480): number 1–480, hizb 1–60, juz 1–30, start surah:ayah.
  - Derived at load time: **global ayah index** per riwaya (1…N) to turn any
    surah:ayah into a single integer.
- A **hifz session** = one student, one teacher, one date, with 1..n **entries**:
  - `NEW` — sabaq (new memorization)
  - `RECENT_REVISION` — revision of recent portions
  - `OLD_REVISION` — revision of older portions
  - `INITIAL_LEVEL` — used once at import/onboarding to record prior memorization
- Each entry stores a range `from surah:ayah → to surah:ayah` plus the computed
  global indexes and thumn indexes. The teacher can **enter the range three ways**,
  all normalised to the same range:
  1. by **hizb/thumn** (e.g. "hizb 58, thumn 3 → thumn 5"),
  2. by **surah** (whole surah or surahs),
  3. by **ayah range**.
- Optional per entry: `rating` (1–5) and free-text note (not required in v1).
- Ranges may go in either direction (kuttab children usually go from An-Nas
  backwards). Coverage is computed by **merging intervals** of `NEW` + `INITIAL_LEVEL`
  entries; a thumn counts as memorized when fully covered.
- After each save, recompute and store `StudentHifzSummary` (memorized ayahs,
  memorized athman, completed ahzab, last NEW date, last revision date, current
  position). Lists and dashboards read the summary, never recompute on the fly.
- Views: **60-hizb grid** per student (each hizb shows 8 thumn cells: memorized /
  partial / not), class overview (students × progress bar + days since last sabaq),
  student timeline of sessions.
- ⚠ **Data prerequisite:** the riwaya-specific ayah counts and thumn boundaries must
  come from a trusted digital mushaf dataset and be **verified by the school's
  sheikh** before Phase 4. Provide them as versioned JSON in `backend/prisma/data/`.

### WhatsApp (free, no API)
- All messages are **click-to-send**: the app builds
  `https://wa.me/<digits>?text=<urlencoded>` and opens it; staff press Send in
  WhatsApp (desktop app/web or phone).
- Message templates are editable in Settings (Arabic, placeholders like
  `{{studentName}}`, `{{amount}}`, `{{month}}`, `{{receiptUrl}}`).
- Use cases v1: receipt share, overdue reminder, absence notice, membership
  reminder, class announcement (copied to the imla' WhatsApp group), custom message.
- **Reminder runner:** the overdue page offers "send reminders one by one" — the
  next family opens automatically after staff returns to the tab. Each prepared
  message is logged in `MessageLog` (we cannot confirm delivery).
- Do **not** use unofficial automation libraries (Baileys, whatsapp-web.js):
  against WhatsApp ToS and the school number can be banned.

### Public website
- Public routes at `/` (SSR/ISR, SEO): home (hero, latest news), news list
  (filter by category), news detail, about, **weekly imla' schedule** (public
  imla'at: name, Quran scope, audience/gender, days, times or time label, venue,
  teacher title + name — as already published on Facebook; no student data),
  venues with maps, membership info (fee, window, how to join), contact
  (phone, WhatsApp link).
- News: STAFF/ADMIN write posts in Tiptap with cover image; DRAFT/PUBLISHED;
  categories إعلام / نشاط / شكر و تقدير / تعزية / الجمعية; optional link to an imla'.
- Each published post gets a **"share on Facebook"** link (facebook.com/sharer)
  and a "copy for WhatsApp" button, so the website does not add work for whoever
  runs the Facebook page.
- No student data is ever exposed publicly. No public forms in v1 (avoid spam);
  "register interest" = WhatsApp link.

### Excel import
- Downloadable **template .xlsx** (Arabic headers) for students + guardians +
  class + initial hifz level + opening balance.
- Wizard: upload → column mapping (auto-matched) → **dry run** with per-row errors
  (invalid phone, unknown class, gender policy violation, duplicate) → commit in
  one transaction → summary report. Re-running the same file must not duplicate
  (match on student code if present, else name + date of birth + guardian phone).
- Guardians matched on phone **+ normalised name** (same phone, same name → reuse).
  Same phone with a different name is **flagged in the dry-run** for staff to choose
  "same family" or "new guardian". Teachers can be imported too (no login created).
  Opening balances become one-off charges
  labelled "رصيد سابق".

## A5. Non-functional requirements
- **RTL & Arabic first:** `<html lang="ar" dir="rtl">`, only logical Tailwind
  utilities, numbers shown with Western digits (configurable), dates `dd/MM/yyyy`
  with optional Hijri display (`Intl.DateTimeFormat('ar-TN-u-ca-islamic')`).
- **No hardcoded UI strings** — everything in `messages/ar.json`.
- **API errors** return `{ code: 'STUDENT_NOT_FOUND', params? }`; the frontend
  translates. (v2's "Arabic error messages from the API" blocks French later.)
- **Mobile-first** for teacher screens (attendance, hifz log): usable at 360 px,
  big tap targets, PWA manifest so teachers can "install" it. Offline is out of scope.
- **Performance:** lists paginated server-side; p95 API < 300 ms at 1000 students.
- **Security:** argon2id; login rate limit (5/min/IP, @nestjs/throttler in-memory);
  cookies `HttpOnly; Secure; SameSite=Lax`; mutating requests require
  `X-Requested-With` header (CSRF defence); first login forces password change;
  no default passwords in production seed (admin password from env).
- **Privacy (Tunisian law 2004-63, minors' data):** photo upload only with
  `photoConsent = true`; minimal fields required; uploads served through an
  authenticated endpoint, not a public folder; audit log on student/payment changes.
- **Audit log:** create/update/void on Student, Guardian, Enrollment, Charge,
  Payment, User, Settings — with old/new values and user.
- **Backups:** nightly `pg_dump` + uploads archive → `rclone` to Google Drive
  (free, no card); keep 14 daily + 8 weekly; **monthly restore test** documented.
- **Observability:** structured JSON logs (pino); `/api/health` endpoint; external
  uptime ping (UptimeRobot free) — optional.

## A6. Key technical patterns

### Tenant scoping (single school, multi-school-ready)
- Every **root** table has `schoolId`. Child tables (`Attendance`, `HifzEntry`,
  `PaymentAllocation`, `StudentGuardian`) are only accessed through their parent.
- `schoolId` comes from the authenticated user (never from the request body).
- A Prisma client extension `forSchool(schoolId)` injects `schoolId` into
  **all** operations of tenant models: `findMany/findFirst/findUnique` (→ convert to
  `findFirst`), `count`, `aggregate`, `groupBy`, `create/createMany` (data),
  `update/updateMany/delete/deleteMany/upsert` (where). Services **must** use it;
  a lint rule or code review check forbids raw `this.prisma.<tenantModel>` in services.
- A unit test enumerates Prisma models and fails if a root model lacks `schoolId`.
- Uniqueness is per school: `@@unique([schoolId, code])`, `@@unique([schoolId, email])`.

### Atomic gap-free counters (student code, receipt number)
```ts
// inside prisma.$transaction(async (tx) => { ... })
const [{ value }] = await tx.$queryRaw<{ value: number }[]>`
  INSERT INTO counters ("schoolId", "key", "value") VALUES (${schoolId}, ${key}, 1)
  ON CONFLICT ("schoolId", "key") DO UPDATE SET "value" = counters."value" + 1
  RETURNING "value"`;
// key examples: 'receipt:2026', 'student:2026'
```
The row lock serialises concurrent payments; a rolled-back transaction rolls back
the increment, so receipt numbers have no gaps. The year in the key is taken from
`paidAt` **converted to the school timezone** (a payment at 00:30 on 1 January in
Tunis belongs to the new year).

### Auth flow
- `POST /api/auth/login` → sets `access_token` (15 min) and `refresh_token`
  (30 d, `Path=/api/auth`) cookies. Refresh tokens are stored **hashed** and
  rotated on every use; reuse of a revoked token revokes the whole family.
- Next.js `middleware.ts` checks cookie presence to redirect to `/login`
  (locale-aware); the API is the real authority.
- Same origin via Caddy (`school.tn/api/*` → backend), so no CORS in production.

### PDFs
- Templates are React/HTML rendered server-side to an HTML string (Arabic font
  embedded, e.g. Cairo / IBM Plex Sans Arabic as base64 @font-face), POSTed to
  Gotenberg `/forms/chromium/convert/html`, result stored under
  `uploads/receipts/<schoolId>/<receiptNumber>.pdf`.
- Receipt PDF is generated synchronously on payment save (Gotenberg ~300 ms) —
  no queue needed. Bulk reports (class hifz report) go through pg-boss.

### Jobs (pg-boss)
| Job | Trigger |
|---|---|
| `charges.generate-monthly` | cron `0 6 <billingDay> * *` Africa/Tunis + manual |
| `import.process` | after import commit (large files) |
| `hifz.recompute-summary` | after hifz save / bulk import |
| `reports.class-hifz-pdf` | on demand |

## A7. Prisma schema (v3.1 — reviewed 2026-11-02)

Conventions: UUIDv7 ids (`@default(uuid(7))`, time-ordered); camelCase columns
(quote them in raw SQL); every root table has a real FK to `School`; every
"who did it" column is a real FK to `User`; nothing is hard-deleted except
child rows through `onDelete: Cascade`.

```prisma
generator client {
  provider = "prisma-client"
  output   = "../src/generated/prisma"
}

datasource db {
  provider = "postgresql"
  // URL configured in prisma.config.ts
}

// ───────────── Enums ─────────────
enum UserRole { // PARENT reserved for Phase 2
  ADMIN
  STAFF
  TEACHER
}

enum Gender {
  MALE
  FEMALE
}

enum Audience {
  CHILDREN
  TEENS
  ADULTS
}

enum GenderPolicy {
  MIXED
  MALE_ONLY
  FEMALE_ONLY
}

enum StudentStatus {
  ACTIVE
  INACTIVE
  GRADUATED
  LEFT
}

enum EnrollmentStatus {
  ACTIVE
  ENDED
}

enum Riwaya {
  QALUN
  WARSH
  HAFS
}

enum GuardianRelation {
  FATHER
  MOTHER
  BROTHER
  SISTER
  GRANDPARENT
  UNCLE
  AUNT
  OTHER
}

enum TeachingRole {
  MAIN                                   // المؤدّب(ة)
  ASSISTANT
  SUPERVISOR                             // الشيخ المشرف
}

enum ContractType {
  VOLUNTEER
  PAID
}

enum DayOfWeek {
  SATURDAY
  SUNDAY
  MONDAY
  TUESDAY
  WEDNESDAY
  THURSDAY
  FRIDAY
}

enum SessionStatus {
  HELD
  CANCELLED
}

enum AttendanceStatus {
  PRESENT
  ABSENT
  LATE
  EXCUSED
}

enum ChargeKind {
  MONTHLY
  ONE_OFF
  MEMBERSHIP                             // معلوم الانخراط السنوي
}

enum ChargeStatus {
  OPEN
  PAID
  CANCELLED
}

enum PaymentMethod {
  CASH
  BANK_TRANSFER
  CHECK
  MOBILE
  OTHER
}

enum HifzEntryType {
  NEW
  RECENT_REVISION
  OLD_REVISION
  INITIAL_LEVEL
}

enum NewsStatus {
  DRAFT
  PUBLISHED
}

enum MessageKind {
  RECEIPT
  PAYMENT_REMINDER
  ABSENCE
  CLASS_ANNOUNCEMENT                     // teacher absent, session moved/added
  MEMBERSHIP_REMINDER
  CUSTOM
}

enum ImportStatus {
  UPLOADED
  VALIDATED
  COMMITTED
  FAILED
}

enum SlotKind {
  MEMORIZATION                           // تحفيظ
  REVISION                               // مراجعة
  MIXED
}

enum NewsCategory {
  ANNOUNCEMENT                           // إعلام
  ACTIVITY                               // نشاط / فعاليات
  THANKS                                 // شكر و تقدير
  CONDOLENCE                             // تعزية
  ASSOCIATION                            // جلسة عامة، انخراط
}

// ───────────── School ─────────────
model School {
  id        String   @id @default(uuid(7))
  name      String                       // Arabic
  nameLatin String?
  slug      String   @unique
  phone     String?
  address   String?
  logoUrl   String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  settings      SchoolSettings?
  academicYears AcademicYear[]
  users         User[]
  teachers      Teacher[]
  guardians     Guardian[]
  students      Student[]
  venues        Venue[]
  rooms         Room[]
  classes       Class[]
  memberships   Membership[]
  enrollments   Enrollment[]
  classSessions ClassSession[]
  feeItems      FeeItem[]
  charges       Charge[]
  payments      Payment[]
  counters      Counter[]
  hifzSessions  HifzSession[]
  messageLogs   MessageLog[]
  newsPosts     NewsPost[]
  importJobs    ImportJob[]
  auditLogs     AuditLog[]
  @@map("schools")
}

model SchoolSettings {
  schoolId                 String   @id
  school                   School   @relation(fields: [schoolId], references: [id], onDelete: Cascade)
  currency                 String   @default("TND")
  timezone                 String   @default("Africa/Tunis")
  defaultRiwaya            Riwaya   @default(QALUN)
  guardianRequiredUnderAge Int      @default(18)
  billingDay               Int      @default(1)
  paymentDueDays           Int      @default(10)
  receiptFooter            String?
  whatsappTemplates        Json                 // { RECEIPT: "...", PAYMENT_REMINDER: "...", ... }
  aboutHtml                String?
  contactPhone             String?
  whatsappPhone            String?
  mapEmbedUrl              String?
  socialLinks              Json?
  showHijriDates           Boolean  @default(true)
  updatedAt                DateTime @updatedAt
  @@map("school_settings")
}

model AcademicYear {
  id             String   @id @default(uuid(7))
  schoolId       String
  school         School   @relation(fields: [schoolId], references: [id])
  name           String                   // "2026-2027"
  startDate      DateTime @db.Date
  endDate        DateTime @db.Date
  billableMonths Int[]                    // e.g. [9,10,11,12,1,2,3,4,5,6]
  isCurrent      Boolean  @default(false) // one per school (partial unique index)
  membershipFee         Decimal?  @db.Decimal(10, 3)  // e.g. 20.000 TND; null = no membership this year
  membershipWindowStart DateTime? @db.Date            // e.g. 2026-11-01
  membershipWindowEnd   DateTime? @db.Date            // e.g. 2027-01-30
  classes        Class[]
  memberships    Membership[]
  @@unique([schoolId, name])
  @@map("academic_years")
}

// ───────────── Users & auth ─────────────
model User {
  id                 String    @id @default(uuid(7))
  schoolId           String
  school             School    @relation(fields: [schoolId], references: [id])
  email              String?
  phone              String?                // E.164; email OR phone required (CHECK)
  passwordHash       String
  role               UserRole
  firstName          String
  lastName           String
  isActive           Boolean   @default(true)
  mustChangePassword Boolean   @default(true)
  lastLoginAt        DateTime?
  createdAt          DateTime  @default(now())
  updatedAt          DateTime  @updatedAt

  teacher            Teacher?               // set when role = TEACHER
  refreshTokens      RefreshToken[]
  paymentsReceived   Payment[]     @relation("PaymentReceivedBy")
  paymentsVoided     Payment[]     @relation("PaymentVoidedBy")
  attendanceMarked   Attendance[]
  hifzRecorded       HifzSession[] @relation("HifzRecordedBy")
  messagesPrepared   MessageLog[]
  newsPosts          NewsPost[]
  importJobs         ImportJob[]
  auditLogs          AuditLog[]
  @@unique([schoolId, email])
  @@unique([schoolId, phone])
  @@map("users")
}

model RefreshToken {
  id        String    @id @default(uuid(7))
  userId    String
  user      User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  familyId  String
  tokenHash String    @unique
  expiresAt DateTime
  revokedAt DateTime?
  userAgent String?
  createdAt DateTime  @default(now())
  @@index([userId])
  @@map("refresh_tokens")
}

// ───────────── Teachers (may exist without a login) ─────────────
model Teacher {
  id             String        @id @default(uuid(7))
  schoolId       String
  school         School        @relation(fields: [schoolId], references: [id])
  userId         String?       @unique   // null = teacher without login
  user           User?         @relation(fields: [userId], references: [id])
  studentId      String?       @unique   // "المؤدّبة الطالبة": a student who also teaches
  student        Student?      @relation(fields: [studentId], references: [id])
  title          String?                 // display title: مؤدّب، مؤدّبة، الشيخ، الأستاذة
  firstName      String
  lastName       String
  gender         Gender
  phone          String?
  specialization String?                 // حفظ، تجويد، كلاهما
  hireDate       DateTime?     @db.Date
  contractType   ContractType  @default(VOLUNTEER)
  monthlySalary  Decimal?      @db.Decimal(10, 3)   // ADMIN-only field
  isActive       Boolean       @default(true)
  notes          String?
  createdAt      DateTime      @default(now())
  updatedAt      DateTime      @updatedAt

  ijazas         TeacherIjaza[]
  classes        ClassTeacher[]
  classSessions  ClassSession[]
  hifzSessions   HifzSession[]
  @@index([schoolId, isActive])
  @@map("teachers")
}

model TeacherIjaza {
  id          String  @id @default(uuid(7))
  teacherId   String
  teacher     Teacher @relation(fields: [teacherId], references: [id], onDelete: Cascade)
  title       String                     // "إجازة في رواية قالون عن نافع"
  riwaya      Riwaya?
  grantedBy   String?                    // sheikh / institution
  year        Int?
  documentUrl String?                    // scanned certificate (authenticated download)
  @@index([teacherId])
  @@map("teacher_ijazas")
}

// ───────────── Students & guardians ─────────────
model Guardian {
  id        String   @id @default(uuid(7))
  schoolId  String
  school    School   @relation(fields: [schoolId], references: [id])
  fullName  String
  phone     String                       // E.164 — NOT unique: shared phones allowed, UI warns
  phone2    String?
  notes     String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  students  StudentGuardian[]
  payments  Payment[]                    // as payer → family credit lives here
  @@index([schoolId, phone])
  @@index([schoolId, fullName])
  @@map("guardians")
}

model StudentGuardian {
  studentId  String
  student    Student          @relation(fields: [studentId], references: [id], onDelete: Cascade)
  guardianId String
  guardian   Guardian         @relation(fields: [guardianId], references: [id], onDelete: Restrict)
  relation   GuardianRelation
  isPrimary  Boolean          @default(false)  // one per student (partial unique index)
  isPayer    Boolean          @default(false)
  @@id([studentId, guardianId])
  @@index([guardianId])
  @@map("student_guardians")
}

model Student {
  id             String        @id @default(uuid(7))
  schoolId       String
  school         School        @relation(fields: [schoolId], references: [id])
  code           String                    // "2026-0042"
  firstName      String
  lastName       String
  firstNameLatin String?
  lastNameLatin  String?
  gender         Gender
  dateOfBirth    DateTime?     @db.Date
  phone          String?                   // adults
  address        String?
  riwaya         Riwaya?                   // null → class → school default
  status         StudentStatus @default(ACTIVE)
  photoUrl       String?
  photoConsent   Boolean       @default(false)
  notes          String?
  joinedAt       DateTime      @default(now()) @db.Date
  createdAt      DateTime      @default(now())
  updatedAt      DateTime      @updatedAt

  guardians      StudentGuardian[]
  enrollments    Enrollment[]
  attendance     Attendance[]
  charges        Charge[]
  payments       Payment[]                 // as payer (adult students) → own credit
  hifzSessions   HifzSession[]
  hifzSummary    StudentHifzSummary?
  memberships    Membership[]
  teacherProfile Teacher?                  // set when this student also teaches
  @@unique([schoolId, code])
  @@index([schoolId, status])
  @@index([schoolId, lastName, firstName])
  @@map("students")
}

// ───────────── Venues, rooms, classes (إملاءات), schedule ─────────────
model Venue {                            // مقر الجمعية، جامع غزة – حي النيفر …
  id          String  @id @default(uuid(7))
  schoolId    String
  school      School  @relation(fields: [schoolId], references: [id])
  name        String
  address     String?
  mapEmbedUrl String?
  isPublic    Boolean @default(true)      // listed on the public site
  isActive    Boolean @default(true)
  rooms       Room[]
  @@unique([schoolId, name])
  @@map("venues")
}

model Room {
  id       String  @id @default(uuid(7))
  schoolId String
  school   School  @relation(fields: [schoolId], references: [id])
  venueId  String
  venue    Venue   @relation(fields: [venueId], references: [id])
  name     String
  capacity Int?
  isActive Boolean @default(true)
  classes  Class[]
  @@unique([venueId, name])
  @@map("rooms")
}

model Class {
  id             String       @id @default(uuid(7))
  schoolId       String
  school         School       @relation(fields: [schoolId], references: [id])
  academicYearId String
  academicYear   AcademicYear @relation(fields: [academicYearId], references: [id])
  name           String                    // "إملاء البقرة وآل عمران – طالبات"
  level          String?
  quranScope     String?                   // free text: "سورة البقرة وآل عمران", "الحزب 51–60"
  audience       Audience
  genderPolicy   GenderPolicy @default(MIXED)
  capacity       Int          @default(25)
  riwaya         Riwaya?
  monthlyFee     Decimal?     @db.Decimal(10, 3)  // null or 0 = free imla'
  requiresMembership Boolean  @default(true)      // attendees must hold this year's membership
  isPublic       Boolean      @default(true)      // shown in the public schedule
  roomId         String?
  room           Room?        @relation(fields: [roomId], references: [id])
  isActive       Boolean      @default(true)
  createdAt      DateTime     @default(now())

  teachers       ClassTeacher[]
  scheduleSlots  ScheduleSlot[]
  enrollments    Enrollment[]
  sessions       ClassSession[]
  @@unique([schoolId, academicYearId, name])
  @@map("classes")
}

model ClassTeacher {
  classId   String
  class     Class        @relation(fields: [classId], references: [id], onDelete: Cascade)
  teacherId String
  teacher   Teacher      @relation(fields: [teacherId], references: [id])
  role      TeachingRole @default(MAIN)   // one MAIN per class (partial unique index)
  @@id([classId, teacherId])
  @@index([teacherId])
  @@map("class_teachers")
}

model ScheduleSlot {
  id        String    @id @default(uuid(7))
  classId   String
  class     Class     @relation(fields: [classId], references: [id], onDelete: Cascade)
  day       DayOfWeek
  kind      SlotKind  @default(MEMORIZATION)
  startTime String                         // "HH:mm" (approximate for prayer-based slots)
  endTime   String
  timeLabel String?                        // shown instead of the time: "بعد العصر"
  @@index([classId])
  @@map("schedule_slots")
}

model Enrollment {
  id                 String           @id @default(uuid(7))
  schoolId           String
  school             School           @relation(fields: [schoolId], references: [id])
  studentId          String
  student            Student          @relation(fields: [studentId], references: [id])
  classId            String
  class              Class            @relation(fields: [classId], references: [id])
  status             EnrollmentStatus @default(ACTIVE)  // one ACTIVE per student+class
  startDate          DateTime         @db.Date
  endDate            DateTime?        @db.Date
  monthlyFeeOverride Decimal?         @db.Decimal(10, 3) // 0 = free place
  createdAt          DateTime         @default(now())
  charges            Charge[]
  @@index([schoolId, classId, status])
  @@index([studentId])
  @@map("enrollments")
}

// ───────────── Attendance ─────────────
model ClassSession {
  id           String        @id @default(uuid(7))
  schoolId     String
  school       School        @relation(fields: [schoolId], references: [id])
  classId      String
  class        Class         @relation(fields: [classId], references: [id])
  teacherId    String?                       // who actually taught (substitute possible)
  teacher      Teacher?      @relation(fields: [teacherId], references: [id])
  date         DateTime      @db.Date
  startTime    String
  endTime      String?
  status       SessionStatus @default(HELD)
  cancelReason String?                       // "تغيّب المؤدّبة" → excluded from attendance stats
  notes        String?
  attendance   Attendance[]
  hifzSessions HifzSession[]
  @@unique([classId, date, startTime])
  @@index([schoolId, date])
  @@map("class_sessions")
}

model Attendance {
  sessionId  String
  session    ClassSession     @relation(fields: [sessionId], references: [id], onDelete: Cascade)
  studentId  String
  student    Student          @relation(fields: [studentId], references: [id])
  status     AttendanceStatus
  note       String?
  markedById String                          // user who entered it (may be staff on behalf)
  markedBy   User             @relation(fields: [markedById], references: [id])
  markedAt   DateTime         @default(now())
  @@id([sessionId, studentId])
  @@index([studentId])
  @@map("attendance")
}

// ───────────── Fees, payments, credit ─────────────
model FeeItem {
  id            String   @id @default(uuid(7))
  schoolId      String
  school        School   @relation(fields: [schoolId], references: [id])
  name          String                     // "رسوم التسجيل", "كتب"...
  defaultAmount Decimal  @db.Decimal(10, 3)
  isActive      Boolean  @default(true)
  charges       Charge[]
  @@unique([schoolId, name])
  @@map("fee_items")
}

model Charge {
  id           String       @id @default(uuid(7))
  schoolId     String
  school       School       @relation(fields: [schoolId], references: [id])
  studentId    String
  student      Student      @relation(fields: [studentId], references: [id])
  kind         ChargeKind
  enrollmentId String?
  enrollment   Enrollment?  @relation(fields: [enrollmentId], references: [id])
  period       DateTime?    @db.Date      // first day of month for MONTHLY
  feeItemId    String?
  feeItem      FeeItem?     @relation(fields: [feeItemId], references: [id])
  label        String                     // denormalised display text
  amount       Decimal      @db.Decimal(10, 3)
  paidAmount   Decimal      @default(0) @db.Decimal(10, 3)  // 0 ≤ paid ≤ amount (CHECK)
  dueDate      DateTime     @db.Date
  status       ChargeStatus @default(OPEN)
  cancelReason String?
  createdAt    DateTime     @default(now())
  allocations  PaymentAllocation[]
  membership   Membership?
  @@unique([enrollmentId, period])         // idempotent monthly generation
  @@index([schoolId, status, dueDate])
  @@index([studentId, status])
  @@map("charges")
}

model Membership {                         // الانخراط السنوي في الجمعية
  id             String       @id @default(uuid(7))
  schoolId       String
  school         School       @relation(fields: [schoolId], references: [id])
  academicYearId String
  academicYear   AcademicYear @relation(fields: [academicYearId], references: [id])
  studentId      String
  student        Student      @relation(fields: [studentId], references: [id])
  memberNumber   String                    // per school + year, from Counter "member:2026-2027"
  isNew          Boolean                   // new member (form filled) vs renewal
  formReceived   Boolean      @default(false)  // استمارة الانخراط (new members)
  chargeId       String       @unique      // the MEMBERSHIP charge; paid status comes from it
  charge         Charge       @relation(fields: [chargeId], references: [id])
  createdAt      DateTime     @default(now())
  @@unique([academicYearId, studentId])
  @@unique([schoolId, academicYearId, memberNumber])
  @@map("memberships")
}

model Payment {
  id                String        @id @default(uuid(7))
  schoolId          String
  school            School        @relation(fields: [schoolId], references: [id])
  receiptNumber     String                  // "2026-00042" — year of paidAt in school timezone
  // exactly one payer (CHECK): a guardian (family) or an adult student
  payerGuardianId   String?
  payerGuardian     Guardian?     @relation(fields: [payerGuardianId], references: [id])
  payerStudentId    String?
  payerStudent      Student?      @relation(fields: [payerStudentId], references: [id])
  payerName         String                  // snapshot for the receipt
  amount            Decimal       @db.Decimal(10, 3)
  unallocatedAmount Decimal       @default(0) @db.Decimal(10, 3)  // remaining credit
  method            PaymentMethod
  reference         String?                 // check no., transfer ref
  paidAt            DateTime      @default(now())
  receivedById      String
  receivedBy        User          @relation("PaymentReceivedBy", fields: [receivedById], references: [id])
  notes             String?
  publicToken       String        @unique
  pdfPath           String?
  voidedAt          DateTime?
  voidedById        String?
  voidedBy          User?         @relation("PaymentVoidedBy", fields: [voidedById], references: [id])
  voidReason        String?
  createdAt         DateTime      @default(now())
  allocations       PaymentAllocation[]
  @@unique([schoolId, receiptNumber])
  @@index([schoolId, paidAt])
  @@index([payerGuardianId])
  @@index([payerStudentId])
  @@map("payments")
}

model PaymentAllocation {
  paymentId   String
  payment     Payment  @relation(fields: [paymentId], references: [id])
  chargeId    String
  charge      Charge   @relation(fields: [chargeId], references: [id])
  amount      Decimal  @db.Decimal(10, 3)
  fromCredit  Boolean  @default(false)     // applied later from unallocated credit
  allocatedAt DateTime @default(now())
  @@id([paymentId, chargeId])
  @@index([chargeId])
  @@map("payment_allocations")
}

model Counter {
  schoolId String
  school   School @relation(fields: [schoolId], references: [id])
  key      String                          // "receipt:2026", "student:2026"
  value    Int
  @@id([schoolId, key])
  @@map("counters")
}

// ───────────── Quran reference (global, seeded) ─────────────
model Surah {
  id         Int              @id          // 1..114
  nameAr     String
  nameLatin  String
  ayahCounts SurahAyahCount[]
  @@map("surahs")
}

model SurahAyahCount {
  riwaya    Riwaya
  surahId   Int
  surah     Surah  @relation(fields: [surahId], references: [id])
  ayahCount Int
  @@id([riwaya, surahId])
  @@map("surah_ayah_counts")
}

model QuranThumn {
  riwaya     Riwaya
  number     Int                           // 1..480
  hizb       Int                           // 1..60
  juz        Int                           // 1..30
  startSurah Int
  startAyah  Int
  @@id([riwaya, number])
  @@map("quran_athman")
}

// ───────────── Hifz ─────────────
model HifzSession {
  id             String        @id @default(uuid(7))
  schoolId       String
  school         School        @relation(fields: [schoolId], references: [id])
  studentId      String
  student        Student       @relation(fields: [studentId], references: [id])
  teacherId      String                     // who listened (may have no login)
  teacher        Teacher       @relation(fields: [teacherId], references: [id])
  recordedById   String                     // user who typed it
  recordedBy     User          @relation("HifzRecordedBy", fields: [recordedById], references: [id])
  classSessionId String?
  classSession   ClassSession? @relation(fields: [classSessionId], references: [id])
  date           DateTime      @db.Date
  notes          String?
  createdAt      DateTime      @default(now())
  entries        HifzEntry[]
  @@index([schoolId, studentId, date])
  @@index([teacherId, date])
  @@map("hifz_sessions")
}

model HifzEntry {
  id        String        @id @default(uuid(7))
  sessionId String
  session   HifzSession   @relation(fields: [sessionId], references: [id], onDelete: Cascade)
  type      HifzEntryType
  riwaya    Riwaya
  fromSurah Int
  fromAyah  Int
  toSurah   Int
  toAyah    Int
  fromIndex Int                            // global ayah index (riwaya numbering)
  toIndex   Int
  fromThumn Int
  toThumn   Int
  rating    Int?                           // 1..5 optional (CHECK)
  note      String?
  @@index([sessionId])
  @@map("hifz_entries")
}

model StudentHifzSummary {
  studentId       String    @id
  student         Student   @relation(fields: [studentId], references: [id], onDelete: Cascade)
  riwaya          Riwaya
  memorizedAyahs  Int       @default(0)
  memorizedAthman Int       @default(0)
  completedAhzab  Int       @default(0)
  coverage        Json                     // merged [from,to] global-index intervals
  currentThumn    Int?
  lastNewAt       DateTime? @db.Date
  lastRevisionAt  DateTime? @db.Date
  updatedAt       DateTime  @updatedAt
  @@map("student_hifz_summaries")
}

// ───────────── Communication & content ─────────────
model MessageLog {
  id           String      @id @default(uuid(7))
  schoolId     String
  school       School      @relation(fields: [schoolId], references: [id])
  kind         MessageKind
  phone        String
  guardianId   String?                     // soft refs: logs are historical
  studentId    String?
  paymentId    String?
  body         String
  preparedById String
  preparedBy   User        @relation(fields: [preparedById], references: [id])
  preparedAt   DateTime    @default(now())
  @@index([schoolId, preparedAt])
  @@map("message_logs")
}

model NewsPost {
  id          String     @id @default(uuid(7))
  schoolId    String
  school      School     @relation(fields: [schoolId], references: [id])
  title       String
  slug        String
  excerpt     String?
  bodyJson    Json                         // Tiptap document
  bodyHtml    String                       // sanitised render cache
  coverUrl    String?
  category    NewsCategory @default(ANNOUNCEMENT)
  classId     String?                      // optional: announcement about one imla'
  status      NewsStatus @default(DRAFT)
  publishedAt DateTime?
  authorId    String
  author      User       @relation(fields: [authorId], references: [id])
  createdAt   DateTime   @default(now())
  updatedAt   DateTime   @updatedAt
  @@unique([schoolId, slug])
  @@index([schoolId, status, publishedAt])
  @@map("news_posts")
}

model ImportJob {
  id          String       @id @default(uuid(7))
  schoolId    String
  school      School       @relation(fields: [schoolId], references: [id])
  fileName    String
  status      ImportStatus
  mapping     Json?
  report      Json?                        // per-row errors / created counts / flagged duplicates
  createdById String
  createdBy   User         @relation(fields: [createdById], references: [id])
  createdAt   DateTime     @default(now())
  @@map("import_jobs")
}

model AuditLog {
  id         String   @id @default(uuid(7))
  schoolId   String
  school     School   @relation(fields: [schoolId], references: [id])
  userId     String?
  user       User?    @relation(fields: [userId], references: [id])
  action     String                        // STUDENT_UPDATE, PAYMENT_VOID...
  entityType String
  entityId   String?
  oldValues  Json?
  newValues  Json?
  ipAddress  String?
  createdAt  DateTime @default(now())
  @@index([schoolId, entityType, entityId])
  @@index([schoolId, createdAt])
  @@map("audit_logs")
}
```

### A7.1 Constraints Prisma can't express (add to the first migration as raw SQL)

```sql
-- partial unique indexes
CREATE UNIQUE INDEX enrollments_one_active   ON enrollments ("studentId", "classId") WHERE status = 'ACTIVE';
CREATE UNIQUE INDEX academic_years_one_current ON academic_years ("schoolId") WHERE "isCurrent";
CREATE UNIQUE INDEX class_teachers_one_main  ON class_teachers ("classId") WHERE role = 'MAIN';
CREATE UNIQUE INDEX student_guardians_one_primary ON student_guardians ("studentId") WHERE "isPrimary";

-- checks
ALTER TABLE users    ADD CONSTRAINT users_login_chk    CHECK (email IS NOT NULL OR phone IS NOT NULL);
ALTER TABLE charges  ADD CONSTRAINT charges_amount_chk CHECK (amount >= 0 AND "paidAmount" >= 0 AND "paidAmount" <= amount);
ALTER TABLE payments ADD CONSTRAINT payments_amount_chk CHECK (amount > 0 AND "unallocatedAmount" >= 0 AND "unallocatedAmount" <= amount);
ALTER TABLE payments ADD CONSTRAINT payments_one_payer CHECK (("payerGuardianId" IS NULL) <> ("payerStudentId" IS NULL));
ALTER TABLE payment_allocations ADD CONSTRAINT alloc_amount_chk CHECK (amount > 0);
ALTER TABLE schedule_slots ADD CONSTRAINT slot_time_chk CHECK ("startTime" < "endTime");
ALTER TABLE quran_athman ADD CONSTRAINT thumn_range_chk CHECK (number BETWEEN 1 AND 480 AND hizb BETWEEN 1 AND 60 AND juz BETWEEN 1 AND 30);
ALTER TABLE hifz_entries ADD CONSTRAINT hifz_rating_chk CHECK (rating IS NULL OR rating BETWEEN 1 AND 5);
```

Invariant maintained by the payments service inside one transaction (covered by tests):
`payment.amount = payment.unallocatedAmount + Σ allocations.amount` and
`charge.paidAmount = Σ allocations.amount of non-voided payments`.

## A8. Project structure

```
quranic-school/
├── compose.dev.yml          # postgres, gotenberg, backend, frontend (+ adminer under profile "tools")
├── compose.prod.yml         # caddy, postgres, gotenberg, backend, frontend
├── Caddyfile
├── .env.example
├── scripts/
│   ├── backup.sh            # pg_dump + uploads → rclone (host cron)
│   └── restore.md
├── .github/workflows/ci.yml
├── backend/
│   ├── prisma/
│   │   ├── schema.prisma
│   │   ├── data/            # quran-surahs.json, ayah-counts.<riwaya>.json, athman.<riwaya>.json
│   │   └── seed.ts          # school, settings, admin (password from env), Quran data
│   ├── prisma.config.ts
│   └── src/
│       ├── main.ts, app.module.ts
│       ├── prisma/          # PrismaService + forSchool extension
│       ├── common/          # guards (auth, roles, teacher-owns-class), filters (error codes), audit interceptor
│       ├── jobs/            # pg-boss module + workers
│       ├── pdf/             # Gotenberg client + HTML templates
│       ├── quran/           # reference data loader, range ⇄ index ⇄ thumn helpers (pure, unit-tested)
│       └── modules/
│           ├── auth/  users/  settings/  academic-years/
│           ├── students/  guardians/  teachers/  classes/  venues/  enrollments/  memberships/
│           ├── attendance/  (sessions + marks)
│           ├── fees/  (fee items, charges, monthly generation)
│           ├── payments/  (record, void, receipts, public /r/:token)
│           ├── hifz/
│           ├── messages/  (WhatsApp link builder + log)
│           ├── imports/
│           ├── news/
│           └── public/    (unauthenticated endpoints for the website)
└── frontend/
    ├── messages/ar.json     # fr.json in Phase 2
    └── src/app/[locale]/
        ├── (public)/        # home, news, news/[slug], about, schedule, venues, membership, contact
        ├── (auth)/login
        └── (app)/           # dashboard, students, guardians, classes, attendance,
                             # payments, hifz, messages, news-admin, imports, settings, users
```

---

# PART B — BUILD PLAN (vertical slices)

Assumption: solo developer, ~10–12 h/week. Estimates include tests.
**Go-live with real users after Slice 4** (money + registration), then roll out
attendance and hifz to teachers.

### Slice 0 — Foundation (≈ 2–3 weeks)
- Repo, compose.dev, Dockerfiles, CI (lint, type-check, test, build).
- Prisma schema A7 (all models) + first migration; seed school, settings, admin
  from env, Quran **surah names** (ayah counts/athman come in Slice 6).
- `forSchool` extension + model-coverage test.
- Auth: login/logout/refresh with cookies, roles guard, `mustChangePassword` flow,
  users CRUD (ADMIN).
- Error-code filter, audit interceptor, `/api/health`, Swagger at `/api/docs` (dev only).
- Frontend shell: RTL layout, sidebar (role-aware), login page, `ar.json`, theme.
- **Done when:** `docker compose -f compose.dev.yml up` → admin logs in → creates a
  teacher user → teacher logs in and sees only teacher menu. CI green.

### Slice 1 — Students, guardians, classes (≈ 3 weeks)
- Teachers (with or without login, ijazas with certificate upload, contract/salary ADMIN-only).
- Academic years, venues + rooms, imla'at (audience, gender policy, Quran scope, schedule slots
  with memorization/revision kind and prayer time labels, fee or free, main/assistant/supervisor
  teachers, student-teachers). UI says "إملاء", not "صف" (see glossary A1.2).
- Students CRUD with atomic code, guardian phone lookup with duplicate warning & linking, photo upload with consent.
- Raw-SQL constraints from A7.1 in the migration, with tests proving each one rejects bad data.
- Enrollments with gender-policy check and capacity warning.
- Students list (search Arabic/Latin name, code, phone; filters class/status/gender), student profile with tabs.
- **Done when:** two siblings share one guardian; an adult student has no guardian;
  enrolling a boy in a FEMALE_ONLY class is rejected with a translated error.

### Slice 2 — Excel import (≈ 1–2 weeks)
- Template download, upload, mapping, dry-run report, commit, idempotent re-run.
- **Done when:** the school's real spreadsheet (anonymised copy) imports with a
  clear error report and re-importing creates no duplicates.

### Slice 3 — Fees & charges (≈ 2 weeks)
- Fee items, one-off charges (single + bulk per class), monthly generation job
  (cron + manual button), billable months per year, cancel charge (ADMIN).
- Student & family balance views.
- **Membership:** year fee + window in academic-year settings, register new/renewal
  (member number, form received), MEMBERSHIP charge, members list with paid/unpaid,
  "no membership" badge in imla' lists, printable member list.
- **Done when:** running generation twice for the same month creates charges once;
  free imla'at and free-place enrollments create no charge; a student cannot get two
  memberships in the same year.

### Slice 4 — Payments, receipts, WhatsApp (≈ 3 weeks)
- Record payment for student or family with auto-allocation; gap-free receipt numbers.
- Gotenberg receipt PDF (Arabic, school logo, amount in words in Arabic), print view.
- Public receipt link `/r/:token`; WhatsApp share button; templates in settings.
- Void payment (ADMIN, reason). Overdue list + one-by-one reminder runner (also for
  unpaid memberships during the window); MessageLog.
- Finance dashboard: collected this month, outstanding, collection rate, by class.
- **Done when:** 20 concurrent payment requests produce 20 consecutive receipt numbers
  (e2e test); a receipt PDF renders connected Arabic text correctly.
- 🚀 **Pilot go-live:** import data, train secretary, 2 weeks parallel with paper.

### Slice 5 — Attendance (≈ 2 weeks)
- Teacher "today" screen (mobile), on-demand session from schedule, quick marking,
  ad-hoc session, history per class/student, absence WhatsApp message.
- Cancel a session with reason (teacher absent) → prepared class announcement to copy
  into the imla' WhatsApp group and/or publish as news.
- Attendance rate per class/student on dashboard.
- **Done when:** a teacher marks 25 students on a 360 px phone in < 30 s; a teacher
  cannot open another teacher's class (403).

### Slice 6 — Hifz (≈ 3–4 weeks)
- **Prerequisite:** verified ayah counts + athman JSON for QALUN (and WARSH/HAFS if taught).
- `quran/` helpers: surah:ayah ⇄ global index ⇄ thumn, interval merge — 100 % unit-tested.
- Hifz session form (mobile): add NEW / RECENT_REVISION / OLD_REVISION entries,
  three input modes (hizb/thumn, surah, ayah range), optional rating/note.
- INITIAL_LEVEL entry from import and from student profile.
- Summary recompute; 60-hizb grid; class overview (progress + days since last sabaq);
  student timeline; class hifz PDF report (job).
- **Done when:** entering "hizb 60 complete" by thumn, by surahs (87→114), or by ayah
  range yields the same summary; backwards memorization (An-Nas → Al-A'la) works.

### Slice 7 — Public website & news (≈ 1–2 weeks)
- Public pages (ISR), news admin with Tiptap + cover upload + categories, about/contact
  from settings, weekly imla' schedule, venues with maps, membership page, share-to-Facebook
  and copy-for-WhatsApp buttons, SEO metadata, sitemap.
- Seed the news with a few real announcements from the Facebook page (with the school's OK).
- **Done when:** a published post appears on `/` within 60 s; drafts are not reachable.

### Slice 8 — Production hardening (≈ 1 week, can overlap Slice 4)
- compose.prod + Caddy + domain, env secrets, backup script + host cron + tested restore,
  uptime ping, log rotation, admin password rotation, PWA manifest.
- **Done when:** a restore of last night's backup on a fresh VPS brings the app back.

**Total MVP ≈ 18–22 weeks part-time.** Pilot (Slices 0–4) ≈ 11–13 weeks.

## Phase 2 backlog (post-MVP)
- Exams: scheduling, /20 scoring with configurable weights and pass score
  (from settings, not hardcoded), grade as enum translated in UI, result sheets, certificates.
- **Mawlid competition (المسابقة المولدية)** on the same engine as exams: editions,
  categories by hizb range (60, 45, … ahzab), contestants (incl. external, non-enrolled),
  jury members and per-judge scores, rankings, certificates, honouring of sheikhs,
  photo gallery on the public site.
- Other programs: literacy (محو الأمية), preachers' training (تكوين الخطباء) —
  attendance-only courses reusing `Class` with a `programType`.
- Association: donations with receipts, non-student members, board & general assemblies.
- French UI (`fr.json`), Latin-name fields everywhere.
- Parent portal (phone + password issued by school; OTP later if a free channel exists).
- WhatsApp Cloud API automation (if the school accepts the cost) behind the existing
  `messages` interface.
- Discounts / sibling reductions, teacher payroll, expenses, multi-school.

## Open questions to confirm with the school before the related slice
1. Which riwaya(s) are taught (Qalun only? also Warsh/Hafs for some adults)? Which
   printed mushaf do teachers use for thumn boundaries? *(Slice 6)*
2. Which imla'at are paid, how much, and does a student in 2 paid imla'at pay twice? *(Slice 3)*
3. Billable months: Sep–Jun only, or summer sessions too? Ramadan schedule? *(Slice 3)*
4. Legal entity is a local branch of a Quranic association — confirm the exact legal
   name, registration number and what a receipt must show (stamp, signature). *(Slice 4)*
4b. Membership: is it mandatory for every student or only adults? Do non-students
   (supporters, board) become members too? Member numbering format? *(Slice 3)*
4c. Does each imla' have a WhatsApp group (for copy-paste announcements)? *(Slice 5)*
5. Who gets staff accounts and on which devices? *(Slice 0)*
6. Student code format the school already uses (keep it on import?). *(Slice 2)*
7. Domain name for the public site and who writes news. *(Slice 7)*

## Rules for the AI IDE (replace v2's "Final instruction")
- Work **one slice at a time**; stop at the slice's "Done when" and run the tests.
- Every DB change = a named Prisma migration. Never edit applied migrations.
- Services use `prisma.forSchool(schoolId)`; `schoolId` only from the auth context.
- Money: `Prisma.Decimal` only. Dates: store UTC, date-only fields as `@db.Date`,
  display in `Africa/Tunis`.
- No `any`; strict TypeScript both sides.
- All UI strings in `messages/ar.json`; API returns error codes, not sentences.
- Only logical Tailwind utilities (`ms/me/ps/pe/start/end`), never `ml/mr/pl/pr/left/right`.
- Write unit tests for pure domain logic (quran helpers, allocation, charge generation,
  counters) and at least one e2e test per slice.
- When data is missing (e.g. Quran athman), stop and ask — never invent reference data.
