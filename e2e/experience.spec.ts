import { test, expect, type Page } from '@playwright/test'
import { SITE, STATIONS } from '../src/content/content'
import {
  makeCtx,
  collectPageErrors,
  waitForBoot,
  enter,
  waitForMode,
  waitForStill,
  travelToT,
  diveStation,
  warpViaNode,
  hash,
  activeDotId,
  state,
  type Ctx,
} from './helpers'

/**
 * End-to-end verification of the whole immersive journey — arrival, gesture
 * travel, dives, the constellation map, deep links, reduced motion and the
 * accessible mirror — on both the mobile and desktop layouts. Every test
 * collects uncaught page errors and asserts none occurred.
 *
 * Interactions are real (wheel / synthetic touch / DOM clicks). Panel-internal
 * buttons are fired with dispatchEvent('click') on purpose: the panel's own
 * swipe-close GestureController takes pointer capture on pointerdown, which
 * redirects the compatibility click away from a child button — see the
 * task-16 report's findings. HUD buttons (outside the panel) use real clicks.
 */

function shot(page: Page, tag: string, name: string): Promise<Buffer> {
  return page.screenshot({ path: `e2e/shots/${name}-${tag}.png` })
}

async function boot(page: Page, tag: string, url = '/'): Promise<{ ctx: Ctx; errors: string[] }> {
  const errors = collectPageErrors(page)
  const ctx = await makeCtx(page, tag === 'mobile', page.viewportSize()!)
  await page.goto(url)
  await waitForBoot(page)
  return { ctx, errors }
}

/** boot → enter → settle into travel (with any deep-link warp completed). */
async function bootEnter(page: Page, tag: string, url = '/'): Promise<{ ctx: Ctx; errors: string[] }> {
  const { ctx, errors } = await boot(page, tag, url)
  await enter(ctx)
  await waitForMode(page, 'travel')
  await waitForStill(page)
  return { ctx, errors }
}

test.describe('Solution Makers experience', () => {
  // (1) boot → intro visible
  test('boots to the arrival intro', async ({ page }, info) => {
    const tag = info.project.name
    const { errors } = await boot(page, tag)
    // WebGL booted (not the static mirror fallback)
    await expect(page.locator('#mirror')).not.toHaveClass(/mirror-visible/)
    await expect(page.locator('[data-intro]')).toHaveClass(/is-in/)
    await expect(page.locator('.sm-intro__wordmark')).toHaveText(SITE.name)
    await expect(page.locator('.sm-intro__hint-text')).toHaveText(SITE.hint)
    // HUD stays dark during arrival
    await expect(page.locator('[data-hud-orb]')).toBeHidden()
    await shot(page, tag, '01-intro')
    expect(errors).toEqual([])
  })

  // (2) enter → intro gone, HUD visible
  test('entering reveals the HUD and hides the intro', async ({ page }, info) => {
    const tag = info.project.name
    const { ctx, errors } = await boot(page, tag)
    await enter(ctx)
    await expect(page.locator('[data-intro]')).toHaveClass(/is-out/)
    await waitForMode(page, 'travel')
    await expect(page.locator('[data-hud-home]')).toBeVisible()
    await expect(page.locator('[data-hud-orb]')).toBeVisible()
    await expect(page.locator('[data-hud-dots]')).toBeVisible()
    await shot(page, tag, '02-travel')
    expect(errors).toEqual([])
  })

  // (3) travel changes the HUD progress highlight
  test('travel moves the active progress dot', async ({ page }, info) => {
    const tag = info.project.name
    const { ctx, errors } = await bootEnter(page, tag)
    const before = await activeDotId(page)
    expect(before).toBe('consulting') // nearest to t=0
    await travelToT(ctx, 0.64) // fly deep into the path (hardware neighbourhood)
    const after = await activeDotId(page)
    // The highlight has moved off the start station to a later one.
    expect(after).not.toBe(before)
    expect(['ai', 'hardware', 'rd']).toContain(after)
    expect(errors).toEqual([])
  })

  // (4) deep link boots near a station (no panel), hash + HUD reflect it
  test('deep link #software parks near software without a panel', async ({ page }, info) => {
    const tag = info.project.name
    const { errors } = await bootEnter(page, tag, '/#software')
    expect(await hash(page)).toBe('software')
    await expect(page.locator('[data-panel]')).not.toHaveClass(/is-open/)
    expect(await activeDotId(page)).toBe('software')
    await shot(page, tag, '04-deeplink-software')
    expect(errors).toEqual([])
  })

  // (5) dive by tapping a station core
  test('diving a station core opens its panel and sets the hash', async ({ page }, info) => {
    const tag = info.project.name
    const { ctx, errors } = await bootEnter(page, tag, '/#ai')
    await diveStation(ctx, 'ai')
    await expect(page.locator('[data-panel]')).toHaveClass(/is-open/)
    await expect(page.locator('.sm-panel__title')).toHaveText('AI Systems')
    expect(await hash(page)).toBe('ai')
    expect((await state(page)).mode).toBe('focus')
    await shot(page, tag, '05-dive-ai')
    expect(errors).toEqual([])
  })

  // (6) closing the panel returns to travel and clears the hash
  test('closing the panel returns to travel and clears the hash', async ({ page }, info) => {
    const tag = info.project.name
    const { ctx, errors } = await bootEnter(page, tag, '/#ai')
    await diveStation(ctx, 'ai')
    await expect(page.locator('[data-panel]')).toHaveClass(/is-open/)
    await page.locator('[data-panel-close]').dispatchEvent('click')
    await waitForMode(page, 'travel')
    await expect(page.locator('[data-panel]')).not.toHaveClass(/is-open/)
    expect(await hash(page)).toBe('')
    await expect(page.locator('[data-hud-dots]')).toBeVisible()
    expect(errors).toEqual([])
  })

  // (7) map: orb opens the constellation, tapping a node warps
  test('the map orb opens the constellation and a node warps', async ({ page }, info) => {
    const tag = info.project.name
    const { ctx, errors } = await bootEnter(page, tag)
    await page.locator('[data-hud-orb]').click()
    await waitForMode(page, 'map')
    // map-mode HUD: dots hidden, orb shows the close glyph
    await expect(page.locator('[data-hud-dots]')).toBeHidden()
    await expect(page.locator('.sm-hud__orb-glyph.is-close')).toBeVisible()
    await waitForStill(page) // await the map tween + constellation fade-in
    await shot(page, tag, '07-map')
    // A node tap only warps if the constellation layer is actually visible
    // (Constellation.nodeAt is inert while hidden) — the warp proves the fade.
    await warpViaNode(ctx, 'hardware')
    expect(await hash(page)).toBe('hardware')
    await waitForStill(page) // let the warp tween land so the HUD progress catches up
    expect(await activeDotId(page)).toBe('hardware')
    expect(errors).toEqual([])
  })

  // (8) contact dive exposes a mailto + copy affordance
  test('the contact station offers a mailto link and copy button', async ({ page }, info) => {
    const tag = info.project.name
    const { ctx, errors } = await bootEnter(page, tag, '/#contact')
    await diveStation(ctx, 'contact')
    await expect(page.locator('[data-panel]')).toHaveClass(/is-open/)
    await expect(page.locator('.sm-panel__title')).toHaveText('Make With Us')
    await expect(page.locator('[data-panel-mail]')).toHaveAttribute('href', `mailto:${SITE.email}`)
    await expect(page.locator('[data-panel-copy]')).toBeVisible()
    await shot(page, tag, '08-contact')
    expect(errors).toEqual([])
  })

  // (9) R&D dive exposes four venture tabs that swap the blurb
  test('the R&D station has four venture tabs that swap the blurb', async ({ page }, info) => {
    const tag = info.project.name
    const { ctx, errors } = await bootEnter(page, tag, '/#rd')
    await diveStation(ctx, 'rd')
    await expect(page.locator('[data-panel]')).toHaveClass(/is-open/)
    const tabs = page.locator('[data-panel-tab]')
    await expect(tabs).toHaveCount(4)

    const sats = STATIONS.find((s) => s.id === 'rd')!.satellites!
    const [first, , third] = sats
    const blurb = page.locator('[data-panel-blurb]')
    // Selecting a tab swaps the blurb region (independent of whichever venture
    // the dive tap happened to pre-select).
    await page.locator(`[data-panel-tab][data-sat-id="${first!.id}"]`).dispatchEvent('click')
    await expect(blurb).toHaveText(first!.blurb)
    await page.locator(`[data-panel-tab][data-sat-id="${third!.id}"]`).dispatchEvent('click')
    await expect(blurb).toHaveText(third!.blurb)
    await expect(page.locator(`[data-panel-tab][data-sat-id="${third!.id}"]`)).toHaveClass(/is-active/)
    await shot(page, tag, '09-rd')
    expect(errors).toEqual([])
  })

  // (10) reduced motion: still enterable + navigable via the HUD dots
  test('reduced motion stays enterable and dot-navigable', async ({ page }, info) => {
    const tag = info.project.name
    await page.emulateMedia({ reducedMotion: 'reduce' })
    const { errors } = await bootEnter(page, tag)
    // Navigate purely through the HUD progress dots.
    await page.locator('[data-hud-dot][data-station-id="rd"]').click()
    await waitForStill(page)
    expect(await hash(page)).toBe('rd')
    expect(await activeDotId(page)).toBe('rd')
    await shot(page, tag, '10-reduced-motion')
    expect(errors).toEqual([])
  })

  // (11) accessibility mirror + inert canvas
  test('the accessible mirror carries the full content', async ({ page }, info) => {
    const tag = info.project.name
    const { errors } = await boot(page, tag)
    const mirror = page.locator('#mirror')
    await expect(mirror.locator('h1.sm-mirror__h1')).toHaveCount(1)
    await expect(mirror.locator('h1.sm-mirror__h1')).toHaveText(SITE.name)
    await expect(mirror.locator('.sm-mirror__section')).toHaveCount(STATIONS.length)
    await expect(mirror.locator(`a.sm-mirror__email[href="mailto:${SITE.email}"]`)).toHaveCount(1)
    // The 3D canvas is hidden from assistive tech.
    await expect(page.locator('#scene')).toHaveAttribute('aria-hidden', 'true')
    expect(errors).toEqual([])
  })
})
