import { normalize } from './normalize.js';

export interface FieldDef {
  key: string;
  /** Header written in the template. */
  header: string;
  required?: boolean;
  /** Other headers schools commonly use (Arabic / French / English). */
  synonyms: string[];
  /** Shown in the template's second row. */
  example?: string;
}

export const STUDENT_FIELDS: FieldDef[] = [
  { key: 'code', header: 'رقم الطالب', synonyms: ['الرقم', 'رقم التسجيل', 'code', 'matricule', 'id'] },
  { key: 'firstName', header: 'الاسم', required: true, synonyms: ['اسم الطالب', 'prenom', 'first name'], example: 'مريم' },
  { key: 'lastName', header: 'اللقب', required: true, synonyms: ['nom', 'last name', 'family name'], example: 'الطرابلسي' },
  { key: 'firstNameLatin', header: 'Prénom', synonyms: ['prenom latin'] },
  { key: 'lastNameLatin', header: 'Nom', synonyms: ['nom latin'] },
  { key: 'gender', header: 'الجنس', required: true, synonyms: ['sexe', 'genre', 'gender'], example: 'أنثى' },
  { key: 'dateOfBirth', header: 'تاريخ الولادة', synonyms: ['تاريخ الميلاد', 'الولادة', 'date de naissance', 'naissance', 'birth'], example: '01/07/2014' },
  { key: 'phone', header: 'هاتف الطالب', synonyms: ['الهاتف', 'tel', 'telephone', 'phone'] },
  { key: 'address', header: 'العنوان', synonyms: ['adresse', 'address'] },
  { key: 'riwaya', header: 'الرواية', synonyms: ['riwaya'], example: 'قالون' },
  { key: 'className', header: 'الإملاء', synonyms: ['الحلقه', 'القسم', 'الفوج', 'المجموعه', 'classe', 'groupe', 'class'], example: 'إملاء الأطفال – السبت' },
  { key: 'guardianName', header: 'اسم الوليّ', synonyms: ['الولي', 'اسم الولي', 'اسم الاب', 'tuteur', 'parent', 'nom du parent'], example: 'محمد الطرابلسي' },
  { key: 'guardianPhone', header: 'هاتف الوليّ', synonyms: ['هاتف الولي', 'هاتف الاب', 'tel parent', 'telephone parent'], example: '22 123 456' },
  { key: 'guardianRelation', header: 'صلة الوليّ', synonyms: ['الصله', 'صله الولي', 'lien'], example: 'الأب' },
  { key: 'guardian2Name', header: 'اسم الوليّ 2', synonyms: ['اسم الام', 'الولي 2', 'parent 2'] },
  { key: 'guardian2Phone', header: 'هاتف الوليّ 2', synonyms: ['هاتف الام', 'tel parent 2'] },
  { key: 'guardian2Relation', header: 'صلة الوليّ 2', synonyms: ['الصله 2'] },
  { key: 'declaredHifz', header: 'مقدار الحفظ', synonyms: ['الحفظ', 'المحفوظ', 'عدد الاحزاب', 'niveau', 'hifz'], example: '12 حزب' },
  { key: 'openingBalance', header: 'رصيد سابق (د.ت)', synonyms: ['رصيد سابق', 'الرصيد', 'متخلد', 'solde', 'reste'], example: '30' },
  { key: 'joinedAt', header: 'تاريخ الالتحاق', synonyms: ['تاريخ التسجيل', 'date inscription'] },
  { key: 'notes', header: 'ملاحظات', synonyms: ['remarques', 'notes'] },
];

export const TEACHER_FIELDS: FieldDef[] = [
  { key: 'title', header: 'الصفة', synonyms: ['اللقب العلمي', 'titre'], example: 'المؤدّبة' },
  { key: 'firstName', header: 'الاسم', required: true, synonyms: ['prenom'], example: 'حبيبة' },
  { key: 'lastName', header: 'اللقب', required: true, synonyms: ['nom'], example: 'نصري' },
  { key: 'gender', header: 'الجنس', required: true, synonyms: ['sexe'], example: 'أنثى' },
  { key: 'phone', header: 'الهاتف', synonyms: ['tel', 'telephone'] },
  { key: 'specialization', header: 'الاختصاص', synonyms: ['specialite'] },
  { key: 'notes', header: 'ملاحظات', synonyms: ['remarques'] },
];

export type Mapping = Record<string, number | null>;

/** Best guess: exact header or synonym match (after normalisation), each column used once. */
export function suggestMapping(fields: FieldDef[], headers: string[]): Mapping {
  const norm = headers.map((h) => normalize(h));
  const used = new Set<number>();
  const mapping: Mapping = {};
  for (const f of fields) {
    const candidates = [f.header, ...f.synonyms].map(normalize);
    const idx = norm.findIndex((h, i) => !used.has(i) && h !== '' && candidates.includes(h));
    mapping[f.key] = idx >= 0 ? idx : null;
    if (idx >= 0) used.add(idx);
  }
  return mapping;
}
