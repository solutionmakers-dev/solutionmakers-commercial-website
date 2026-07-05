// Default (node) environment — no `window` at all. The guard must degrade
// to "false" rather than throwing when matchMedia (or window itself) is absent.
import { describe, it, expect } from 'vitest'
import { prefersReducedMotion } from './reducedMotion'

describe('prefersReducedMotion — node/headless environment', () => {
  it('does not throw and reports false when window is unavailable', () => {
    expect(typeof window).toBe('undefined')
    expect(() => prefersReducedMotion()).not.toThrow()
    expect(prefersReducedMotion()).toBe(false)
  })
})
