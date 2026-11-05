import ExcelJS from 'exceljs';
import { Readable } from 'node:stream';
import type { Cell } from './cells.js';
import { normalize } from './normalize.js';

export interface SheetData {
  name: string;
  headers: string[];
  rows: { rowNumber: number; cells: Cell[] }[];
}

export interface ParsedWorkbook {
  students: SheetData | null;
  teachers: SheetData | null;
}

/** Flattens exceljs values (rich text, formulas, hyperlinks) to plain cells. */
function flatten(v: ExcelJS.CellValue): Cell {
  if (v === null || v === undefined) return null;
  if (v instanceof Date || typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return v;
  if (typeof v === 'object') {
    if ('richText' in v) return v.richText.map((r) => r.text).join('');
    if ('result' in v) return flatten(v.result as ExcelJS.CellValue);
    if ('text' in v) return String(v.text);
    if ('error' in v) return null;
  }
  return null;
}

function readSheet(ws: ExcelJS.Worksheet): SheetData {
  // The header is the first row with at least two non-empty cells (some files start with a title row).
  let headerRow = 1;
  for (let r = 1; r <= Math.min(ws.rowCount, 10); r++) {
    const filled = (ws.getRow(r).values as ExcelJS.CellValue[]).filter((c) => flatten(c) !== null && String(flatten(c)).trim() !== '');
    if (filled.length >= 2) {
      headerRow = r;
      break;
    }
  }
  const width = ws.columnCount;
  const headers = Array.from({ length: width }, (_, i) => String(flatten(ws.getRow(headerRow).getCell(i + 1).value) ?? '').trim());
  const rows: SheetData['rows'] = [];
  for (let r = headerRow + 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const cells = Array.from({ length: width }, (_, i) => flatten(row.getCell(i + 1).value));
    if (cells.some((c) => c !== null && String(c).trim() !== '')) rows.push({ rowNumber: r, cells });
  }
  return { name: ws.name, headers, rows };
}

const isTeachers = (name: string) => /مودب|معلم|مشايخ|شيخ|teacher|enseign|prof/.test(normalize(name));
// Patterns are written in normalised form ("قوائم" → "قوايم").
const isInstructions = (name: string) => /تعليمات|instructions|notice|lists|قوايم/.test(normalize(name));

/** Reads .xlsx or .csv; the teachers sheet is optional and recognised by its name. */
export async function readWorkbook(buffer: Buffer, fileName: string): Promise<ParsedWorkbook> {
  const wb = new ExcelJS.Workbook();
  if (/\.csv$/i.test(fileName)) {
    await wb.csv.read(Readable.from(buffer.toString('utf8').replace(/^﻿/, '')));
  } else {
    await wb.xlsx.load(buffer as unknown as ExcelJS.Buffer);
  }
  const sheets = wb.worksheets.filter(
    (ws) => ws.rowCount > 0 && (ws.state ?? 'visible') === 'visible' && !isInstructions(ws.name),
  );
  const teachers = sheets.find((ws) => isTeachers(ws.name));
  const students = sheets.find((ws) => ws !== teachers);
  return {
    students: students ? readSheet(students) : null,
    teachers: teachers ? readSheet(teachers) : null,
  };
}
