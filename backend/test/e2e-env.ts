export const E2E_DATABASE_URL =
  process.env.E2E_DATABASE_URL ?? 'postgresql://forkan:forkan@localhost:5433/forkan_test';

export const E2E_ENV = {
  NODE_ENV: 'test',
  DATABASE_URL: E2E_DATABASE_URL,
  JWT_ACCESS_SECRET: 'e2e-access-secret-that-is-long-enough-123',
  FRONTEND_URL: 'http://localhost:3000',
  GOTENBERG_URL: 'http://localhost:3002',
  SCHOOL_SLUG: 'e2e-school',
  JOBS_ENABLED: 'false',
  // No dot-folder here: Express refuses to send files from hidden directories.
  UPLOAD_DIR: 'test/tmp-uploads',
};
