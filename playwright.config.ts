import { defineConfig } from '@playwright/test'

/**
 * End-to-end verification of the Solution Makers immersive site.
 *
 * Two projects exercise the two layouts the app actually ships:
 *   - mobile  — iPhone 14 Pro-ish portrait (393×852, touch, DPR 3)
 *   - desktop — 1440×900 pointer + wheel
 *
 * The suite drives the real gesture stack (Pointer Events on #scene, wheel,
 * synthetic touch via CDP) and asserts against the DOM overlay + URL hash.
 * WebGL is forced onto SwiftShader so the 3D boot succeeds headlessly rather
 * than tripping the mirror fallback.
 *
 * NOTE: intentionally NOT wired into CI (deploy-pages.yml runs `pnpm test`,
 * i.e. vitest) — e2e needs a browser download that is out of scope there.
 */

const WEBGL_ARGS = [
  '--use-gl=angle',
  '--use-angle=swiftshader',
  '--enable-unsafe-swiftshader',
  '--ignore-gpu-blocklist',
]

export default defineConfig({
  testDir: './e2e',
  outputDir: './e2e/.results',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 1,
  // Cap concurrency: each worker renders a full 3D scene under software WebGL
  // (SwiftShader), and too many at once starves fps enough to slow the
  // camera-settle awaits. Two keeps the wall-clock reasonable without thrash.
  workers: 2,
  reporter: [['list']],
  // Generous per-test budget: closed-loop travel + retried 3D taps run against
  // a deliberately slow software renderer.
  timeout: 120_000,
  expect: { timeout: 15_000 },

  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
    launchOptions: { args: WEBGL_ARGS },
  },

  projects: [
    {
      name: 'mobile',
      use: {
        browserName: 'chromium',
        viewport: { width: 393, height: 852 },
        deviceScaleFactor: 3,
        isMobile: true,
        hasTouch: true,
      },
    },
    {
      name: 'desktop',
      use: {
        browserName: 'chromium',
        viewport: { width: 1440, height: 900 },
        deviceScaleFactor: 1,
        hasTouch: false,
      },
    },
  ],

  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
