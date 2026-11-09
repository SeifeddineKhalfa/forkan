/** Shapes returned by the API (dates are ISO strings, money is a decimal string). */

export type Gender = "MALE" | "FEMALE";
export type Riwaya = "QALUN" | "WARSH" | "HAFS";
export type Audience = "CHILDREN" | "TEENS" | "ADULTS";
export type GenderPolicy = "MIXED" | "MALE_ONLY" | "FEMALE_ONLY";
export type Day = "SATURDAY" | "SUNDAY" | "MONDAY" | "TUESDAY" | "WEDNESDAY" | "THURSDAY" | "FRIDAY";
export type SlotKind = "MEMORIZATION" | "REVISION" | "MIXED";
export type TeachingRole = "MAIN" | "ASSISTANT" | "SUPERVISOR";
export type StudentStatus = "ACTIVE" | "INACTIVE" | "GRADUATED" | "LEFT";
export type Relation = "FATHER" | "MOTHER" | "BROTHER" | "SISTER" | "GRANDPARENT" | "UNCLE" | "AUNT" | "OTHER";

export const DAYS: Day[] = ["SATURDAY", "SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"];

export interface AcademicYear {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  billableMonths: number[];
  isCurrent: boolean;
  membershipFee: string | null;
  membershipWindowStart: string | null;
  membershipWindowEnd: string | null;
}

export interface Room {
  id: string;
  venueId: string;
  name: string;
  capacity: number | null;
  isActive: boolean;
}

export interface Venue {
  id: string;
  name: string;
  address: string | null;
  mapEmbedUrl: string | null;
  isPublic: boolean;
  isActive: boolean;
  rooms: Room[];
}

export interface Ijaza {
  id: string;
  title: string;
  riwaya: Riwaya | null;
  grantedBy: string | null;
  year: number | null;
  documentUrl: string | null;
}

export interface TeacherSummary {
  id: string;
  title: string | null;
  firstName: string;
  lastName: string;
}

export interface Teacher extends TeacherSummary {
  gender: Gender;
  phone: string | null;
  specialization: string | null;
  hireDate: string | null;
  contractType?: "VOLUNTEER" | "PAID";
  monthlySalary?: string | null;
  isActive: boolean;
  notes: string | null;
  studentId: string | null;
  user: { id: string; email: string | null; phone: string | null; isActive: boolean } | null;
  _count?: { classes: number; ijazas: number };
  ijazas?: Ijaza[];
  student?: { id: string; code: string; firstName: string; lastName: string } | null;
  classes?: { role: TeachingRole; class: { id: string; name: string; isActive: boolean; academicYear: { name: string } } }[];
}

export interface Slot {
  id?: string;
  day: Day;
  kind: SlotKind;
  startTime: string;
  endTime: string;
  timeLabel: string | null;
}

export interface ClassItem {
  id: string;
  academicYearId: string;
  name: string;
  level: string | null;
  quranScope: string | null;
  audience: Audience;
  genderPolicy: GenderPolicy;
  capacity: number;
  riwaya: Riwaya | null;
  monthlyFee: string | null;
  requiresMembership: boolean;
  isPublic: boolean;
  isActive: boolean;
  roomId: string | null;
  room: (Room & { venue: { id: string; name: string } }) | null;
  academicYear: { id: string; name: string };
  teachers: { teacherId: string; role: TeachingRole; teacher: TeacherSummary }[];
  scheduleSlots: Slot[];
  _count: { enrollments: number };
}

export interface ClassDetail extends ClassItem {
  enrollments: {
    id: string;
    startDate: string;
    monthlyFeeOverride: string | null;
    student: {
      id: string;
      code: string;
      firstName: string;
      lastName: string;
      gender: Gender;
      status: StudentStatus;
      phone: string | null;
      /** Current-year membership (0 or 1). */
      memberships: { memberNumber: string; charge: { status: "OPEN" | "PAID" | "CANCELLED" } }[];
    };
  }[];
}

export interface Guardian {
  id: string;
  fullName: string;
  phone: string;
  phone2: string | null;
  notes: string | null;
}

export interface GuardianWithStudents extends Guardian {
  students: { relation: Relation; student: { id: string; code: string; firstName: string; lastName: string; status: StudentStatus } }[];
}

export interface StudentListItem {
  id: string;
  code: string;
  firstName: string;
  lastName: string;
  gender: Gender;
  dateOfBirth: string | null;
  phone: string | null;
  status: StudentStatus;
  guardians: { guardian: { fullName: string; phone: string } }[];
  enrollments: { class: { id: string; name: string } }[];
}

export interface StudentDetail {
  id: string;
  code: string;
  firstName: string;
  lastName: string;
  firstNameLatin: string | null;
  lastNameLatin: string | null;
  gender: Gender;
  dateOfBirth: string | null;
  phone: string | null;
  address: string | null;
  riwaya: Riwaya | null;
  status: StudentStatus;
  photoConsent: boolean;
  photoUrl: string | null;
  notes: string | null;
  joinedAt: string;
  guardians: { guardianId: string; relation: Relation; isPrimary: boolean; isPayer: boolean; guardian: Guardian }[];
  enrollments: {
    id: string;
    status: "ACTIVE" | "ENDED";
    startDate: string;
    endDate: string | null;
    monthlyFeeOverride: string | null;
    class: { id: string; name: string; monthlyFee: string | null; isActive: boolean; academicYear: { name: string } };
  }[];
  teacherProfile: { id: string; title: string | null } | null;
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

// ───────────── Fees & memberships (Slice 3) ─────────────

export type ChargeKind = "MONTHLY" | "ONE_OFF" | "MEMBERSHIP";
export type ChargeState = "UNPAID" | "PARTIAL" | "OVERDUE" | "PAID" | "CANCELLED";

export interface FeeItem {
  id: string;
  name: string;
  defaultAmount: string;
  isActive: boolean;
}

export interface Charge {
  id: string;
  studentId: string;
  kind: ChargeKind;
  label: string;
  amount: string;
  paidAmount: string;
  dueDate: string;
  period: string | null;
  status: "OPEN" | "PAID" | "CANCELLED";
  cancelReason: string | null;
  createdAt: string;
  state: ChargeState;
  student: { id: string; code: string; firstName: string; lastName: string };
  enrollment: { class: { id: string; name: string } } | null;
  feeItem: { id: string; name: string } | null;
}

export interface ChargePage extends Page<Charge> {
  totals: { amount: string; paid: string };
}

export interface Balance {
  balance: string;
  overdue: string;
}

export interface StudentAccount extends Balance {
  charges: Charge[];
  credit: string;
  family:
    | (Balance & {
        guardian: { id: string; fullName: string };
        credit: string;
        students: (Balance & { id: string; code: string; firstName: string; lastName: string; status: StudentStatus })[];
      })
    | null;
  membership: {
    year: { id: string; name: string; membershipFee: string | null } | null;
    current: { id: string; memberNumber: string; isNew: boolean; formReceived: boolean; state: ChargeState } | null;
  };
}

export interface GenerationResult {
  period: string;
  created: number;
  existing: number;
  free: number;
  notBillable: number;
}

interface MemberStudent {
  id: string;
  code: string;
  firstName: string;
  lastName: string;
  gender: Gender;
  dateOfBirth: string | null;
  phone: string | null;
  status: StudentStatus;
  guardians: { guardian: { fullName: string; phone: string } }[];
}

export interface Membership {
  id: string;
  studentId: string;
  memberNumber: string;
  isNew: boolean;
  formReceived: boolean;
  createdAt: string;
  state: ChargeState;
  student: MemberStudent;
  charge: { id: string; amount: string; paidAmount: string; status: "OPEN" | "PAID" | "CANCELLED"; dueDate: string };
}

export interface MembershipList {
  year: { id: string; name: string; membershipFee: string | null; windowStart: string | null; windowEnd: string | null };
  summary: { total: number; paid: number; isNew: number; expected: string; collected: string; missing: number };
  items: Membership[];
}

export interface MissingMember extends MemberStudent {
  memberships: { id: string }[];
  enrollments: { class: { id: string; name: string } }[];
}

// ───────────── Payments (Slice 4) ─────────────

export type PaymentMethod = "CASH" | "BANK_TRANSFER" | "CHECK" | "MOBILE" | "OTHER";
export const PAYMENT_METHODS: PaymentMethod[] = ["CASH", "BANK_TRANSFER", "CHECK", "MOBILE", "OTHER"];

export interface PayerInfo {
  type: "GUARDIAN" | "STUDENT";
  id: string;
  name: string;
  phone: string | null;
}

export interface OpenCharges {
  payer: PayerInfo;
  charges: (Omit<Charge, "enrollment" | "feeItem"> & { remaining: string })[];
  credit: string;
}

export interface PaymentListItem {
  id: string;
  receiptNumber: string;
  payerName: string;
  payerGuardianId: string | null;
  payerStudentId: string | null;
  amount: string;
  unallocatedAmount: string;
  method: PaymentMethod;
  reference: string | null;
  paidAt: string;
  voidedAt: string | null;
  receivedBy: { firstName: string; lastName: string };
}

export interface PaymentDetail extends PaymentListItem {
  notes: string | null;
  voidReason: string | null;
  voidedBy: { firstName: string; lastName: string } | null;
  publicPath: string;
  phone: string | null;
  payerGuardian: { id: string; fullName: string; phone: string } | null;
  payerStudent: { id: string; code: string; firstName: string; lastName: string; phone: string | null } | null;
  allocations: {
    chargeId: string;
    amount: string;
    fromCredit: boolean;
    charge: { id: string; label: string; kind: ChargeKind; amount: string; student: { id: string; code: string; firstName: string; lastName: string } };
  }[];
}

export interface PaymentPage extends Page<PaymentListItem> {
  totals: { amount: string };
}

export interface ReminderGroup {
  key: string;
  payer: PayerInfo;
  students: string[];
  charges: { id: string; label: string; remaining: string; dueDate: string; student: string }[];
  total: string;
  lastReminderAt: string | null;
}

export interface FinanceSummary {
  period: string;
  collected: string;
  payments: number;
  byMethod: { method: PaymentMethod; amount: string }[];
  outstanding: string;
  overdue: string;
  credit: string;
  month: { billed: string; paid: string; rate: number | null };
  byClass: { id: string; name: string; billed: string; paid: string; count: number }[];
}

export type TemplateKind = "RECEIPT" | "PAYMENT_REMINDER" | "MEMBERSHIP_REMINDER" | "ABSENCE" | "CLASS_ANNOUNCEMENT";

export interface SchoolSettings {
  school: { name: string; address: string | null; phone: string | null };
  billingDay: number;
  paymentDueDays: number;
  receiptFooter: string | null;
  contactPhone: string | null;
  whatsappPhone: string | null;
  showHijriDates: boolean;
  whatsappTemplates: Partial<Record<TemplateKind, string>>;
  aboutHtml: string | null;
  mapEmbedUrl: string | null;
  socialLinks: { facebook?: string; instagram?: string; youtube?: string } | null;
}

// ───────────── Attendance (Slice 5) ─────────────

export type AttendanceStatus = "PRESENT" | "ABSENT" | "LATE" | "EXCUSED";
export const ATTENDANCE_STATUSES: AttendanceStatus[] = ["PRESENT", "ABSENT", "LATE", "EXCUSED"];
export type AttendanceCounts = Record<AttendanceStatus, number>;

interface TeacherBrief {
  id: string;
  title: string | null;
  firstName: string;
  lastName: string;
  gender: Gender;
}

export interface SessionBrief {
  id: string;
  classId: string;
  date: string;
  startTime: string;
  endTime: string | null;
  status: "HELD" | "CANCELLED";
  cancelReason: string | null;
  notes: string | null;
  teacher: TeacherBrief | null;
}

export interface DayItem {
  class: {
    id: string;
    name: string;
    students: number;
    room: { name: string; venue: { name: string } } | null;
    teacher: TeacherBrief | null;
  };
  slot: { day: Day; kind: SlotKind; startTime: string; endTime: string; timeLabel: string | null } | null;
  startTime: string;
  session: (SessionBrief & { counts?: AttendanceCounts }) | null;
}

export interface DayView {
  date: string;
  weekday: Day;
  items: DayItem[];
  classes: { id: string; name: string }[];
}

export interface SessionDetail extends SessionBrief {
  class: { id: string; name: string };
  roster: {
    id: string;
    code: string;
    firstName: string;
    lastName: string;
    gender: Gender;
    phone?: string | null;
    guardians?: { guardian: { id: string; fullName: string; phone: string } }[];
    attendance: { status: AttendanceStatus; note: string | null; markedAt: string } | null;
  }[];
}

export interface ClassAttendance {
  from: string;
  to: string;
  sessions: { id: string; date: string; startTime: string; status: "HELD" | "CANCELLED"; cancelReason: string | null; attendance: Record<string, AttendanceStatus> }[];
  students: { id: string; code: string; firstName: string; lastName: string; counts: AttendanceCounts; rate: number | null }[];
  counts: AttendanceCounts;
  rate: number | null;
}

export interface StudentAttendance {
  from: string;
  to: string;
  records: { status: AttendanceStatus; note: string | null; session: { id: string; date: string; startTime: string; class: { id: string; name: string } } }[];
  counts: AttendanceCounts;
  rate: number | null;
}

export interface AttendanceSummary {
  from: string;
  to: string;
  rate: number | null;
  counts: AttendanceCounts;
  classes: { id: string; name: string; counts: AttendanceCounts; rate: number | null; held: number; cancelled: number }[];
  lowStudents: { id: string; firstName: string; lastName: string; counts: AttendanceCounts; rate: number | null }[];
}

// ───────────── Hifz (Slice 6) ─────────────

export type HifzEntryType = "NEW" | "RECENT_REVISION" | "OLD_REVISION" | "INITIAL_LEVEL";

export type RangeInput =
  | { mode: "THUMN"; fromThumn: number; toThumn: number }
  | { mode: "SURAH"; fromSurah: number; toSurah: number }
  | { mode: "AYAH"; fromSurah: number; fromAyah: number; toSurah: number; toAyah: number };

export interface QuranMeta {
  riwaya: Riwaya;
  version: number | null;
  verified: boolean;
  surahs: { id: number; nameAr: string; ayahCount: number }[];
  athman: { number: number; hizb: number; juz: number; startSurah: number; startAyah: number }[];
}

export interface HifzSummary {
  riwaya: Riwaya;
  memorizedAyahs: number;
  memorizedAthman: number;
  completedAhzab: number;
  currentThumn: number | null;
  lastNewAt: string | null;
  lastRevisionAt: string | null;
  position: { hizb: number; thumn: number } | null;
}

export interface HifzEntry {
  id: string;
  type: HifzEntryType;
  fromSurah: number;
  fromAyah: number;
  toSurah: number;
  toAyah: number;
  fromThumn: number;
  toThumn: number;
  rating: number | null;
  note: string | null;
}

export interface HifzSessionItem {
  id: string;
  date: string;
  notes: string | null;
  entries: HifzEntry[];
  teacher: { id: string; title: string | null; firstName: string; lastName: string };
  recordedBy: { id: string; firstName: string; lastName: string };
}

export interface StudentHifz {
  student: { id: string; code: string; firstName: string; lastName: string; declaredHifz: string | null };
  riwaya: Riwaya;
  verified: boolean;
  summary: (HifzSummary & { updatedAt: string }) | null;
  /** 480 characters: 0 none, 1 partial, 2 memorized. */
  athman: string;
  sessions: HifzSessionItem[];
}

export interface ClassHifz {
  class: { id: string; name: string };
  students: {
    id: string;
    code: string;
    firstName: string;
    lastName: string;
    summary: (HifzSummary & { daysSinceNew: number | null }) | null;
  }[];
}

// ───────────── News (Slice 7) ─────────────

export type NewsCategory = "ANNOUNCEMENT" | "ACTIVITY" | "THANKS" | "CONDOLENCE" | "ASSOCIATION";

export interface NewsAdminItem {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  category: NewsCategory;
  status: "DRAFT" | "PUBLISHED";
  publishedAt: string | null;
  updatedAt: string;
  createdAt: string;
  classId: string | null;
  hasCover: boolean;
  coverVersion: number | null;
  author: { firstName: string; lastName: string };
  class: { id: string; name: string } | null;
}

export interface NewsPostDetail extends Omit<NewsAdminItem, "author"> {
  bodyJson: { type: "doc"; content?: unknown[] };
  bodyHtml: string;
}

// ───────────── Exams & competitions ─────────────
export type EvaluationKind = "EXAM" | "COMPETITION";
export type EvaluationStatus = "OPEN" | "CLOSED";
export type CandidateState = "SCORED" | "PENDING" | "ABSENT";

export interface EvaluationBranch {
  id: string;
  name: string;
  quranScope: string | null;
  questionCount: number;
  hifzMax: string;
  tajwidMax: string;
  passScore: string | null;
  sortOrder: number;
  maxTotal: string;
  candidates?: number;
}

export interface EvaluationJuror {
  id: string;
  name: string;
  isPresident: boolean;
  teacherId: string | null;
}

export interface EvaluationListItem {
  id: string;
  kind: EvaluationKind;
  title: string;
  date: string;
  location: string | null;
  status: EvaluationStatus;
  class: { id: string; name: string } | null;
  branches: { id: string; name: string }[];
  candidates: number;
  cardsDone: number;
}

export interface EvaluationCandidate {
  id: string;
  number: number;
  branchId: string;
  studentId: string | null;
  studentCode: string | null;
  fullName: string;
  gender: Gender | null;
  phone: string | null;
  absent: boolean;
  hifzScore: string | null;
  tajwidScore: string | null;
  notes: string | null;
  scoredAt: string | null;
  questionsFilled: number;
  state: CandidateState;
  total: string | null;
  passed: boolean | null;
}

export interface EvaluationDetail {
  id: string;
  kind: EvaluationKind;
  title: string;
  date: string;
  location: string | null;
  notes: string | null;
  status: EvaluationStatus;
  closedAt: string | null;
  class: { id: string; name: string } | null;
  academicYear: { id: string; name: string } | null;
  branches: EvaluationBranch[];
  jurors: EvaluationJuror[];
  candidates: EvaluationCandidate[];
  canManage: boolean;
  canScore: boolean;
}

export interface EvaluationQuestion {
  number: number;
  surahId: number | null;
  ayah: number | null;
  mistakes: string | null;
  note: string | null;
}

export interface EvaluationCard {
  evaluation: { id: string; title: string; kind: EvaluationKind; date: string; status: EvaluationStatus };
  branch: EvaluationBranch;
  candidate: EvaluationCandidate;
  questions: EvaluationQuestion[];
  scoredBy: { firstName: string; lastName: string } | null;
  canScore: boolean;
}

export interface EvaluationResults {
  evaluation: Pick<EvaluationDetail, "id" | "title" | "kind" | "date" | "location" | "status" | "class">;
  jurors: EvaluationJuror[];
  branches: {
    branch: EvaluationBranch;
    rows: (EvaluationCandidate & { rank: number | null })[];
    stats: {
      candidates: number;
      scored: number;
      absent: number;
      pending: number;
      passed: number | null;
      average: string | null;
      best: string | null;
    };
  }[];
}

export interface StudentEvaluation extends EvaluationCandidate {
  evaluation: { id: string; title: string; kind: EvaluationKind; date: string; status: EvaluationStatus };
  branch: { id: string; name: string; maxTotal: string; passScore: string | null };
}

export interface EvaluationCards {
  evaluation: Pick<EvaluationDetail, "id" | "title" | "kind" | "date" | "location" | "status">;
  branches: EvaluationBranch[];
  jurors: EvaluationJuror[];
  cards: { candidate: EvaluationCandidate; questions: EvaluationQuestion[] }[];
}
