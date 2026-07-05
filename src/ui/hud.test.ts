// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { Hud } from './hud'
import { STATIONS } from '../content/content'

let root: HTMLDivElement

beforeEach(() => {
  root = document.createElement('div')
  document.body.appendChild(root)
})

function click(el: Element): void {
  el.dispatchEvent(new MouseEvent('click', { bubbles: true }))
}

describe('Hud — structure', () => {
  it('renders 6 progress dots (one per station) and an orb button', () => {
    new Hud(root, STATIONS)
    expect(root.querySelectorAll('[data-hud-dot]').length).toBe(6)
    expect(root.querySelector('[data-hud-orb]')).not.toBeNull()
    expect(root.querySelector('[data-hud-home]')).not.toBeNull()
  })
})

describe('Hud — progress', () => {
  it('setProgress(0.48) marks exactly the 3rd dot (AI, t=0.48) active', () => {
    const hud = new Hud(root, STATIONS)
    hud.setProgress(0.48)
    const dots = [...root.querySelectorAll('[data-hud-dot]')]
    const actives = dots.filter((d) => d.classList.contains('is-active'))
    expect(actives.length).toBe(1)
    expect(dots.indexOf(actives[0]!)).toBe(2)
  })

  it('setProgress snaps to the nearest station t', () => {
    const hud = new Hud(root, STATIONS)
    hud.setProgress(0.2) // nearest to consulting (0.16)
    const dots = [...root.querySelectorAll('[data-hud-dot]')]
    expect(dots.findIndex((d) => d.classList.contains('is-active'))).toBe(0)
  })
})

describe('Hud — callbacks', () => {
  it('fires onDot with the station id when a dot is clicked', () => {
    const hud = new Hud(root, STATIONS)
    let got: string | null = null
    hud.onDot((id) => (got = id))
    click(root.querySelectorAll('[data-hud-dot]')[2]!)
    expect(got).toBe('ai')
  })

  it('fires onOrb when the orb is clicked', () => {
    const hud = new Hud(root, STATIONS)
    let n = 0
    hud.onOrb(() => n++)
    click(root.querySelector('[data-hud-orb]')!)
    expect(n).toBe(1)
  })

  it('fires onHome when the wordmark chip is tapped', () => {
    const hud = new Hud(root, STATIONS)
    let n = 0
    hud.onHome(() => n++)
    click(root.querySelector('[data-hud-home]')!)
    expect(n).toBe(1)
  })
})

describe('Hud — mode', () => {
  it("setMode('focus') swaps the orb glyph to ✕; travel shows the map glyph (no ✕)", () => {
    const hud = new Hud(root, STATIONS)
    const orb = root.querySelector<HTMLElement>('[data-hud-orb]')!
    hud.setMode('travel')
    expect(orb.textContent ?? '').not.toContain('✕')
    hud.setMode('focus')
    expect(orb.textContent ?? '').toContain('✕')
    hud.setMode('map')
    expect(orb.textContent ?? '').toContain('✕')
  })

  it('hides dots in focus and map, shows them in travel', () => {
    const hud = new Hud(root, STATIONS)
    const dots = root.querySelector<HTMLElement>('[data-hud-dots]')!
    hud.setMode('travel')
    expect(dots.hidden).toBe(false)
    hud.setMode('focus')
    expect(dots.hidden).toBe(true)
    hud.setMode('map')
    expect(dots.hidden).toBe(true)
  })

  it('hides everything in arrival, then reveals orb + wordmark once entered', () => {
    const hud = new Hud(root, STATIONS)
    const orb = root.querySelector<HTMLElement>('[data-hud-orb]')!
    const home = root.querySelector<HTMLElement>('[data-hud-home]')!
    hud.setMode('arrival')
    expect(orb.hidden).toBe(true)
    expect(home.hidden).toBe(true)
    hud.setMode('travel')
    expect(orb.hidden).toBe(false)
    expect(home.hidden).toBe(false)
  })
})
