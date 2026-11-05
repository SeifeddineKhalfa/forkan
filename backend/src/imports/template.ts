import ExcelJS from 'exceljs';
import { type FieldDef, STUDENT_FIELDS, TEACHER_FIELDS } from './fields.js';

const GENDERS = ['ذكر', 'أنثى'];
const RELATIONS = ['الأب', 'الأم', 'الأخ', 'الأخت', 'الجدّ', 'العمّ', 'العمّة', 'آخر'];
const RIWAYAT = ['قالون', 'ورش', 'حفص'];
const ROWS_WITH_LISTS = 1000;

function dataSheet(wb: ExcelJS.Workbook, name: string, fields: FieldDef[], lists: Record<string, string>) {
  const ws = wb.addWorksheet(name, { views: [{ rightToLeft: true, state: 'frozen', ySplit: 1 }] });
  ws.columns = fields.map((f) => ({ header: f.header, key: f.key, width: Math.max(14, f.header.length + 6) }));
  const header = ws.getRow(1);
  header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F5F4A' } };
  fields.forEach((f, i) => {
    if (f.required) header.getCell(i + 1).value = `${f.header} *`;
  });
  // Dropdowns referencing the hidden "قوائم" sheet (Excel caps inline lists at 255 characters).
  fields.forEach((f, i) => {
    const formula = lists[f.key];
    if (!formula) return;
    const col = ws.getColumn(i + 1).letter;
    for (let r = 2; r <= ROWS_WITH_LISTS; r++) {
      ws.getCell(`${col}${r}`).dataValidation = { type: 'list', allowBlank: true, formulae: [formula], showErrorMessage: false };
    }
  });
  // Text columns keep leading zeros of phone numbers and student codes.
  fields.forEach((f, i) => {
    if (/phone|code/i.test(f.key)) ws.getColumn(i + 1).numFmt = '@';
  });
  return ws;
}

/** Arabic import template: students, teachers, instructions, and the dropdown lists. */
export async function buildTemplate(classNames: string[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Forkan';

  const lists = wb.addWorksheet('قوائم', { state: 'veryHidden' });
  const columns: [string, string[]][] = [
    ['A', GENDERS],
    ['B', RELATIONS],
    ['C', RIWAYAT],
    ['D', classNames.length ? classNames : ['—']],
  ];
  for (const [col, values] of columns) values.forEach((v, i) => (lists.getCell(`${col}${i + 1}`).value = v));
  const ref = (col: string, n: number) => `'قوائم'!$${col}$1:$${col}$${n}`;
  const listFormulas = {
    gender: ref('A', GENDERS.length),
    guardianRelation: ref('B', RELATIONS.length),
    guardian2Relation: ref('B', RELATIONS.length),
    riwaya: ref('C', RIWAYAT.length),
    className: ref('D', Math.max(1, classNames.length)),
  };

  const students = dataSheet(wb, 'الطلبة', STUDENT_FIELDS, listFormulas);
  students.addRow(Object.fromEntries(STUDENT_FIELDS.map((f) => [f.key, f.example ?? ''])));
  students.getRow(2).font = { italic: true, color: { argb: 'FF808080' } };

  const teachers = dataSheet(wb, 'المؤدّبون', TEACHER_FIELDS, { gender: ref('A', GENDERS.length) });
  teachers.addRow(Object.fromEntries(TEACHER_FIELDS.map((f) => [f.key, f.example ?? ''])));
  teachers.getRow(2).font = { italic: true, color: { argb: 'FF808080' } };

  const help = wb.addWorksheet('تعليمات', { views: [{ rightToLeft: true }] });
  help.getColumn(1).width = 110;
  [
    'تعليمات الاستيراد',
    '1. سطر واحد لكلّ طالب في ورقة «الطلبة». الأعمدة المعلّمة بـ * إجبارية.',
    '2. احذف السطر الرمادي (المثال) أو اتركه: إن بقي سيُستورد كطالب.',
    '3. تاريخ الولادة بالشكل 01/07/2014. يُطلب وليّ لكلّ طالب دون 18 سنة.',
    '4. الهاتف التونسي يُكتب كما هو (22 123 456)؛ الأرقام الأجنبية بالمفتاح الدولي (+33…).',
    '5. اسم الإملاء يجب أن يطابق اسم إملاء موجود في المنظومة (القائمة المنسدلة).',
    '6. الإخوة: اكتب نفس اسم الوليّ ونفس الهاتف في سطر كلّ واحد منهم، فيُسجَّل الوليّ مرّة واحدة.',
    '7. «رصيد سابق» = مبلغ متخلّد قبل استعمال المنظومة، يُسجَّل كمعلوم غير خالص.',
    '8. «مقدار الحفظ» يُحفظ كما هو، ويُحوَّل إلى أحزاب وأثمان عند تفعيل متابعة الحفظ.',
    '9. يمكن إعادة استيراد نفس الملفّ بعد تصحيحه: الطلبة الموجودون مسبقاً لا يُكرَّرون.',
    '10. ورقة «المؤدّبون» اختيارية.',
  ].forEach((line, i) => {
    const cell = help.getCell(`A${i + 1}`);
    cell.value = line;
    if (i === 0) cell.font = { bold: true, size: 14 };
  });

  wb.views = [{ x: 0, y: 0, width: 10000, height: 20000, firstSheet: 1, activeTab: 1, visibility: 'visible' }];
  return Buffer.from(await wb.xlsx.writeBuffer());
}
