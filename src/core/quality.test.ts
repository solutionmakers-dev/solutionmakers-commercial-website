import { describe, it, expect } from 'vitest'
import { QualityManager, TIERS } from './quality'

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
})
