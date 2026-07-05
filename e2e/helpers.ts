import type { CDPSession, Page } from '@playwright/test'
import { expect } from '@playwright/test'
import { STATIONS } from '../src/content/content'

/**
 * e2e helpers — drive the real gesture stack and locate 3D targets on screen.
 *
 * Two facts shape this file:
 *   1. The 3D scene (station cores, map nodes) has no DOM handle, and
 *   2. under headless SwiftShader the RAF loop runs at only a few fps, so the
 *      simulation (camera tweens + damping, all in clamped sim-time) advances
 *      far slower than wall-clock — fixed sleeps can't reliably settle it.
 *
 * Both are handled by the dev-only read-only seam the app exposes at
 * window.__smE2E (see src/nav/orchestrator.ts): `state()` lets us await real
 * camera/nav state, and `projectStation(id)` gives the live screen pixel of a
 * station core (usable for both a travel dive-tap and a map node-tap, since
 * the node sits at the same anchor). The seam is tree-shaken out of production.
 *
 * Gestures are real: desktop uses wheel + mouse; the mobile project uses
 * synthetic touch via CDP Input.dispatchTouchEvent. Travel drags release with
 * zero velocity so no fling inertia perturbs where the camera parks.
 */

const TRAVEL_PX_TO_T = 0.00042 // mirrors cameraRig.ts

/** Approach camera-t for a dive — a pose from which the core is comfortably framed. */
export const APPROACH: Record<string, number> = {
  ai: 0.32,
  rd: 0.66,
  contact: 0.9,
}

export interface Viewport {
  width: number
  height: number
}

export interface SeamState {
  mode: 'arrival' | 'travel' | 'focus' | 'map'
  t: number
  stationId: string | null
  hash: string
  cam: [number, number, number]
  phase: string
}

export function stationT(id: string): number {
  const s = STATIONS.find((st) => st.id === id)
  if (!s) throw new Error(`unknown station ${id}`)
  return s.t
}

export interface Ctx {
  page: Page
  cdp: CDPSession
  isMobile: boolean
  vp: Viewport
}

export async function makeCtx(page: Page, isMobile: boolean, vp: Viewport): Promise<Ctx> {
  const cdp = await page.context().newCDPSession(page)
  return { page, cdp, isMobile, vp }
}

// --- seam access ------------------------------------------------------------
type Seam = {
  state: () => SeamState
  projectStation: (id: string) => { x: number; y: number; onscreen: boolean } | null
}

export async function state(page: Page): Promise<SeamState> {
  return page.evaluate(() => (window as unknown as { __smE2E: Seam }).__smE2E.state())
}

/** Await the app booting to the point the seam exists (WebGL boot succeeded). */
export async function waitForBoot(page: Page): Promise<void> {
  await page.waitForFunction(() => !!(window as unknown as { __smE2E?: unknown }).__smE2E)
}

/** Await a nav mode via polling (robust to slow headless fps). */
export async function waitForMode(page: Page, mode: SeamState['mode']): Promise<void> {
  await expect.poll(async () => (await state(page)).mode, { timeout: 25_000 }).toBe(mode)
}

/**
 * Await the camera at rest: no dive/map/warp tween in flight AND the position
 * has stopped changing. Gating on `phase !== 'tween'` avoids a false "still"
 * during a tween's eased (near-zero-velocity) start under slow headless fps.
 */
export async function waitForStill(page: Page): Promise<void> {
  let prev: [number, number, number] = [NaN, NaN, NaN]
  await expect
    .poll(
      async () => {
        const s = await state(page)
        const c = s.cam
        const still =
          s.phase !== 'tween' &&
          Math.abs(c[0] - prev[0]) + Math.abs(c[1] - prev[1]) + Math.abs(c[2] - prev[2]) < 0.01
        prev = c
        return still
      },
      { timeout: 25_000, intervals: [150] },
    )
    .toBe(true)
}

/** Live screen pixel of a station core, clamped just inside the viewport. */
export async function coreScreen(ctx: Ctx, id: string): Promise<{ x: number; y: number }> {
  const p = await ctx.page.evaluate(
    (sid) => (window as unknown as { __smE2E: Seam }).__smE2E.projectStation(sid),
    id,
  )
  if (!p) throw new Error(`no projection for ${id}`)
  const m = 10
  return {
    x: Math.max(m, Math.min(ctx.vp.width - m, p.x)),
    y: Math.max(m, Math.min(ctx.vp.height - m, p.y)),
  }
}

// --- page-error collection --------------------------------------------------
/** Attach uncaught-error listeners; the returned array must stay empty. */
export function collectPageErrors(page: Page): string[] {
  const errors: string[] = []
  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`))
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`console.error: ${msg.text()}`)
  })
  return errors
}

// --- synthetic touch (CDP) --------------------------------------------------
async function touchStart(cdp: CDPSession, x: number, y: number): Promise<void> {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] })
}
async function touchMove(cdp: CDPSession, x: number, y: number): Promise<void> {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y }] })
}
async function touchEnd(cdp: CDPSession): Promise<void> {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
}

/**
 * Cross the arrival threshold: a wheel (desktop) or a single decisive touch
 * drag (mobile) on the intro overlay, then wait for it to fade out.
 */
export async function enter(ctx: Ctx): Promise<void> {
  const { page, cdp, isMobile, vp } = ctx
  const cx = vp.width / 2
  const cy = vp.height / 2
  const intro = page.locator('[data-intro]')
  await expect(intro).toHaveClass(/is-in/)
  if (isMobile) {
    await touchStart(cdp, cx, cy)
    await touchMove(cdp, cx, cy - 60) // one move well past the 24px enter threshold
    await touchEnd(cdp)
  } else {
    await page.evaluate(() => {
      document
        .querySelector('[data-intro]')!
        .dispatchEvent(new WheelEvent('wheel', { deltaY: 200, bubbles: true, cancelable: true }))
    })
  }
  await expect(intro).toHaveClass(/is-out/)
}

/**
 * One travel gesture worth `deltaT` of path-parameter (positive = forward):
 * a real wheel (desktop, CDP) or a zero-velocity touch drag (mobile), then
 * wait for the camera to come to rest. The browser normalises large wheel
 * deltas nonlinearly, so callers use the closed-loop `travelToT` for precision;
 * this is the single primitive it (and the travel-progress test) drive.
 */
export async function travel(ctx: Ctx, deltaT: number): Promise<void> {
  const { page, cdp, isMobile, vp } = ctx
  const px = deltaT / TRAVEL_PX_TO_T
  const cx = vp.width / 2
  const cy = vp.height / 2
  if (!isMobile) {
    await cdp.send('Input.dispatchMouseEvent', {
      type: 'mouseWheel',
      x: cx,
      y: cy,
      deltaX: 0,
      deltaY: px,
    })
  } else {
    // Centre the drag segment vertically so both ends stay on-screen. Finger dy
    // is -px (moving up advances travel).
    const startY = cy + px / 2
    const endY = cy - px / 2
    const steps = 8
    await touchStart(cdp, cx, startY)
    for (let i = 1; i <= steps; i++) {
      await touchMove(cdp, cx, startY + ((endY - startY) * i) / steps)
    }
    // Hold stationary at the end, then release: guarantees the 80ms release
    // velocity window sees no motion, so no fling inertia/snap fires (which
    // would move the camera off the t we drove it to). Robust even when heavy
    // parallel rendering delays event processing.
    await touchMove(cdp, cx, endY)
    await page.waitForTimeout(120)
    await touchMove(cdp, cx, endY)
    await page.waitForTimeout(120)
    await touchEnd(cdp)
  }
  await waitForStill(page)
}

/**
 * Closed-loop travel to a target path-parameter. Wheel/drag input maps to `t`
 * nonlinearly (browser wheel normalisation) so we converge iteratively, reading
 * the real settled `t` from the seam after each nudge. Robust to any fps.
 */
export async function travelToT(ctx: Ctx, target: number): Promise<number> {
  for (let i = 0; i < 30; i++) {
    const t = (await state(ctx.page)).t
    if (Math.abs(t - target) < 0.012) return t
    await travel(ctx, Math.max(-0.07, Math.min(0.07, target - t)))
  }
  return (await state(ctx.page)).t
}

/** A tap on the 3D canvas at a screen pixel (mouse click / touch tap). */
export async function tapCanvas(ctx: Ctx, x: number, y: number): Promise<void> {
  if (ctx.isMobile) await ctx.page.touchscreen.tap(x, y)
  else await ctx.page.mouse.click(x, y)
}

/** Did a tap land on its 3D target? Poll the nav mode for the expected change. */
async function tookEffect(page: Page, mode: SeamState['mode']): Promise<boolean> {
  try {
    await expect.poll(async () => (await state(page)).mode, { timeout: 3500, intervals: [150] }).toBe(mode)
    return true
  } catch {
    return false
  }
}

/**
 * Full dive of a station: travel to its approach pose, then tap the
 * live-projected core. The core hit sphere is small on screen, so retry against
 * freshly-projected coordinates until the app actually enters focus — this is
 * what keeps the dive deterministic under slow, jittery headless rendering.
 */
export async function diveStation(ctx: Ctx, id: keyof typeof APPROACH): Promise<void> {
  const approach = APPROACH[id]
  if (approach === undefined) throw new Error(`no approach pose for ${id}`)
  for (let attempt = 0; attempt < 4; attempt++) {
    await travelToT(ctx, approach)
    const p = await coreScreen(ctx, id)
    await tapCanvas(ctx, p.x, p.y)
    if (await tookEffect(ctx.page, 'focus')) return
  }
  throw new Error(`dive ${id}: core tap never entered focus`)
}

/** In map mode, tap a constellation node until the warp back to travel fires. */
export async function warpViaNode(ctx: Ctx, id: string): Promise<void> {
  for (let attempt = 0; attempt < 4; attempt++) {
    await waitForStill(ctx.page)
    const p = await coreScreen(ctx, id)
    await tapCanvas(ctx, p.x, p.y)
    if (await tookEffect(ctx.page, 'travel')) return
  }
  throw new Error(`node ${id}: tap never warped`)
}

/** Current URL hash without the leading '#', or ''. */
export async function hash(page: Page): Promise<string> {
  return page.evaluate(() => location.hash.replace(/^#/, ''))
}

/** The station id of the highlighted HUD progress dot, or null. */
export async function activeDotId(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const el = document.querySelector('[data-hud-dot].is-active') as HTMLElement | null
    return el?.dataset.stationId ?? null
  })
}
