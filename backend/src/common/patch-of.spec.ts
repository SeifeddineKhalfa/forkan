import { describe, expect, it } from 'vitest';
import { updateClassSchema } from '../classes/classes.schemas.js';
import { updateBranchSchema } from '../evaluations/evaluations.schemas.js';
import { updateNewsSchema } from '../news/news.schemas.js';
import { updateStudentSchema } from '../people/people.schemas.js';
import { updateVenueSchema } from '../structure/structure.schemas.js';

/** Regression: a PATCH must not reset fields it did not send to their create-time defaults. */
describe('update schemas (patchOf)', () => {
  it('deactivating an imla keeps its fee, capacity and policy', () => {
    expect(updateClassSchema.parse({ isActive: false })).toEqual({ isActive: false });
  });
  it('changing a student status keeps photo consent', () => {
    expect(updateStudentSchema.parse({ status: 'LEFT' })).toEqual({ status: 'LEFT' });
  });
  it('renaming a branch keeps its scale', () => {
    expect(updateBranchSchema.parse({ name: 'x' })).toEqual({ name: 'x' });
  });
  it('venue and news keep isPublic / category', () => {
    expect(updateVenueSchema.parse({ name: 'x' })).toEqual({ name: 'x' });
    expect(updateNewsSchema.parse({ title: 'xx' })).toEqual({ title: 'xx' });
  });
  it('still validates and transforms the fields that are sent', () => {
    expect(updateClassSchema.parse({ monthlyFee: '' })).toEqual({ monthlyFee: null });
    expect(() => updateClassSchema.parse({ capacity: 0 })).toThrow();
  });
});
