import type { PaymentMethod } from '../generated/prisma/client.js';
import { Prisma } from '../generated/prisma/client.js';
import { amountInWords } from '../pdf/arabic-words.js';
import { escapeHtml as e } from '../pdf/pdf.service.js';

export const METHOD_AR: Record<PaymentMethod, string> = {
  CASH: 'نقداً',
  BANK_TRANSFER: 'تحويل بنكي',
  CHECK: 'صكّ',
  MOBILE: 'دفع بالهاتف',
  OTHER: 'أخرى',
};

export interface ReceiptData {
  school: { name: string; address: string | null; phone: string | null; footer: string | null; hijri: boolean };
  receiptNumber: string;
  paidAt: Date;
  payerName: string;
  amount: Prisma.Decimal;
  method: PaymentMethod;
  reference: string | null;
  notes: string | null;
  receivedBy: string;
  lines: { student: string; label: string; amount: Prisma.Decimal }[];
  voided: { at: Date; reason: string | null } | null;
}

const TZ = 'Africa/Tunis';
/** "+21672390000" → "+216 72 390 000". */
const phone = (p: string) => p.replace(/^\+216(\d{2})(\d{3})(\d{3})$/, '+216 $1 $2 $3');
/** Figures stay LTR, the currency follows them in the Arabic reading order. */
const money = (d: Prisma.Decimal) => `<span class="num">${d.toFixed(3)}</span> د.ت`;
const gregorian = (d: Date) =>
  new Intl.DateTimeFormat('ar-TN', { timeZone: TZ, day: 'numeric', month: 'long', year: 'numeric', numberingSystem: 'latn' }).format(d);
const hijri = (d: Date) =>
  new Intl.DateTimeFormat('ar-TN-u-ca-islamic-umalqura', { timeZone: TZ, day: 'numeric', month: 'long', year: 'numeric', numberingSystem: 'latn' }).format(d);
const time = (d: Date) => new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(d);

/** A5 receipt in the association's name (spec A5). */
export function receiptHtml(r: ReceiptData, fontCss: string): string {
  const allocated = r.lines.reduce((a, l) => a.add(l.amount), new Prisma.Decimal(0));
  const credit = r.amount.sub(allocated);
  const rows = r.lines
    .map((l) => `<tr><td>${e(l.student)}</td><td>${e(l.label)}</td><td class="money">${money(l.amount)}</td></tr>`)
    .join('');

  return `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<style>
${fontCss}
@page { size: A5; }
body { margin: 0; color: #111; font-size: 11.5pt; line-height: 1.6; }
header { text-align: center; border-bottom: 2px solid #0f5132; padding-bottom: 6px; margin-bottom: 10px; }
header h1 { margin: 0; font-size: 16pt; color: #0f5132; }
header p { margin: 0; font-size: 9.5pt; color: #444; }
.title { display: flex; justify-content: space-between; align-items: baseline; margin: 8px 0; }
.title h2 { margin: 0; font-size: 14pt; }
.num { direction: ltr; unicode-bidi: isolate; white-space: nowrap; }
.muted { color: #555; font-size: 9.5pt; }
.amount { border: 1.5px solid #0f5132; border-radius: 6px; padding: 6px 10px; margin: 10px 0; background: #f1f8f4; }
.amount strong { font-size: 15pt; }
table { width: 100%; border-collapse: collapse; margin-top: 6px; font-size: 10.5pt; }
th, td { border: 1px solid #bbb; padding: 3px 6px; text-align: start; }
th { background: #eee; }
td.money { white-space: nowrap; }
.sign { display: flex; justify-content: space-between; margin-top: 22px; font-size: 10pt; }
footer { margin-top: 14px; border-top: 1px solid #ccc; padding-top: 4px; text-align: center; font-size: 9pt; color: #555; }
.void { position: fixed; top: 38%; left: 0; right: 0; text-align: center; transform: rotate(-24deg);
  font-size: 64pt; font-weight: 700; color: rgba(200, 0, 0, 0.28); border: 6px solid rgba(200, 0, 0, 0.28);
  margin: 0 18%; border-radius: 12px; }
</style>
</head>
<body>
${r.voided ? `<div class="void">ملغى</div>` : ''}
<header>
  <h1>${e(r.school.name)}</h1>
  ${r.school.address ? `<p>${e(r.school.address)}</p>` : ''}
  ${r.school.phone ? `<p>الهاتف: <bdi dir="ltr">${e(phone(r.school.phone))}</bdi></p>` : ''}
</header>
<div class="title">
  <h2>وصل خلاص عدد <span class="num">${e(r.receiptNumber)}</span></h2>
  <div class="muted">${gregorian(r.paidAt)} · <span class="num">${time(r.paidAt)}</span>${r.school.hijri ? `<br>${hijri(r.paidAt)}` : ''}</div>
</div>
<p>وصلنا من السيد(ة): <strong>${e(r.payerName)}</strong></p>
<div class="amount">
  المبلغ: <strong>${money(r.amount)}</strong><br>
  فقط ${amountInWords(r.amount.toFixed(3))} لا غير
</div>
${
  r.lines.length
    ? `<table><thead><tr><th>الطالب(ة)</th><th>البيان</th><th>المبلغ</th></tr></thead><tbody>${rows}</tbody></table>`
    : ''
}
${credit.gt(0) ? `<p>رصيد دائن: <strong>${money(credit)}</strong> <span class="muted">(يُخصم آلياً من المعاليم القادمة)</span></p>` : ''}
<p>طريقة الدفع: ${METHOD_AR[r.method]}${r.reference ? ` — المرجع: <span class="num">${e(r.reference)}</span>` : ''}</p>
${r.notes ? `<p class="muted">${e(r.notes)}</p>` : ''}
${r.voided ? `<p style="color:#b00">أُلغي هذا الوصل${r.voided.reason ? `: ${e(r.voided.reason)}` : ''}</p>` : ''}
<div class="sign"><span>المستلم(ة): ${e(r.receivedBy)}</span><span>الإمضاء والختم</span></div>
${r.school.footer ? `<footer>${e(r.school.footer)}</footer>` : ''}
</body>
</html>`;
}
