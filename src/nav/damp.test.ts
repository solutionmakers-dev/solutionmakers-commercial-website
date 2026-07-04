import { describe, it, expect, vi } from 'vitest'
import { damp, easeInOutCubic, Tween } from './damp'

describe('damp', () => {
  it('moves toward the target and converges', () => {
    let v = 0
    for (let i = 0; i < 600; i++) v = damp(v, 10, 6, 1 / 60)
    expect(v).toBeCloseTo(10, 5)
  })

  it('never overshoots for a single step', () => {
    // (1 - e^{-λdt}) ∈ (0,1) so the result is always strictly between current and target
    const v = damp(0, 10, 6, 1 / 60)
    expect(v).toBeGreaterThan(0)
    expect(v).toBeLessThan(10)
  })

  it('is frame-rate independent: two half-steps equal one full step', () => {
    const c = 3
    const target = 17
    const lambda = 6
    const dt = 1 / 30

    const full = damp(c, target, lambda, dt)
    const half = damp(damp(c, target, lambda, dt / 2), target, lambda, dt / 2)

    // Exact by construction: (T-c)·e^{-λ dt} composes across sub-steps.
    expect(half).toBeCloseTo(full, 12)
  })

  it('stays put when already at target', () => {
    expect(damp(5, 5, 6, 1 / 60)).toBeCloseTo(5, 12)
  })
})

describe('easeInOutCubic', () => {
  it('pins the endpoints and the midpoint', () => {
    expect(easeInOutCubic(0)).toBeCloseTo(0, 12)
    expect(easeInOutCubic(1)).toBeCloseTo(1, 12)
    expect(easeInOutCubic(0.5)).toBeCloseTo(0.5, 12)
  })
})

describe('Tween', () => {
  it('reaches the target exactly and fires onDone once', () => {
    const t = new Tween()
    let value = -1
    const onDone = vi.fn()
    t.start(0, 10, 100, easeInOutCubic, (v) => (value = v), onDone)

    // 100 ms in 10 ms steps.
    for (let i = 0; i < 10; i++) t.update(0.01)

    expect(value).toBe(10) // lands exactly on `to`, no residual → no pop
    expect(onDone).toHaveBeenCalledTimes(1)

    // Further updates are inert once complete.
    t.update(0.01)
    expect(onDone).toHaveBeenCalledTimes(1)
  })

  it('clamps overshoot: an over-long dt still ends exactly at target', () => {
    const t = new Tween()
    let value = -1
    t.start(2, 8, 100, easeInOutCubic, (v) => (value = v))
    t.update(10) // 10 s ≫ 100 ms
    expect(value).toBe(8)
  })

  it('cancel() stops updates and suppresses onDone', () => {
    const t = new Tween()
    const onUpdate = vi.fn()
    const onDone = vi.fn()
    t.start(0, 10, 100, easeInOutCubic, onUpdate, onDone)
    t.update(0.05)
    const callsBefore = onUpdate.mock.calls.length
    t.cancel()
    t.update(0.05)
    t.update(0.05)
    expect(onUpdate.mock.calls.length).toBe(callsBefore)
    expect(onDone).not.toHaveBeenCalled()
  })

  it('reports active state', () => {
    const t = new Tween()
    expect(t.isActive).toBe(false)
    t.start(0, 1, 100, easeInOutCubic, () => {})
    expect(t.isActive).toBe(true)
    t.update(1)
    expect(t.isActive).toBe(false)
  })
})
