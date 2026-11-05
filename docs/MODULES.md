# Modules — what each part of the app does

Who uses what, and where. Roles: **ADMIN** (مدير), **STAFF** (كتابة الجمعية), **TEACHER** (مؤدّب).
Details and rules are in [SPEC.md](SPEC.md); build history in [PROGRESS.md](PROGRESS.md).

| Module | Page | Roles | In short |
|---|---|---|---|
| Dashboard | `/dashboard` | all | Today's sessions, month's finances (office), 30-day attendance and students below the threshold, quick actions |
| Students | `/students` | office | Register students and guardians (shared phones link siblings), photos, enrolments, status; account and receipts per student |
| Imla'at (classes) | `/classes` | all (teachers: their own) | Classes with audience, boys/girls policy, Quran portion, weekly slots, venue/room, teachers and supervisor, roster |
| Teachers | `/teachers` | office | Teachers' records and their classes |
| Excel import | `/imports` | office | Upload the association's Excel sheets, map columns, review warnings, import |
| Attendance | `/attendance` | all | Day view with week strip; open a session, everyone present, tap absentees, save; cancel a session (optionally published as news); WhatsApp absence message |
| Hifz | `/hifz` | all | Per class and per student: entries by surah/ayah, hizb/thumn or page, 60×8 athman grid, position, days since new memorisation; PDF report |
| المصحف المعلّم | `/mushaf` | all | Ayah-by-ayah Qalun recitation with repetition pauses, by surah or by hizb/thumn — see [MUSHAF-MUALLIM.md](MUSHAF-MUALLIM.md) |
| Fees | `/fees` | office | Fee items per class, monthly charges generated daily (idempotent), manual charges, cancellations |
| Memberships | `/memberships` | office | Yearly membership (انخراط) fee and numbers, printable cards |
| Payments | `/payments` | office | Record a payment for a family, oldest charges first (or manual split), credit carried over; gap-free receipt numbers; Arabic PDF receipt; WhatsApp receipt link; reminders list |
| News | `/news-admin` | office | Rich-text news with cover, categories, linked class; publish → public site within a minute |
| Users | `/users` | admin | Accounts, roles, password resets |
| Settings | `/settings` | admin | School details, receipt footer, billing day, WhatsApp templates, school years, venues/rooms, public site (about, map, social links) |
| Public site | `/`, `/news`, `/schedule`, `/venues`, `/membership`, `/about` | everyone | Association's site: news, weekly imla' schedule, venues, membership, contact — no student data |

## Everyday flows (fewest taps)

- **Teacher, start of a session:** tab bar → الحضور → tap the class → tap absentees → حفظ.
- **Teacher, after recitation:** متابعة الحفظ → student → سجّل → range → حفظ; «استمع» opens
  the student's current thumn in المصحف المعلّم.
- **Office, a parent pays:** Ctrl+K → student name → دفعة (or لوحة القيادة → تسجيل دفعة) →
  «كامل المستحق» → method → حفظ → send the receipt by WhatsApp.
- **Office, end of month:** المدفوعات → تذكيرات الدفع → WhatsApp each family.

## Shortcuts

- `Ctrl+K` or `/`: search pages and students.
- Sun/moon button: light / dark / device theme.
- Sidebar button at the bottom: collapse to icons (desktop).
