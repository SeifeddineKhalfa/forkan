/**
 * Amounts in Arabic words for receipts ("فقط خمسة عشر ديناراً و500 مليم لا غير").
 * Dinar is masculine; the counted noun follows the usual rules (1, 2, 3–10, 11–99, 100s).
 */

const ONES = ['', 'واحد', 'اثنان', 'ثلاثة', 'أربعة', 'خمسة', 'ستة', 'سبعة', 'ثمانية', 'تسعة', 'عشرة'];
const TEENS = ['', 'أحد عشر', 'اثنا عشر', 'ثلاثة عشر', 'أربعة عشر', 'خمسة عشر', 'ستة عشر', 'سبعة عشر', 'ثمانية عشر', 'تسعة عشر'];
const TENS = ['', '', 'عشرون', 'ثلاثون', 'أربعون', 'خمسون', 'ستون', 'سبعون', 'ثمانون', 'تسعون'];
const HUNDREDS = ['', 'مائة', 'مائتان', 'ثلاثمائة', 'أربعمائة', 'خمسمائة', 'ستمائة', 'سبعمائة', 'ثمانمائة', 'تسعمائة'];

/** 1..999 in words. */
function below1000(n: number): string {
  const parts: string[] = [];
  const h = Math.floor(n / 100);
  const r = n % 100;
  if (h) parts.push(HUNDREDS[h]);
  if (r) {
    if (r <= 10) parts.push(ONES[r]);
    else if (r < 20) parts.push(TEENS[r - 10]);
    else {
      const o = r % 10;
      parts.push(o ? `${ONES[o]} و${TENS[Math.floor(r / 10)]}` : TENS[Math.floor(r / 10)]);
    }
  }
  return parts.join(' و');
}

function thousands(t: number): string {
  if (t === 1) return 'ألف';
  if (t === 2) return 'ألفان';
  if (t <= 10) return `${below1000(t)} آلاف`;
  const r = t % 100;
  return `${below1000(t)} ${r >= 11 ? 'ألفاً' : 'ألف'}`;
}

/** Cardinal number in words (0 ≤ n < 1 000 000). */
export function numberInWords(n: number): string {
  if (n === 0) return 'صفر';
  const t = Math.floor(n / 1000);
  const rest = n % 1000;
  const parts: string[] = [];
  if (t) parts.push(thousands(t));
  if (rest) parts.push(below1000(rest));
  return parts.join(' و');
}

function dinars(n: number): string {
  if (n === 1) return 'دينار واحد';
  if (n === 2) return 'ديناران';
  const r = n % 100;
  const noun = r >= 3 && r <= 10 ? 'دنانير' : r >= 11 ? 'ديناراً' : 'دينار';
  return `${numberInWords(n)} ${noun}`;
}

/** "15.500" → "خمسة عشر ديناراً و500 مليم". Millimes stay in figures, as on Tunisian receipts. */
export function amountInWords(amount: string): string {
  const [whole, frac = ''] = amount.split('.');
  const d = Number(whole);
  const m = Number(frac.padEnd(3, '0').slice(0, 3));
  if (d === 0 && m === 0) return 'صفر دينار';
  const parts: string[] = [];
  if (d) parts.push(dinars(d));
  if (m) parts.push(`${m} مليم`);
  return parts.join(' و');
}
