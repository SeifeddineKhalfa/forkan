import { execSync } from 'node:child_process';
import { Client } from 'pg';
import { E2E_DATABASE_URL } from './e2e-env.js';

/** Creates/migrates the e2e database and empties it before the run. */
export default async function setup() {
  const admin = new Client({ connectionString: E2E_DATABASE_URL.replace(/\/[^/]+$/, '/postgres') });
  await admin.connect();
  const exists = await admin.query("SELECT 1 FROM pg_database WHERE datname = 'forkan_test'");
  if (exists.rowCount === 0) await admin.query('CREATE DATABASE forkan_test');
  await admin.end();

  execSync('npx prisma migrate deploy', {
    env: { ...process.env, DATABASE_URL: E2E_DATABASE_URL },
    stdio: 'ignore',
  });

  const db = new Client({ connectionString: E2E_DATABASE_URL });
  await db.connect();
  const { rows } = await db.query<{ tablename: string }>(
    "SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'",
  );
  await db.query(`TRUNCATE ${rows.map((r) => `"${r.tablename}"`).join(', ')} CASCADE`);
  await db.end();

  // Read-only reference data the hifz tests need (surahs, ayah counts, athman).
  execSync('npx tsx prisma/reload-quran.ts', { env: { ...process.env, DATABASE_URL: E2E_DATABASE_URL }, stdio: 'ignore' });
}
