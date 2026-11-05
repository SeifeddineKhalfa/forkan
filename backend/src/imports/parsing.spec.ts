import { cellDate, parseAmount, parseGender, parseRelation, parseRiwaya } from './cells.js';
import { STUDENT_FIELDS, suggestMapping } from './fields.js';
import { normalize, personKey } from './normalize.js';

describe('normalize', () => {
  it('ignores diacritics, hamza forms, ta marbuta, tatweel and extra spaces', () => {
    expect(normalize('أحمـــد  بن عليّ')).toBe(normalize('احمد بن علي'));
    expect(normalize('فاطمة')).toBe(normalize('فاطمه'));
    expect(normalize('Prénom')).toBe('prenom');
  });

  it('builds the same person key for spelling variants', () => {
    const d = new Date('2014-07-01T00:00:00Z');
    expect(personKey('مريَم', 'الطرابلسيّ', d)).toBe(personKey('مريم', 'الطرابلسي', d));
  });
});

describe('cellDate', () => {
  const iso = (v: Parameters<typeof cellDate>[0]) => cellDate(v)?.toISOString().slice(0, 10);
  it('reads Tunisian dd/mm/yyyy, ISO and Excel serials', () => {
    expect(iso('01/07/2014')).toBe('2014-07-01');
    expect(iso('2014-07-01')).toBe('2014-07-01');
    expect(iso(41821)).toBe('2014-07-01');
    expect(iso(new Date(Date.UTC(2014, 6, 1)))).toBe('2014-07-01');
    expect(iso('2014')).toBe('2014-01-01');
  });

  it('returns undefined for empty and null for nonsense', () => {
    expect(cellDate('')).toBeUndefined();
    expect(cellDate('31/02/2014')).toBeNull();
    expect(cellDate('demain')).toBeNull();
  });
});

describe('enum cells', () => {
  it('understands Arabic and French spellings', () => {
    expect(parseGender('أنثى')).toBe('FEMALE');
    expect(parseGender('ذكر')).toBe('MALE');
    expect(parseGender('F')).toBe('FEMALE');
    expect(parseGender('xyz')).toBeNull();
    expect(parseGender('؟')).toBeUndefined(); // punctuation only = left empty
    expect(parseRelation('الأب')).toBe('FATHER');
    expect(parseRelation('أم')).toBe('MOTHER');
    expect(parseRelation('Mère')).toBe('MOTHER');
    expect(parseRelation('')).toBe('OTHER');
    expect(parseRiwaya('رواية قالون')).toBe('QALUN');
  });

  it('parses amounts with comma decimals', () => {
    expect(parseAmount('15,500')).toBe('15.500');
    expect(parseAmount(30)).toBe('30');
    expect(parseAmount('')).toBeUndefined();
    expect(parseAmount('abc')).toBeUndefined();
    expect(parseAmount('1.2345')).toBeNull();
  });
});

describe('suggestMapping', () => {
  it('matches template headers and common synonyms, each column once', () => {
    const m = suggestMapping(STUDENT_FIELDS, ['الإسم', 'اللقب', 'الجنس', 'تاريخ الميلاد', 'هاتف الأب', 'الحلقة', 'xyz']);
    expect(m.firstName).toBe(0);
    expect(m.lastName).toBe(1);
    expect(m.gender).toBe(2);
    expect(m.dateOfBirth).toBe(3);
    expect(m.guardianPhone).toBe(4);
    expect(m.className).toBe(5);
    expect(m.notes).toBeNull();
  });
});
