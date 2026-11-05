/** Mirrors backend/src/imports (fields.ts, plan.ts). */

export const STUDENT_FIELDS = [
  "code", "firstName", "lastName", "firstNameLatin", "lastNameLatin", "gender", "dateOfBirth", "phone", "address",
  "riwaya", "className", "guardianName", "guardianPhone", "guardianRelation", "guardian2Name", "guardian2Phone",
  "guardian2Relation", "declaredHifz", "openingBalance", "joinedAt", "notes",
] as const;
export const TEACHER_FIELDS = ["title", "firstName", "lastName", "gender", "phone", "specialization", "notes"] as const;
export const REQUIRED = new Set(["firstName", "lastName", "gender"]);

export type Mapping = Record<string, number | null>;

export interface SheetPreview {
  name: string;
  headers: string[];
  rowCount: number;
  sample: string[][];
  mapping: Mapping;
}

export interface UploadResult {
  jobId: string;
  fileName: string;
  students: SheetPreview | null;
  teachers: SheetPreview | null;
}

export interface Issue {
  field?: string;
  code: string;
  params?: Record<string, string | number>;
}

export interface GuardianPlan {
  slot: 1 | 2;
  fullName: string;
  phone: string;
  action: "LINK" | "CREATE";
  candidates?: { id: string; fullName: string; students: string[] }[];
}

export interface RowPlan {
  row: number;
  status: "CREATE" | "EXISTS" | "ERROR";
  name: string;
  existingCode?: string;
  errors: Issue[];
  warnings?: Issue[];
  guardians?: GuardianPlan[];
  className?: string;
}

export interface Counts {
  students: { create: number; exists: number; error: number; warning: number };
  teachers: { create: number; exists: number; error: number };
  newGuardians: number;
  linkedGuardians: number;
  enrollments: number;
  openingBalances: number;
}

export interface ImportPlan {
  students: RowPlan[];
  teachers: RowPlan[];
  counts: Counts;
}

export interface CommitResult {
  counts: Counts;
  created: { students: number; teachers: number; guardians: number; enrollments: number; charges: number };
  skippedRows: number[];
}

export interface ImportJobSummary {
  id: string;
  fileName: string;
  status: "UPLOADED" | "VALIDATED" | "COMMITTED" | "FAILED";
  createdAt: string;
  report: { created?: CommitResult["created"]; counts?: Counts } | null;
  createdBy: { firstName: string; lastName: string };
}
