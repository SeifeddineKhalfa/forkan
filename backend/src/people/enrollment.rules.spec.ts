import { ApiError } from '../common/api-error.js';
import { checkCapacity, checkGenderPolicy } from './enrollment.rules.js';

const codeOf = (fn: () => void) => {
  try {
    fn();
    return null;
  } catch (e) {
    return (e as ApiError).code;
  }
};

describe('checkGenderPolicy', () => {
  it('lets anyone into a mixed imla', () => {
    expect(codeOf(() => checkGenderPolicy('MIXED', 'MALE'))).toBeNull();
    expect(codeOf(() => checkGenderPolicy('MIXED', 'FEMALE'))).toBeNull();
  });

  it('rejects the other gender in separated imla\'at', () => {
    expect(codeOf(() => checkGenderPolicy('FEMALE_ONLY', 'MALE'))).toBe('GENDER_POLICY_VIOLATION');
    expect(codeOf(() => checkGenderPolicy('MALE_ONLY', 'FEMALE'))).toBe('GENDER_POLICY_VIOLATION');
    expect(codeOf(() => checkGenderPolicy('FEMALE_ONLY', 'FEMALE'))).toBeNull();
  });
});

describe('checkCapacity', () => {
  it('blocks a full imla unless overridden', () => {
    expect(codeOf(() => checkCapacity(24, 25, false))).toBeNull();
    expect(codeOf(() => checkCapacity(25, 25, false))).toBe('CLASS_FULL');
    expect(codeOf(() => checkCapacity(25, 25, true))).toBeNull();
  });
});
