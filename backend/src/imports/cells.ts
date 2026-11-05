import type { Gender, GuardianRelation, Riwaya } from '../generated/prisma/client.js';
import { normalize } from './normalize.js';

/** A raw cell as read from the sheet (exceljs values flattened). */
export type Cell = string | number | boolean | Date | null;

export function cellText(v: Cell | undefined): string {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : String(v);
  return String(v).trim();
}

const EXCEL_EPOCH = Date.UTC(1899, 11, 30);

/**
 * Dates come as real Excel dates, Excel serial numbers, "dd/mm/yyyy" (Tunisian habit),
 * "dd-mm-yyyy" or ISO "yyyy-mm-dd". Returns UTC midnight, or undefined when empty,
 * or null when present but unreadable.
 */
export function cellDate(v: Cell | undefined): Date | null | undefined {
  if (v === null || v === undefined || v === '') return undefined;
  let d: Date | null = null;
  if (v instanceof Date) {
    d = new Date(Date.UTC(v.getUTCFullYear(), v.getUTCMonth(), v.getUTCDate()));
  } else if (typeof v === 'number') {
    if (v > 1000 && v < 80000) d = new Date(EXCEL_EPOCH + Math.round(v) * 86_400_000);
  } else {
    const s = String(v).trim();
    let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(s);
    if (m) d = utc(+m[1], +m[2], +m[3]);
    m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/.exec(s);
    if (m) d = utc(+m[3], +m[2], +m[1]);
    if (/^\d{4}$/.test(s)) d = utc(+s, 1, 1); // only the birth year is known
  }
  if (!d || Number.isNaN(d.getTime()) || d.getUTCFullYear() < 1900 || d.getUTCFullYear() > 2100) return null;
  return d;
}

function utc(y: number, m: number, day: number) {
  const d = new Date(Date.UTC(y, m - 1, day));
  // Rejects 31/02 and friends instead of rolling over.
  return d.getUTCMonth() === m - 1 && d.getUTCDate() === day ? d : null;
}

const GENDERS: Record<string, Gender> = {
  ذكر: 'MALE', ذ: 'MALE', م: 'MALE', ولد: 'MALE', m: 'MALE', h: 'MALE', male: 'MALE', homme: 'MALE', garcon: 'MALE',
  انثي: 'FEMALE', انثى: 'FEMALE', ا: 'FEMALE', بنت: 'FEMALE', f: 'FEMALE', female: 'FEMALE', femme: 'FEMALE', fille: 'FEMALE',
};

export function parseGender(v: Cell | undefined): Gender | null | undefined {
  const s = normalize(cellText(v));
  if (!s) return undefined;
  return GENDERS[s] ?? null;
}

const RELATIONS: [RegExp, GuardianRelation][] = [
  [/^(ال)?(اب|والد)$|pere|father/, 'FATHER'],
  [/^(ال)?(ام|والده)$|mere|mother/, 'MOTHER'],
  [/^(ال)?اخ$|frere|brother/, 'BROTHER'],
  [/^(ال)?اخت$|soeur|sister/, 'SISTER'],
  [/^(ال)?جد(ه)?$|grand/, 'GRANDPARENT'],
  [/^(ال)?(عم|خال)$|oncle|uncle/, 'UNCLE'],
  [/^(ال)?(عمه|خاله)$|tante|aunt/, 'AUNT'],
];

export function parseRelation(v: Cell | undefined): GuardianRelation {
  const s = normalize(cellText(v));
  return RELATIONS.find(([re]) => re.test(s))?.[1] ?? 'OTHER';
}

export function parseRiwaya(v: Cell | undefined): Riwaya | null | undefined {
  const s = normalize(cellText(v));
  if (!s) return undefined;
  if (s.includes('قالون') || s.includes('qalun') || s.includes('qaloun')) return 'QALUN';
  if (s.includes('ورش') || s.includes('warsh')) return 'WARSH';
  if (s.includes('حفص') || s.includes('hafs')) return 'HAFS';
  return null;
}

/** "15", "15,500", "15.5 د.ت" → "15.500"-style string; undefined when empty, null when unreadable. */
export function parseAmount(v: Cell | undefined): string | null | undefined {
  if (typeof v === 'number') return v >= 0 ? String(Math.round(v * 1000) / 1000) : null;
  const s = cellText(v).replace(/[^\d.,-]/g, '').replace(',', '.');
  if (!s) return undefined;
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 && /^\d+(\.\d{1,3})?$/.test(s) ? s : null;
}
