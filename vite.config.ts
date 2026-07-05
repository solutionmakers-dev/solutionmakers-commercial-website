/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
export default defineConfig({
  // Relative base so the build works at any mount path (GitHub Pages project URL, CDN, Worker)
  base: './',
  build: { target: 'es2022' },
  server: { host: true },
  // Unit tests are the src/*.test.ts files; the Playwright e2e specs live in
  // e2e/*.spec.ts and must NOT be swept up by vitest (they import
  // @playwright/test and only run under `pnpm e2e`).
  test: { include: ['src/**/*.test.ts'] },
})
