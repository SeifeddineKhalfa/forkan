import { money, normalizePhone, phoneSchema } from './schemas.js';

describe('normalizePhone', () => {
  it.each([
    ['22 123 456', '+21622123456'],
    ['+216 22 123 456', '+21622123456'],
    ['0021698765432', '+21698765432'],
    ['+33 6 12 34 56 78', '+33612345678'],
  ])('%s → %s', (raw, e164) => {
    expect(normalizePhone(raw)).toBe(e164);
  });

  it('rejects invalid numbers', () => {
    expect(normalizePhone('123')).toBeNull();
    expect(phoneSchema.safeParse('12').success).toBe(false);
  });
});

describe('money', () => {
  it('accepts millimes and returns a string', () => {
    expect(money.parse(20)).toBe('20');
    expect(money.parse('12.500')).toBe('12.500');
  });

  it('rejects more than 3 decimals and negatives', () => {
    expect(money.safeParse('1.2345').success).toBe(false);
    expect(money.safeParse(-1).success).toBe(false);
  });
});
