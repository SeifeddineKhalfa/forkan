import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { scopeArgs, TENANT_MODELS } from './tenant-scope.js';

// Models with a schoolId that are intentionally not scoped by the extension.
const NOT_SCOPED = new Set(['SchoolSettings']); // schoolId is its primary key

function modelsWithSchoolId(): Set<string> {
  const schema = readFileSync(join(process.cwd(), 'prisma/schema.prisma'), 'utf8');
  const found = new Set<string>();
  for (const m of schema.matchAll(/^model (\w+) \{([\s\S]*?)^\}/gm)) {
    if (/^\s+schoolId\s/m.test(m[2])) found.add(m[1]);
  }
  return found;
}

describe('TENANT_MODELS', () => {
  it('matches every model with a schoolId column in schema.prisma', () => {
    const expected = [...modelsWithSchoolId()].filter((m) => !NOT_SCOPED.has(m)).sort();
    expect([...TENANT_MODELS].sort()).toEqual(expected);
  });
});

describe('scopeArgs', () => {
  const S = 'school-1';

  it('leaves non-tenant models untouched', () => {
    expect(scopeArgs('Surah', 'findMany', { where: { id: 1 } }, S)).toEqual({ where: { id: 1 } });
  });

  it('ANDs schoolId into list queries', () => {
    expect(scopeArgs('Student', 'findMany', { where: { status: 'ACTIVE' } }, S)).toEqual({
      where: { AND: [{ status: 'ACTIVE' }, { schoolId: S }] },
    });
    expect(scopeArgs('Student', 'count', undefined, S)).toEqual({ where: { schoolId: S } });
  });

  it('adds schoolId to unique lookups and single-row writes', () => {
    expect(scopeArgs('Student', 'findUnique', { where: { id: 'x' } }, S)).toEqual({
      where: { id: 'x', schoolId: S },
    });
    expect(scopeArgs('Student', 'update', { where: { id: 'x' }, data: { notes: 'n' } }, S)).toEqual({
      where: { id: 'x', schoolId: S },
      data: { notes: 'n' },
    });
    expect(scopeArgs('Student', 'delete', { where: { id: 'x' } }, S)).toEqual({
      where: { id: 'x', schoolId: S },
    });
  });

  it('cannot be overridden by a schoolId in the caller args', () => {
    const out = scopeArgs('Student', 'findUnique', { where: { id: 'x', schoolId: 'other' } }, S);
    expect(out.where).toEqual({ id: 'x', schoolId: S });
    const many = scopeArgs('Student', 'findMany', { where: { schoolId: 'other' } }, S);
    expect(many.where).toEqual({ AND: [{ schoolId: 'other' }, { schoolId: S }] });
  });

  it('injects schoolId into created rows', () => {
    expect(scopeArgs('Room', 'create', { data: { name: 'A' } }, S)).toEqual({
      data: { name: 'A', schoolId: S },
    });
    expect(scopeArgs('Room', 'createMany', { data: [{ name: 'A' }, { name: 'B' }] }, S)).toEqual({
      data: [
        { name: 'A', schoolId: S },
        { name: 'B', schoolId: S },
      ],
    });
    expect(
      scopeArgs('Room', 'upsert', { where: { id: 'r' }, create: { name: 'A' }, update: {} }, S),
    ).toEqual({ where: { id: 'r', schoolId: S }, create: { name: 'A', schoolId: S }, update: {} });
  });
});
