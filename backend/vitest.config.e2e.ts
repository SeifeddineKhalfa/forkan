import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';
import { E2E_ENV } from './test/e2e-env.js';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts'],
    env: E2E_ENV,
    globalSetup: ['./test/global-setup.ts'],
    fileParallelism: false,
  },
});
