# Progress

## Slice 0 — Foundation ✅ (2026-11-02)

Done when (spec B, Slice 0): admin logs in → creates a teacher user → teacher logs in and
sees only the teacher menu. **Verified in the browser and by `test/auth.e2e-spec.ts`.**

Delivered:
- `compose.dev.yml` (Postgres 18 on 5433, Gotenberg on 3002, Adminer under profile `tools`)
- Prisma schema v3.1 (spec A7) + migration `init` + migration `integrity_constraints` (spec A7.1:
  4 partial unique indexes, 8 CHECK constraints)
- Seed: school, settings with WhatsApp templates, academic year 2026-2027 (membership 20 TND,
  window 1 Nov – 30 Jan), venue "مقر الجمعية", first admin from env, 114 surah names
- `forSchool()` tenant scoping + tests that keep `TENANT_MODELS` in sync with the schema
- Auth: login (email or phone), httpOnly access cookie (15 min), rotating refresh tokens stored
  hashed with reuse detection, logout, `/auth/me`, forced password change, roles guard,
  login rate limit (5/min), CSRF header check
- Users admin API + page (create with temporary password, activate/deactivate, reset password)
- Error-code filter (API never returns sentences), audit log service, `/api/health`, Swagger (dev)
- Frontend: Arabic RTL shell (IBM Plex Sans Arabic), role-aware sidebar with "قريباً" for later
  modules, mobile sheet menu, login, change-password, dashboard, users, public placeholder home

Deviations from the spec (decided while building):
| Spec said | Built | Why |
|---|---|---|
| NestJS 11 / Jest / ESLint | **NestJS 12**, **Vitest**, **oxlint** | Current stable generator defaults |
| nestjs-zod | Own `ZodValidationPipe` | nestjs-zod does not support NestJS 12 yet |
| Backend + frontend containers in dev | Only Postgres + Gotenberg in Docker; apps run on host | Reliable hot reload on Windows |
| `middleware.ts` | `src/proxy.ts` | Renamed in Next.js 16 |
| `[locale]` route segment | No locale segment; next-intl with fixed `ar` | Arabic-only v1; add routing with French |
| Audit interceptor | Explicit `AuditService.log()` in services | Accurate old/new values |
| — | Extra `forkan_session` marker cookie (no secret) | Lets `proxy.ts` redirect to /login; refresh cookie is scoped to /api/auth |

Not done in Slice 0 (planned later): CI deploy, `compose.prod.yml` + Caddy (Slice 8),
pg-boss wiring (Slice 3), Gotenberg client (Slice 4).

## Slice 1 — Students, guardians, teachers, imla'at ✅ (2026-11-03)

Done when (spec B, Slice 1): two siblings share one guardian; an adult student has no guardian;
enrolling a boy in a FEMALE_ONLY imla' is rejected with a translated error.
**Verified by `test/students-classes.e2e-spec.ts` and in the browser** (sister registered through the
form after the "this number is already registered" warning; «هذا الإملاء غير مختلط…» shown on enroll).

Delivered:
- API: academic years (one current, membership fee + window), venues + rooms, teachers (with or
  without login, link to a student record, ijazas + scanned certificate, contract/salary ADMIN-only),
  imla'at (Quran scope, audience, gender policy, fee or free, typed weekly sessions with prayer-time
  labels, MAIN/ASSISTANT/SUPERVISOR teachers; teachers only see their own), guardians (phone lookup,
  non-unique phones), students (gap-free `YYYY-NNNN` codes, guardian required under 18 by setting,
  search by name/code/guardian phone, status change ends enrollments), enrollments (gender policy,
  capacity with ADMIN override, no duplicates)
- Private uploads: student photo only with consent (withdrawing consent deletes it), ijaza
  certificates; real file type checked from bytes, 5 MB max, served to staff only
- UI: settings (years, venues/rooms), teachers list/detail, imla'at cards/detail with roster and
  enrollment, students list (filters, paging), registration form with guardian phone warning,
  student profile with tabs (payments/hifz/attendance placeholders)
- Tests: 18 unit + 19 e2e, including every A7.1 database constraint
- Demo data in the dev DB, based on the association's Facebook announcements

Notes:
- `Class` is shown as «الإملاء» everywhere (glossary A1.2).
- Phones are stored E.164; typing `22 123 456` is understood as Tunisian.

## Slice 2 — Excel import ✅ (2026-11-03)

Done when (spec B, Slice 2): a real spreadsheet imports with a clear error report and re-importing
creates no duplicates. **Verified by `test/imports.e2e-spec.ts`, `src/imports/*.spec.ts` and in the
browser** with a school-style sheet (title row, non-template headers «الإسم/تاريخ الميلاد/هاتف الأب/الحلقة»).

Delivered:
- `GET /imports/template`: RTL workbook — «الطلبة» + «المؤدّبون» + «تعليمات», dropdowns (gender,
  relation, riwaya, current imla'at) from a hidden list sheet, text format for phones/codes
- Upload (.xlsx or .csv, kept privately under uploads/<school>/imports) → automatic column mapping
  (Arabic/French synonyms, Arabic-insensitive matching, title rows skipped) → editable mapping
- Dry run per row: required fields, gender/date/phone/riwaya/amount parsing (dd/mm/yyyy, Excel serials,
  numeric phone cells), unknown/inactive imla', gender policy, capacity (counting the file's own rows),
  minors without guardian, duplicates inside the file, already-imported students (code, or name +
  birth date, or name + guardian phone)
- Guardians: same phone + same name → reused; same phone, other name → warning and a per-row choice
  ("same family" or "new guardian"); siblings in the file share one new guardian
- Commit in one transaction (optionally skipping error rows): teachers, guardians, students
  (imported `YYYY-NNNN` codes advance the counter), enrollments, «رصيد سابق» charges; job history
- Schema: `ImportJob.filePath`, `ImportJob.updatedAt`, `Student.declaredHifz` (migration `import_support`)

Deviations / notes:
- Imports run synchronously (≤ 3000 rows, one transaction) — pg-boss not needed yet.
- `declaredHifz` is kept as written; Slice 6 turns it into INITIAL_LEVEL hifz entries.
- Prisma 7 `migrate dev` no longer runs `generate`: `npm run db:migrate` now does both.
- Multer decodes file names as Latin-1; uploads re-decode them as UTF-8.

## Slice 3 — Fees, charges and memberships ✅ (2026-11-03)

Done when (spec B, Slice 3): running generation twice for the same month creates charges once; free
imla'at and free-place enrollments create no charge; a student cannot get two memberships in the same
year. **Verified by `test/fees.e2e-spec.ts`, `src/fees/billing.spec.ts` and in the browser** (November
generated twice: 4 created then 0 new / 4 existing, 2 free places skipped; second membership → 409).

Delivered:
- `src/fees/billing.ts` (pure, unit-tested): periods, billable months, amount (override wins, 0 = free),
  due date (billing day + payment delay), derived state UNPAID / PARTIAL / OVERDUE / PAID / CANCELLED,
  Arabic labels with Tunisian month names («معلوم شهر نوفمبر 2026 – …»)
- Fee items catalog; one-off charges per student or for a whole imla' (skips students who already have
  the same live charge); ADMIN cancel with reason (refused once anything is paid)
- Monthly generation: `POST /charges/generate-monthly` + pg-boss cron `charges.generate-monthly`
  (schema `pgboss`, singleton queue); `createMany(skipDuplicates)` on `@@unique([enrollmentId, period])`
- Balances: `GET /students/:id/account` (charges, balance, overdue, credit, payer family, current-year
  membership) and `GET /guardians/:id/account`
- Memberships: register (member number `001…` from counter `member:<year>`, new vs renewal guessed from
  earlier years, form received, MEMBERSHIP charge due at the window end), list with summary, "without
  membership" list, form toggle; cancelling the MEMBERSHIP charge removes the membership
- UI: «المعاليم» page (charges with filters and totals, month generation, fee catalog, bulk charge),
  «الانخراطات» page (summary, members, students without membership, register), printable member list
  (`/memberships/print`, shell hidden when printing), student «المدفوعات» tab (balance, family,
  membership, charges, add/cancel), «دون انخراط» / «انخراط غير خالص» badges in imla' rosters,
  billable months picker in academic-year settings

Deviations / notes:
- The cron runs **every day at 06:00 (Africa/Tunis)** and generates the current month once the billing
  day has passed, instead of only on the billing day: a server that was down on the 1st catches up, and
  students enrolled later in the month get that month. Idempotency makes the extra runs free.
- An enrollment is charged for a month it overlaps (start or end inside the month counts). No proration.
- A cancelled monthly charge is never regenerated (the unique key stays taken).
- Credit auto-apply on new charges (spec A5) needs payments: added in Slice 4.
- WhatsApp membership reminders are Slice 5. Member number format (`001`) is an open school question.
- New env `JOBS_ENABLED` (default true; false in e2e). pg-boss needs `@opentelemetry/api` (installed:
  `legacy-peer-deps` skips peers).

Known issue (pre-existing, dev only): full page loads log a React hydration mismatch under `RoleGate`
(server renders a Suspense where the client renders the page). React recovers by re-rendering on the
client. Also seen on `/users` and `/imports`, so it is not specific to the Slice 3 pages.

## Slice 4 — Payments, receipts, WhatsApp ✅ (2026-11-03)

Done when (spec B, Slice 4): 20 concurrent payment requests produce 20 consecutive receipt numbers;
a receipt PDF renders connected Arabic text correctly. **Verified by `test/payments.e2e-spec.ts`
(concurrency test), `src/payments/allocation.spec.ts`, and visually** (receipt 2026-00001 rendered by
Gotenberg with IBM Plex Sans Arabic, Hijri date, amount in words «فقط خمسون ديناراً لا غير»).

Delivered:
- Ledger (`src/fees/ledger.ts`): payer of a student (payer guardian → primary → the student), open
  charges locked `FOR UPDATE` oldest first, allocations that flip charges to PAID, reversal on void
- `allocate()` (pure): oldest first or the staff's own split (checked), remainder = family credit
- Payments: `POST /payments` (guardian/family or adult student, method, reference, late paper date),
  receipt `YYYY-NNNNN` from counter `receipt:<year in Tunis>` in the same transaction, 192-bit
  `publicToken`; list with filters and totals; detail; ADMIN void with reason (number kept, charges
  reopen, other credit re-applied)
- Family credit auto-applied (`CreditService`) after monthly generation, one-off / bulk charges,
  membership registration and voids: oldest payment first, `fromCredit = true`, no new receipt
- Receipts: A5 HTML template → Gotenberg, fonts inlined from `@fontsource/ibm-plex-sans-arabic`
  (no network), amount in Arabic words (`src/pdf/arabic-words.ts`, unit-tested), Hijri date (setting),
  school address/phone/footer from settings, «ملغى» stamp when voided; stored under
  `uploads/<school>/receipts/`, generated on save (background) or on first download
- `GET /api/r/:token` public PDF (rate-limited), proxied as `/r/:token` by Next
- WhatsApp click-to-send: templates in settings (`GET/PATCH /settings`), `wa.me` links,
  `POST /messages` → MessageLog; receipt share button; reminder runner for overdue charges and unpaid
  memberships, grouped per family, with "last reminded" dates
- Finance summary (`GET /finance/summary`): collected this month, by method, outstanding, overdue,
  credit, monthly collection rate and per-imla' progress
- UI: «المدفوعات» (summary, receipts list), «تسجيل دفعة» (student search → family or student payer →
  live oldest-first split, editable), receipt page (PDF, WhatsApp, copy link, void), reminder runner,
  settings cards (school & receipts, WhatsApp templates), payments + record button on the student tab
- CI: Gotenberg service added to the backend job

Deviations / notes:
- The runner does not auto-open the next family when staff returns to the tab: browsers block
  popups that are not a direct click. The next family is shown ready, one click away.
- The receipt lists what the payment covered when issued (`fromCredit = false`); later credit
  applications show on the receipt page, not on the PDF.
- Receipt PDFs are never regenerated once stored, except after a void (stamp).
- Open school questions still apply: legal name / registration number, stamp and signature rules,
  logo (no logo upload yet: the header is text).

## Slice 5 — Attendance ✅ (2026-11-03)

Done when (spec B, Slice 5): a teacher marks 25 students on a 360 px phone in < 30 s; a teacher
cannot open another teacher's class (403). **403 verified by `test/attendance.e2e-spec.ts`
(`NOT_YOUR_CLASS`)**. The marking screen was checked at 360 × 740 (no horizontal overflow): open = 1 tap,
everyone starts present, 1 tap per absent/late student, 1 tap to save — for 25 students with a few
absences that is well under 30 s. It was not stopwatch-timed with 25 real students (the dev imla' has 4).

Delivered:
- `src/attendance/attendance.rules.ts` (pure, unit-tested): weekday of a date, Arabic day labels,
  rate = (present + late) / (present + late + absent) — excused and cancelled sessions excluded —,
  gendered cancellation announcement («تتغيّب المؤدّبة … وتستأنف الحصص يوم …»)
- API: day view (`GET /attendance/day`: the actor's imla'at, slots of that weekday + ad-hoc sessions,
  counts), `POST /sessions/open` (on demand, idempotent per class/date/time, not in the future),
  `PUT /sessions/:id/attendance` (whole sheet, roster = enrolled on that date), cancel with reason and
  optional resume date (planned or opened sessions, future allowed) → prepared announcement, reopen,
  `POST /sessions/:id/publish` (STAFF: published news post linked to the imla'), class history grid,
  student history (STAFF), `GET /attendance/summary` (rate per imla', low-attendance students)
- Teachers only reach their own imla'at (403 otherwise); guardian phones are only sent to the office
- UI: «الحضور» day screen (phone-first, date navigation, open / cancel / ad-hoc session), marking sheet
  (tap the name = present ↔ absent, 4 one-letter status buttons, "all present", sticky save bar, notes,
  WhatsApp absence notice to the primary guardian for the office), cancel dialog with the announcement
  (copy, share to a WhatsApp group via `wa.me/?text=`, publish as news), attendance grid on the imla'
  page, attendance tab on the student page, dashboard (today's sessions, finance for the office,
  30-day rates per imla', students who miss most)

Notes:
- Published announcements are stored now; the public site that shows them is Slice 7.
- The roster of a past session uses enrollment dates: students registered later are not listed
  (the sheet explains it when empty).
- "Held" sessions in stats are those with at least one mark: opening a sheet without saving does not count.

## Slice 6 — Hifz ✅ (2026-11-04) — reference data NOT verified yet

Done when (spec B, Slice 6): "hizb 60 complete" entered by thumn, by surahs (87→114) or by ayah range
yields the same summary; backwards memorization (An-Nas → Al-A'la) works. **Verified by
`src/quran/quran-index.spec.ts` (100 % statements/branches/lines) and `test/hifz.e2e-spec.ts`**
(three students, three modes, one entered backwards over several days: identical summaries), and in
the browser (An-Nas → Al-Ikhlas for a child: position «الحزب 60 – الثمن 8», thumn 480 partial).

Prerequisite (Qur'an data) — decided with the user: use a public dataset, flagged unverified:
- `backend/prisma/data/quran-qalun.json` (v1, `verified: false`): 114 ayah counts (6214) + 480 athman,
  built by `scripts/build-quran-data.ts` from `quran-meta` 7.0.0 (MIT; KFGQPC Qaloun data via
  quranpedia), counts cross-checked with the KFGQPC Qalun text; 464/480 thumn starts carry the «۞»
  mark in that text, 16 do not (listed first for checking)
- `docs/quran-data/qalun-verification.xlsx`: one row per thumn with its opening words, text-mark check,
  "differs from the Mashriqi mushaf" flag, columns for the sheikh's yes/no and correction; ayah-count
  sheet; instructions. Provenance and the correction procedure: `backend/prisma/data/README.md`
- New table `QuranDataset` (version, verified, source); `prisma/load-quran.ts` loads surahs + data
  (seed, `npm run db:quran`, and the e2e global setup). The app shows a warning while unverified.

Delivered:
- `src/quran/quran-index.ts` (pure): surah:ayah ⇄ global index ⇄ thumn, thumn/surah ranges, the three
  input modes normalised (direction kept), interval merging, coverage stats (thumn full/partial, ahzab)
- Hifz API: `POST /hifz/sessions` (1–20 entries NEW / RECENT_REVISION / OLD_REVISION / INITIAL_LEVEL,
  rating, notes; teacher = typist or main teacher), `DELETE` (recorder or office), stored
  `StudentHifzSummary` recomputed in the same transaction (coverage from NEW + INITIAL_LEVEL only),
  `GET /students/:id/hifz` (summary, 480-digit grid, timeline), `GET /classes/:id/hifz` (progress,
  position, days since last sabaq), `GET /classes/:id/hifz/report.pdf` (Gotenberg, A4), `GET /quran/meta`
- Riwaya: student → imla' → school default; only QALUN has data (others answer `NO_QURAN_DATA`)
- Teachers reach only students of their imla'at (403 `NOT_YOUR_STUDENT` / `NOT_YOUR_CLASS`)
- UI: «متابعة الحفظ» (imla' overview with progress bars, stale sabaq in red after 14 days, PDF report,
  record button), entry dialog (phone-friendly: native selects, 3 input modes, any direction, rating,
  several lines per session, prefilled at the next thumn), student hifz page for teachers and the
  hifz tab on the student profile (summary, 60-hizb grid, timeline with delete, imported «مقدار الحفظ»
  shown as a hint for the INITIAL_LEVEL entry)

Deviations / notes:
- The class PDF report is generated on request (≈1 s), not through a pg-boss job.
- Imported `declaredHifz` text is not parsed automatically: it is shown on the profile so the office
  records an INITIAL_LEVEL entry with the right range.
- After the sheikh corrects the data, students' summaries refresh on their next hifz save
  (a bulk recompute can be added if needed).

## Slice 7 — Public website & news ✅ (2026-11-05)

Done when (spec B, Slice 7): a published post appears on `/` within 60 s; drafts are not reachable.
**Verified on a production build (`next start`)**: with time-based revalidation alone the post showed
on `/` 47 s after publishing; with the API's on-demand call (`POST /revalidate`, secret checked —
wrong secret → 401) an unpublished post disappeared from `/` on the very next request. Draft URLs show
the not-found page with `noindex` and never the body; `test/news.e2e-spec.ts` covers the API side.

Delivered:
- API: news CMS (`/news`, STAFF): drafts, publish / unpublish (first publication date kept), delete,
  categories, optional imla' link (new FK `news_posts.classId → classes`), cover upload (private file,
  previewed by the office, public only while published); Tiptap JSON rendered by a **whitelist
  renderer** (`src/news/tiptap-html.ts`, unit-tested against script/attribute/`javascript:` injection)
- Public read-only API (`/api/public/*`, no login, rate-limited): site info from settings, current
  membership fee/window, public venues, weekly schedule of public imla'at (names, scope, audience,
  gender policy, slots, venue, teacher/supervisor names — no student data), published news and covers
- `SiteRevalidator`: after news/settings changes the API calls the site's `/revalidate`
  (shared `REVALIDATE_SECRET` in backend `.env` and frontend `.env.local`; `frontend/.env.example` added)
- Settings: about text, map embed, Facebook/Instagram/YouTube links («الموقع العمومي» card)
- Public site (`src/app/(public)`, server-rendered, cached 1 min + tag `public`): home (hero, latest
  news), news list with category filter and paging, article (cover, share on Facebook, copy for
  WhatsApp, Open Graph), weekly schedule (by day and by imla'), venues with Google Maps embeds (only
  google.com/maps/embed URLs are framed), membership, about/contact; sitemap.xml, robots.txt
- Office UI: «الأخبار» list and editor (Tiptap RTL toolbar: headings, bold/italic/underline, lists,
  quote, links), cover upload, publish/unpublish, delete, share buttons once published

Notes:
- Not seeded with real Facebook announcements: the spec asks for the school's OK first.
- A draft URL answers HTTP 200 with the not-found page (streamed page), marked `noindex`.
- The public site degrades to empty content if the API is unreachable (e.g. CI build) instead of failing.
- `NEXT_PUBLIC_SITE_URL` (share links, sitemap, canonical URLs) waits for the domain (open question 7).

## UI theme «رَقّ» ✅ (2026-11-05) — see [UI-GUIDE.md](UI-GUIDE.md)

- Theme tokens in `frontend/src/app/globals.css`: parchment background, ink-green primary, gilt accent (`--gold`), plus `success` / `warning` / `info` for statuses; a lamplit dark variant. Light / dark / system toggle (next-themes).
- Type: Reem Kufi for headings (`font-heading`), IBM Plex Sans Arabic for text.
- Motif: the rub el hizb ۞ (`components/brand/star-mark.tsx`) as logo, and a `girih-overlay` lattice utility on dark panels.
- Shell: ink-green sidebar with sections (التعليم، الطلبة والإطار، المالية، الموقع، الإدارة), collapsible to an icon rail (remembered per browser); Ctrl+K or "/" palette to jump to pages and students; phone tab bar with the role's four main pages + «المزيد».
- Bigger controls (36 px buttons/inputs), themed tables and cards; dashboard banner with Gregorian + Hijri date and quick actions; split-screen login; public site hero, cards and footer restyled.

## Usability pass + «المصحف المعلّم» ✅ (2026-11-05)

Usability tour of the daily flows (office desktop, teacher phone), fixes:

- **Attendance:** the save bar was `fixed` at the bottom and hidden behind the new phone tab bar —
  now sticky above it and inside the content column. Week strip (Saturday → Friday, today in gold)
  to change day in one tap; loading skeletons; avatar initials, absent rows tinted; live colour
  counts per status in the save bar.
- **Students:** phone card list with call button (the table needed sideways scrolling); whole row
  opens the student on desktop; guardian phone is a `tel:` link; search icon; "الجنس: الكل" label.
- **New payment:** «كامل المستحق» and «أقدم معلوم» amount chips; payment method as buttons.
- **Hifz:** «استمع في المصحف المعلّم» opens the student's current thumn.

New page `/mushaf` — «المصحف المعلّم»: ayah-by-ayah Qalun recitation (al-Husary, al-Hudhaifi,
al-Dokali) with ×1–×5 repetition and a pause for the student to repeat, by surah or by hizb/thumn.
Streams from mp3quran.net (not stored); their Qalun ayah timings match our reference data for all
114 surahs. No Tunisian muallim recording is available with usable rights — details and how to get
one in [MUSHAF-MUALLIM.md](MUSHAF-MUALLIM.md).

Not verified: ayah cut points by ear (needs the sheikh's ear on a few surahs).

New docs: [UI-GUIDE.md](UI-GUIDE.md), [MODULES.md](MODULES.md), [MUSHAF-MUALLIM.md](MUSHAF-MUALLIM.md).

## Exams & competitions (Phase 2, started early) ✅ (2026-11-09)

Built from the school's paper score card `docs/بطاقة التقييم_111341.docx` (contestant, الفرع, 4 questions with
surah + ayah and mistakes, حفظ /14 + تجويد /6 = /20, notes, jury signatures). Decisions (2026-11-09): one
engine for internal exams **and** competitions; **one card per candidate filled by the whole jury**
(not one per judge); **one حفظ mark and one تجويد mark per card** (not per question); scale set **per branch**.

Delivered:
- Schema (migration `evaluations`): `Evaluation` (kind EXAM/COMPETITION, optional imla' and year, OPEN/CLOSED),
  `EvaluationBranch` (question count, hifz/tajwid maxima, optional pass mark), `EvaluationJuror` (school teacher
  or outside guest, one president), `EvaluationCandidate` (student or external, order of passage from counter
  `evaluation:<id>`, scores, notes), `EvaluationQuestion`. CHECKs: both marks together, none when absent, scale > 0,
  pass mark ≤ total.
- `src/evaluations/scoring.ts` (pure, unit-tested): validation against the branch scale, total, pass/fail,
  ranking with shared ranks (1, 1, 3) then pending then absent. No tie-break rule (none given by the school).
- API `/evaluations…`: CRUD (delete: ADMIN, only before any card), branches, jury, candidates (one by one,
  external, or all active students of an imla'), score card (ayah checked against the school riwaya),
  results, all cards for printing, `/students/:id/evaluations`. Close = STAFF, reopen = ADMIN; closed
  evaluations refuse every change. Teachers see and score only the evaluations where they are jurors.
  Lowering a branch maximum or question count is refused if filled cards would no longer fit.
- UI: «الامتحانات والمسابقات» (teaching section of the menu): list cards with progress, creation dialog
  (branches + jury), detail with tabs (المتسابقون / الفروع / لجنة التحكيم), score card page laid out like the sheet
  with live total and «حفظ والمرور إلى الموالي», results per branch (print), printable cards (two per A4
  landscape page, blank for the jury or filled), «الامتحانات» tab on the student profile.
- Tests: `scoring.spec.ts` (8), `test/evaluations.e2e-spec.ts` (8).

Open questions for the school:
- Grade labels (ممتاز، حسن جدّاً…) and their thresholds, and a tie-break rule for prizes (e.g. higher حفظ first).
- Certificates and prize lists (spec Phase 2) are not built yet.

## Open questions for the school

1. Domain name and server (needed for HTTPS, share links, sitemap).
2. Legal wording on receipts; member number format.
3. Sheikh's check of the Qalun athman (`docs/quran-data/qalun-verification.xlsx`) and of the
   «المصحف المعلّم» ayah cuts.
4. OK to copy past Facebook announcements into the news.
5. WhatsApp number in Settings (public site contact buttons).
6. Contact Radio Zitouna / Ministry of Religious Affairs for a Tunisian muallim recording.

## Next: Slice 8 — Production hardening
