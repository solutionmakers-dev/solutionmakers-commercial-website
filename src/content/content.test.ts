import { describe, it, expect } from 'vitest'
import { STATIONS, SITE } from './content'

describe('content', () => {
  it('has 6 stations ordered by depth', () => {
    expect(STATIONS.length).toBe(6)
    const ts = STATIONS.map(s => s.t)
    expect([...ts].sort((a, b) => a - b)).toEqual(ts)
    expect(new Set(STATIONS.map(s => s.id)).size).toBe(6)
  })
  it('keeps t within (0,1] and ids url-safe', () => {
    for (const s of STATIONS) {
      expect(s.t).toBeGreaterThan(0); expect(s.t).toBeLessThanOrEqual(1)
      expect(s.id).toMatch(/^[a-z-]+$/)
      expect(s.capabilities.length).toBeGreaterThanOrEqual(3)
    }
  })
  it('r&d station carries 4 satellites', () => {
    const rd = STATIONS.find(s => s.motif === 'satellites')!
    expect(rd.satellites?.length).toBe(4)
  })
  it('site copy present', () => {
    expect(SITE.email).toContain('@')
    expect(SITE.manifesto.line1.length).toBeGreaterThan(4)
  })
})
