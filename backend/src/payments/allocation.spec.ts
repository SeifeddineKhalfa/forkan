import { Prisma } from '../generated/prisma/client.js';
import { amountInWords, numberInWords } from '../pdf/arabic-words.js';
import { allocate } from './allocation.js';

const D = (v: string | number) => new Prisma.Decimal(v);
const charges = [
  { id: 'oct', remaining: D(15) },
  { id: 'nov', remaining: D(15) },
  { id: 'books', remaining: D('8.5') },
];
/** ApiError carries the code on `.code`, not in the message. */
const code = (c: string) => expect.objectContaining({ code: c });
const flat = (r: ReturnType<typeof allocate>) => ({
  allocations: r.allocations.map((a) => [a.chargeId, a.amount.toFixed(3)]),
  unallocated: r.unallocated.toFixed(3),
});

describe('allocate', () => {
  it('pays the oldest charges first, leaving the last one partial', () => {
    expect(flat(allocate(D(20), charges))).toEqual({
      allocations: [
        ['oct', '15.000'],
        ['nov', '5.000'],
      ],
      unallocated: '0.000',
    });
  });

  it('keeps an overpayment as credit', () => {
    expect(flat(allocate(D(50), charges)).unallocated).toBe('11.500');
  });

  it('accepts a manual split and keeps the rest as credit', () => {
    const r = allocate(D(20), charges, [{ chargeId: 'books', amount: D('8.5') }]);
    expect(flat(r)).toEqual({ allocations: [['books', '8.500']], unallocated: '11.500' });
  });

  it('rejects manual splits over a charge, over the amount, or on unknown charges', () => {
    expect(() => allocate(D(20), charges, [{ chargeId: 'oct', amount: D(16) }])).toThrow(code('ALLOCATION_EXCEEDS_CHARGE'));
    expect(() =>
      allocate(D(20), charges, [
        { chargeId: 'oct', amount: D(15) },
        { chargeId: 'nov', amount: D(15) },
      ]),
    ).toThrow(code('ALLOCATION_EXCEEDS_AMOUNT'));
    expect(() => allocate(D(5), charges, [{ chargeId: 'x', amount: D(5) }])).toThrow(code('CHARGE_NOT_OPEN'));
  });
});

describe('Arabic amounts in words', () => {
  it.each([
    [1, 'واحد'],
    [11, 'أحد عشر'],
    [25, 'خمسة وعشرون'],
    [100, 'مائة'],
    [215, 'مائتان وخمسة عشر'],
    [1000, 'ألف'],
    [2000, 'ألفان'],
    [3500, 'ثلاثة آلاف وخمسمائة'],
    [12000, 'اثنا عشر ألفاً'],
  ])('%i → %s', (n, words) => expect(numberInWords(n)).toBe(words));

  it.each([
    ['1', 'دينار واحد'],
    ['2', 'ديناران'],
    ['5', 'خمسة دنانير'],
    ['15', 'خمسة عشر ديناراً'],
    ['15.500', 'خمسة عشر ديناراً و500 مليم'],
    ['100', 'مائة دينار'],
    ['0.750', '750 مليم'],
  ])('%s → %s', (amount, words) => expect(amountInWords(amount)).toBe(words));
});
