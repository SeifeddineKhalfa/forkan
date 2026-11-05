import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().default(3001),
  DATABASE_URL: z.string().url(),
  JWT_ACCESS_SECRET: z.string().min(32),
  FRONTEND_URL: z.string().url(),
  GOTENBERG_URL: z.string().url(),
  // v1 serves a single school, resolved by slug at login.
  SCHOOL_SLUG: z.string().min(1).default('forkane'),
  // pg-boss cron jobs (monthly charges…). Off in e2e tests.
  JOBS_ENABLED: z.stringbool().default(true),
  // Lets the API expire the public site's news cache right after a change (frontend /revalidate).
  REVALIDATE_SECRET: z.string().min(16).optional(),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(raw: Record<string, unknown>): Env {
  const parsed = envSchema.safeParse(raw);
  if (!parsed.success) {
    const fields = parsed.error.issues.map((i) => i.path.join('.')).join(', ');
    throw new Error(`Invalid environment variables: ${fields}`);
  }
  return parsed.data;
}
