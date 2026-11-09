/**
 * Root models that carry a `schoolId` column. Every query on these models made
 * through `PrismaService.forSchool()` is restricted to one school.
 * `tenant-scope.spec.ts` fails if this list drifts from schema.prisma.
 */
export const TENANT_MODELS = new Set<string>([
  'AcademicYear',
  'User',
  'Teacher',
  'Guardian',
  'Student',
  'Venue',
  'Room',
  'Class',
  'Enrollment',
  'ClassSession',
  'FeeItem',
  'Charge',
  'Payment',
  'Membership',
  'Counter',
  'HifzSession',
  'MessageLog',
  'NewsPost',
  'ImportJob',
  'AuditLog',
  'Evaluation',
  'EvaluationCandidate',
]);

const WHERE_OPS = new Set([
  'findMany',
  'findFirst',
  'findFirstOrThrow',
  'count',
  'aggregate',
  'groupBy',
  'updateMany',
  'updateManyAndReturn',
  'deleteMany',
]);

// Prisma accepts extra non-unique filters in a WhereUniqueInput.
const UNIQUE_WHERE_OPS = new Set([
  'findUnique',
  'findUniqueOrThrow',
  'update',
  'delete',
]);

type Args = Record<string, unknown> & {
  where?: Record<string, unknown>;
  data?: unknown;
  create?: Record<string, unknown>;
};

/**
 * Returns a copy of `args` restricted to `schoolId`. Pure, so it can be unit-tested.
 * Writes must use scalar foreign keys (`classId`), not nested `connect`, so that
 * injecting `schoolId` keeps the input valid.
 */
export function scopeArgs(
  model: string,
  operation: string,
  args: Args | undefined,
  schoolId: string,
): Args {
  const a: Args = { ...args };
  if (!TENANT_MODELS.has(model)) return a;

  if (WHERE_OPS.has(operation)) {
    a.where = a.where ? { AND: [a.where, { schoolId }] } : { schoolId };
  } else if (UNIQUE_WHERE_OPS.has(operation)) {
    a.where = { ...a.where, schoolId };
  } else if (operation === 'create') {
    a.data = { ...(a.data as Record<string, unknown>), schoolId };
  } else if (operation === 'createMany' || operation === 'createManyAndReturn') {
    const rows = Array.isArray(a.data) ? a.data : [a.data];
    a.data = rows.map((r) => ({ ...(r as Record<string, unknown>), schoolId }));
  } else if (operation === 'upsert') {
    a.where = { ...a.where, schoolId };
    a.create = { ...a.create, schoolId };
  }
  return a;
}
