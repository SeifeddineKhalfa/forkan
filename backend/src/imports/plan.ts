import { ageOn } from '../common/dates.js';
import { normalizePhone } from '../common/schemas.js';
import type { Gender, GenderPolicy, GuardianRelation, Riwaya } from '../generated/prisma/client.js';
import { type Cell, cellDate, cellText, parseAmount, parseGender, parseRelation, parseRiwaya } from './cells.js';
import type { Mapping } from './fields.js';
import { normalize, personKey } from './normalize.js';
import type { SheetData } from './workbook.js';

/** What the database already contains, loaded once per dry run / commit. */
export interface PlanContext {
  today: Date;
  guardianRequiredUnderAge: number;
  classes: Map<string, { id: string; name: string; genderPolicy: GenderPolicy; capacity: number; activeCount: number; isActive: boolean }>;
  existingCodes: Set<string>;
  /** personKey (name|dob) and name|guardianPhone → student code */
  existingStudentKeys: Map<string, string>;
  guardiansByPhone: Map<string, { id: string; fullName: string; students: string[] }[]>;
  existingTeacherKeys: Set<string>;
}

/** Staff choices for rows whose guardian phone belongs to someone else: "row:slot" → guardianId | "NEW". */
export type Decisions = Record<string, string>;

export interface Issue {
  field?: string;
  code: string;
  params?: Record<string, string | number>;
}

export interface GuardianCandidate {
  id: string;
  fullName: string;
  students: string[];
}

export interface GuardianPlan {
  slot: 1 | 2;
  fullName: string;
  phone: string;
  relation: GuardianRelation;
  /** LINK = existing guardian, CREATE = new (shared by every row with the same phone + name). */
  action: 'LINK' | 'CREATE';
  guardianId?: string;
  newKey?: string;
  candidates?: GuardianCandidate[];
}

export interface StudentPlan {
  row: number;
  status: 'CREATE' | 'EXISTS' | 'ERROR';
  name: string;
  existingCode?: string;
  errors: Issue[];
  warnings: Issue[];
  guardians: GuardianPlan[];
  data?: {
    code?: string;
    firstName: string;
    lastName: string;
    firstNameLatin?: string;
    lastNameLatin?: string;
    gender: Gender;
    dateOfBirth?: Date;
    phone?: string;
    address?: string;
    riwaya?: Riwaya;
    declaredHifz?: string;
    notes?: string;
    joinedAt?: Date;
  };
  classId?: string;
  className?: string;
  openingBalance?: string;
}

export interface TeacherPlan {
  row: number;
  status: 'CREATE' | 'EXISTS' | 'ERROR';
  name: string;
  errors: Issue[];
  data?: { title?: string; firstName: string; lastName: string; gender: Gender; phone?: string; specialization?: string; notes?: string };
}

export interface ImportPlan {
  students: StudentPlan[];
  teachers: TeacherPlan[];
  counts: {
    students: { create: number; exists: number; error: number; warning: number };
    teachers: { create: number; exists: number; error: number };
    newGuardians: number;
    linkedGuardians: number;
    enrollments: number;
    openingBalances: number;
  };
}

const get = (cells: Cell[], mapping: Mapping, key: string): Cell | undefined => {
  const i = mapping[key];
  return i === null || i === undefined ? undefined : cells[i];
};

export function planImport(
  students: SheetData | null,
  studentMapping: Mapping,
  teachers: SheetData | null,
  teacherMapping: Mapping,
  ctx: PlanContext,
  decisions: Decisions = {},
): ImportPlan {
  const seenKeys = new Map<string, number>(); // in-file duplicates → first row
  const newGuardians = new Map<string, { fullName: string }>(); // phone|name → planned guardian
  const plannedPerClass = new Map<string, number>();
  const studentPlans: StudentPlan[] = [];

  for (const { rowNumber, cells } of students?.rows ?? []) {
    const text = (k: string) => cellText(get(cells, studentMapping, k));
    const errors: Issue[] = [];
    const warnings: Issue[] = [];
    const firstName = text('firstName');
    const lastName = text('lastName');
    const plan: StudentPlan = { row: rowNumber, status: 'CREATE', name: `${firstName} ${lastName}`.trim(), errors, warnings, guardians: [] };
    studentPlans.push(plan);

    if (!firstName) errors.push({ field: 'firstName', code: 'REQUIRED' });
    if (!lastName) errors.push({ field: 'lastName', code: 'REQUIRED' });
    const gender = parseGender(get(cells, studentMapping, 'gender'));
    if (gender === undefined) errors.push({ field: 'gender', code: 'REQUIRED' });
    if (gender === null) errors.push({ field: 'gender', code: 'INVALID_GENDER' });
    const dob = cellDate(get(cells, studentMapping, 'dateOfBirth'));
    if (dob === null) errors.push({ field: 'dateOfBirth', code: 'INVALID_DATE' });
    const joinedAt = cellDate(get(cells, studentMapping, 'joinedAt'));
    if (joinedAt === null) errors.push({ field: 'joinedAt', code: 'INVALID_DATE' });
    const riwaya = parseRiwaya(get(cells, studentMapping, 'riwaya'));
    if (riwaya === null) errors.push({ field: 'riwaya', code: 'INVALID_RIWAYA' });
    const balance = parseAmount(get(cells, studentMapping, 'openingBalance'));
    if (balance === null) errors.push({ field: 'openingBalance', code: 'INVALID_AMOUNT' });

    let phone: string | undefined;
    if (text('phone')) {
      phone = normalizePhone(text('phone')) ?? undefined;
      if (!phone) errors.push({ field: 'phone', code: 'INVALID_PHONE' });
    }

    // ── Guardians ──
    for (const slot of [1, 2] as const) {
      const p = slot === 1 ? 'guardian' : 'guardian2';
      const fullName = text(`${p}Name`);
      const rawPhone = text(`${p}Phone`);
      if (!fullName && !rawPhone) continue;
      if (!fullName) {
        errors.push({ field: `${p}Name`, code: 'REQUIRED' });
        continue;
      }
      if (!rawPhone) {
        errors.push({ field: `${p}Phone`, code: 'REQUIRED' });
        continue;
      }
      const gPhone = normalizePhone(rawPhone);
      if (!gPhone) {
        errors.push({ field: `${p}Phone`, code: 'INVALID_PHONE' });
        continue;
      }
      const g: GuardianPlan = { slot, fullName, phone: gPhone, relation: parseRelation(get(cells, studentMapping, `${p}Relation`)), action: 'CREATE' };
      const existing = ctx.guardiansByPhone.get(gPhone) ?? [];
      const sameName = existing.find((e) => normalize(e.fullName) === normalize(fullName));
      const decision = decisions[`${rowNumber}:${slot}`];
      if (!sameName && existing.length) {
        // Same phone, different name: family or a different person? Staff decides (default: a new
        // guardian). Candidates stay attached after a decision so it can be changed.
        g.candidates = existing;
        if (!decision) warnings.push({ field: `${p}Phone`, code: 'PHONE_SHARED', params: { slot } });
      }
      if (sameName) {
        Object.assign(g, { action: 'LINK', guardianId: sameName.id });
      } else if (decision && decision !== 'NEW' && existing.some((e) => e.id === decision)) {
        Object.assign(g, { action: 'LINK', guardianId: decision });
      } else {
        g.newKey = `${gPhone}|${normalize(fullName)}`;
        if (!newGuardians.has(g.newKey)) newGuardians.set(g.newKey, { fullName });
      }
      plan.guardians.push(g);
    }

    if (dob && plan.guardians.length === 0 && ageOn(dob, ctx.today) < ctx.guardianRequiredUnderAge) {
      errors.push({ field: 'guardianName', code: 'GUARDIAN_REQUIRED', params: { underAge: ctx.guardianRequiredUnderAge } });
    }

    // ── Imla' ──
    const className = text('className');
    if (className) {
      const klass = ctx.classes.get(normalize(className));
      if (!klass) errors.push({ field: 'className', code: 'UNKNOWN_CLASS', params: { name: className } });
      else if (!klass.isActive) errors.push({ field: 'className', code: 'CLASS_NOT_ACTIVE' });
      else if (gender && (klass.genderPolicy === 'MALE_ONLY' ? gender !== 'MALE' : klass.genderPolicy === 'FEMALE_ONLY' && gender !== 'FEMALE')) {
        errors.push({ field: 'className', code: 'GENDER_POLICY_VIOLATION' });
      } else {
        plan.classId = klass.id;
        plan.className = klass.name;
      }
    }

    // ── Already in the database / twice in the file ──
    const code = text('code');
    const keys = firstName && lastName
      ? [
          ...(dob ? [personKey(firstName, lastName, dob)] : []),
          ...plan.guardians.map((g) => `${normalize(firstName)}|${normalize(lastName)}|${g.phone}`),
        ]
      : [];
    const existingCode = (code && ctx.existingCodes.has(code) ? code : undefined) ?? keys.map((k) => ctx.existingStudentKeys.get(k)).find(Boolean);
    const dupKeys = [...keys, ...(code ? [`code:${code}`] : [])];
    const firstSeen = dupKeys.map((k) => seenKeys.get(k)).find((r) => r !== undefined);

    if (errors.length) {
      plan.status = 'ERROR';
    } else if (existingCode) {
      plan.status = 'EXISTS';
      plan.existingCode = existingCode;
    } else if (firstSeen !== undefined) {
      plan.status = 'ERROR';
      errors.push({ code: 'DUPLICATE_IN_FILE', params: { row: firstSeen } });
    } else {
      for (const k of dupKeys) seenKeys.set(k, rowNumber);
      if (plan.classId) {
        const klass = [...ctx.classes.values()].find((c) => c.id === plan.classId)!;
        const planned = (plannedPerClass.get(klass.id) ?? 0) + 1;
        if (klass.activeCount + planned > klass.capacity) {
          plan.status = 'ERROR';
          errors.push({ field: 'className', code: 'CLASS_FULL', params: { capacity: klass.capacity } });
        } else {
          plannedPerClass.set(klass.id, planned);
        }
      }
      if (plan.status === 'CREATE') {
        plan.data = {
          code: code || undefined,
          firstName,
          lastName,
          firstNameLatin: text('firstNameLatin') || undefined,
          lastNameLatin: text('lastNameLatin') || undefined,
          gender: gender!,
          dateOfBirth: dob ?? undefined,
          phone,
          address: text('address') || undefined,
          riwaya: riwaya ?? undefined,
          declaredHifz: text('declaredHifz') || undefined,
          notes: text('notes') || undefined,
          joinedAt: joinedAt ?? undefined,
        };
        if (balance && Number(balance) > 0) plan.openingBalance = balance;
      }
    }
  }

  // ── Teachers (optional sheet) ──
  const teacherPlans: TeacherPlan[] = [];
  const seenTeachers = new Set<string>();
  for (const { rowNumber, cells } of teachers?.rows ?? []) {
    const text = (k: string) => cellText(get(cells, teacherMapping, k));
    const errors: Issue[] = [];
    const firstName = text('firstName');
    const lastName = text('lastName');
    const plan: TeacherPlan = { row: rowNumber, status: 'CREATE', name: `${firstName} ${lastName}`.trim(), errors };
    teacherPlans.push(plan);
    if (!firstName) errors.push({ field: 'firstName', code: 'REQUIRED' });
    if (!lastName) errors.push({ field: 'lastName', code: 'REQUIRED' });
    const gender = parseGender(get(cells, teacherMapping, 'gender'));
    if (gender === undefined) errors.push({ field: 'gender', code: 'REQUIRED' });
    if (gender === null) errors.push({ field: 'gender', code: 'INVALID_GENDER' });
    let phone: string | undefined;
    if (text('phone')) {
      phone = normalizePhone(text('phone')) ?? undefined;
      if (!phone) errors.push({ field: 'phone', code: 'INVALID_PHONE' });
    }
    const key = `${normalize(firstName)}|${normalize(lastName)}`;
    if (errors.length) plan.status = 'ERROR';
    else if (ctx.existingTeacherKeys.has(key)) plan.status = 'EXISTS';
    else if (seenTeachers.has(key)) {
      plan.status = 'ERROR';
      errors.push({ code: 'DUPLICATE_IN_FILE' });
    } else {
      seenTeachers.add(key);
      plan.data = {
        title: text('title') || undefined,
        firstName,
        lastName,
        gender: gender!,
        phone,
        specialization: text('specialization') || undefined,
        notes: text('notes') || undefined,
      };
    }
  }

  const creating = studentPlans.filter((s) => s.status === 'CREATE');
  return {
    students: studentPlans,
    teachers: teacherPlans,
    counts: {
      students: {
        create: creating.length,
        exists: studentPlans.filter((s) => s.status === 'EXISTS').length,
        error: studentPlans.filter((s) => s.status === 'ERROR').length,
        warning: studentPlans.filter((s) => s.warnings.length > 0).length,
      },
      teachers: {
        create: teacherPlans.filter((t) => t.status === 'CREATE').length,
        exists: teacherPlans.filter((t) => t.status === 'EXISTS').length,
        error: teacherPlans.filter((t) => t.status === 'ERROR').length,
      },
      newGuardians: new Set(creating.flatMap((s) => s.guardians.filter((g) => g.newKey).map((g) => g.newKey))).size,
      linkedGuardians: creating.flatMap((s) => s.guardians.filter((g) => g.action === 'LINK')).length,
      enrollments: creating.filter((s) => s.classId).length,
      openingBalances: creating.filter((s) => s.openingBalance).length,
    },
  };
}
