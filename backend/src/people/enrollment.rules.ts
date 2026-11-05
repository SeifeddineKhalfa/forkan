import { HttpStatus } from '@nestjs/common';
import { ApiError } from '../common/api-error.js';
import type { Gender, GenderPolicy } from '../generated/prisma/client.js';

/** Pure enrollment rules (spec A4), unit-tested in enrollment.rules.spec.ts. */
export function checkGenderPolicy(policy: GenderPolicy, gender: Gender) {
  if ((policy === 'MALE_ONLY' && gender !== 'MALE') || (policy === 'FEMALE_ONLY' && gender !== 'FEMALE')) {
    throw new ApiError(HttpStatus.UNPROCESSABLE_ENTITY, 'GENDER_POLICY_VIOLATION', { policy });
  }
}

export function checkCapacity(activeCount: number, capacity: number, override: boolean) {
  if (activeCount >= capacity && !override) {
    throw new ApiError(HttpStatus.CONFLICT, 'CLASS_FULL', { capacity });
  }
}
