import { describe, it, expect, afterEach, vi } from 'vitest'
import { QualityManager, TIERS, detectInitialTier } from './quality'

/** Fake wall clock: advances by dt on every fed frame, like a real RAF timestamp would. */
function makeClock() {
  const state = { t: 0 }
  return { now: () => state.t, advance: (dt: number) => (state.t += dt) }
}

function feed(qm: QualityManager, clock: ReturnType<typeof makeClock>, dt: number, count: number) {
  for (let i = 0; i < count; i++) {
    clock.advance(dt)
    qm.sample(dt)
  }
}

describe('TIERS', () => {
  it('matches the spec table', () => {
    expect(TIERS).toEqual({
      0: { dprScale: 0.6, particleScale: 0.35, bloom: false },
      1: { dprScale: 0.8, particleScale: 0.7, bloom: true },
      2: { dprScale: 1, particleScale: 1, bloom: true },
    })
  })
})

describe('QualityManager', () => {
  it('starts at tier 2 in a non-mobile / no-DPR test environment', () => {
    const clock = makeClock()
    const qm = new QualityManager(clock.now)
    expect(qm.tier).toBe(2)
  })

  it('steps down after 90 consecutive slow frames, then down again after cooldown, then back up after 300 fast frames', () => {
    const clock = makeClock()
    const qm = new QualityManager(clock.now)

    feed(qm, clock, 1 / 30, 90) // ~30fps sustained
    expect(qm.tier).toBe(1)

    feed(qm, clock, 1 / 30, 90) // another 90 slow frames; by now >=3s have elapsed since last change
    expect(qm.tier).toBe(0)

    feed(qm, clock, 1 / 60, 300) // ~60fps sustained
    expect(qm.tier).toBe(1)
  })

  it('does not step down twice within the 3s cooldown window', () => {
    const clock = makeClock()
    const qm = new QualityManager(clock.now)

    feed(qm, clock, 1 / 30, 90)
    expect(qm.tier).toBe(1)

    // 90 more slow frames at a faster (but still <45fps) rate: 90 * (1/40) = 2.25s < 3s cooldown
    feed(qm, clock, 1 / 40, 90)
    expect(qm.tier).toBe(1) // blocked by cooldown

    // keep feeding slow frames until cooldown has elapsed; then it should drop
    feed(qm, clock, 1 / 40, 40)
    expect(qm.tier).toBe(0)
  })

  it('never drops below tier 0', () => {
    const clock = makeClock()
    const qm = new QualityManager(clock.now)
    feed(qm, clock, 1 / 30, 90)
    feed(qm, clock, 1 / 30, 90)
    expect(qm.tier).toBe(0)

    feed(qm, clock, 1 / 30, 400)
    expect(qm.tier).toBe(0)
  })

  it('never rises above tier 2', () => {
    const clock = makeClock()
    const qm = new QualityManager(clock.now)
    expect(qm.tier).toBe(2)

    feed(qm, clock, 1 / 60, 1000)
    expect(qm.tier).toBe(2)
  })

  it('notifies onChange listeners with the new tier on every change', () => {
    const clock = makeClock()
    const qm = new QualityManager(clock.now)
    const seen: number[] = []
    qm.onChange((t) => seen.push(t))

    feed(qm, clock, 1 / 30, 90)
    feed(qm, clock, 1 / 30, 90)

    expect(seen).toEqual([1, 0])
  })

  it('does not let the cooldown gate the very first tier transition', () => {
    // 40fps: slow enough to trip the <45fps rule, but only ~2.25s elapses over
    // 90 frames — well under the 3s cooldown. The cooldown must not block this
    // FIRST transition; it only applies between changes.
    const clock = makeClock()
    const qm = new QualityManager(clock.now)

    feed(qm, clock, 1 / 40, 89)
    expect(qm.tier).toBe(2) // not yet 90 consecutive slow frames

    feed(qm, clock, 1 / 40, 1) // frame 90
    expect(qm.tier).toBe(1) // steps down immediately despite only ~2.25s of clock time
  })
})

describe('detectInitialTier', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  const IPHONE_UA =
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
  const DESKTOP_UA =
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

  it('returns tier 1 for high-DPR (>2.5) mobile devices', () => {
    vi.stubGlobal('window', { devicePixelRatio: 3 })
    vi.stubGlobal('navigator', { userAgent: IPHONE_UA })

    expect(detectInitialTier()).toBe(1)
  })

  it('returns tier 2 for high-DPR (>2.5) desktop devices', () => {
    vi.stubGlobal('window', { devicePixelRatio: 3 })
    vi.stubGlobal('navigator', { userAgent: DESKTOP_UA })

    expect(detectInitialTier()).toBe(2)
  })

  it('returns tier 2 for mobile devices with DPR at or below 2.5', () => {
    vi.stubGlobal('window', { devicePixelRatio: 2 })
    vi.stubGlobal('navigator', { userAgent: IPHONE_UA })

    expect(detectInitialTier()).toBe(2)
  })
})
