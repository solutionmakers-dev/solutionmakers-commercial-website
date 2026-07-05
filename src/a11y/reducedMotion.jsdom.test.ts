// @vitest-environment jsdom
// jsdom provides `window` but not a real `matchMedia` implementation — mock it
// both ways to prove the guard just forwards `.matches`.
import { describe, it, expect, afterEach } from 'vitest'
import { prefersReducedMotion } from './reducedMotion'

function mockMatchMedia(matches: boolean): void {
  window.matchMedia = ((query: string) => ({
    matches,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia
}

afterEach(() => {
  // @ts-expect-error — jsdom has no native matchMedia; undo our mock between tests.
  delete window.matchMedia
})

describe('prefersReducedMotion — jsdom', () => {
  it('returns true when matchMedia reports a match', () => {
    mockMatchMedia(true)
    expect(prefersReducedMotion()).toBe(true)
  })

  it('returns false when matchMedia reports no match', () => {
    mockMatchMedia(false)
    expect(prefersReducedMotion()).toBe(false)
  })

  it('does not throw when matchMedia is entirely absent in a browser-like env', () => {
    expect(() => prefersReducedMotion()).not.toThrow()
    expect(prefersReducedMotion()).toBe(false)
  })
})
