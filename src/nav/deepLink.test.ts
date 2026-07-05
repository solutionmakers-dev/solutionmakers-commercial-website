// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { readHash, writeHash } from './deepLink'
import { STATIONS } from '../content/content'

beforeEach(() => {
  history.replaceState(null, '', '/')
})

describe('readHash', () => {
  it('returns null when there is no hash', () => {
    expect(readHash()).toBeNull()
  })

  it('returns the station id for a valid hash', () => {
    history.replaceState(null, '', '#software')
    expect(readHash()).toBe('software')
  })

  it('accepts every station id defined in content', () => {
    for (const s of STATIONS) {
      history.replaceState(null, '', `#${s.id}`)
      expect(readHash()).toBe(s.id)
    }
  })

  it('returns null for a hash that is not a station id', () => {
    history.replaceState(null, '', '#bogus')
    expect(readHash()).toBeNull()
  })

  it('returns null for a bare "#"', () => {
    history.replaceState(null, '', '#')
    expect(readHash()).toBeNull()
  })
})

describe('writeHash', () => {
  it('writes a valid station id as the location hash', () => {
    writeHash('ai')
    expect(location.hash).toBe('#ai')
  })

  it('clears the hash when passed null', () => {
    history.replaceState(null, '', '#ai')
    writeHash(null)
    expect(location.hash).toBe('')
  })

  it('preserves pathname and search when clearing', () => {
    history.replaceState(null, '', '/base?q=1#ai')
    writeHash(null)
    expect(location.pathname).toBe('/base')
    expect(location.search).toBe('?q=1')
    expect(location.hash).toBe('')
  })

  it('ignores ids that are not station ids', () => {
    history.replaceState(null, '', '#software')
    writeHash('not-a-station')
    expect(location.hash).toBe('#software')
  })

  it('uses replaceState — no history entries are added', () => {
    const len = history.length
    writeHash('hardware')
    writeHash('contact')
    writeHash(null)
    expect(history.length).toBe(len)
  })

  it('round-trips through readHash', () => {
    writeHash('rd')
    expect(readHash()).toBe('rd')
    writeHash(null)
    expect(readHash()).toBeNull()
  })
})
