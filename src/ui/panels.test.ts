// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { PanelLayer } from './panels'
import { STATIONS, SITE, type StationDef } from '../content/content'

/**
 * jsdom has no PointerEvent constructor. Polyfill with a MouseEvent subclass
 * carrying the extra pointer fields GestureController reads (mirrors the
 * pattern in nav/gestures.test.ts).
 */
class FakePointerEvent extends MouseEvent {
  readonly pointerId: number
  constructor(type: string, params: MouseEventInit & { pointerId?: number; timeStamp?: number } = {}) {
    super(type, params)
    this.pointerId = params.pointerId ?? 0
    if (params.timeStamp !== undefined) {
      Object.defineProperty(this, 'timeStamp', { value: params.timeStamp, configurable: true })
    }
  }
}
function pointerDown(id: number, x: number, y: number, t: number): Event {
  return new FakePointerEvent('pointerdown', { pointerId: id, clientX: x, clientY: y, timeStamp: t })
}
function pointerMove(id: number, x: number, y: number, t: number): Event {
  return new FakePointerEvent('pointermove', { pointerId: id, clientX: x, clientY: y, timeStamp: t })
}
function pointerUp(id: number, x: number, y: number, t: number): Event {
  return new FakePointerEvent('pointerup', { pointerId: id, clientX: x, clientY: y, timeStamp: t })
}

const byId = (id: string): StationDef => {
  const d = STATIONS.find((s) => s.id === id)
  if (!d) throw new Error(`no station ${id}`)
  return d
}
const software = byId('software')
const contact = byId('contact')
const rd = byId('rd')

let root: HTMLDivElement

beforeEach(() => {
  root = document.createElement('div')
  document.body.appendChild(root)
  // GestureController (attached to the panel) calls pointer-capture on down;
  // jsdom doesn't implement it. Harmless polyfill so nothing throws.
  ;(HTMLElement.prototype as unknown as { setPointerCapture: () => void }).setPointerCapture = () => {}
  ;(HTMLElement.prototype as unknown as { releasePointerCapture: () => void }).releasePointerCapture = () => {}
})

function click(el: Element): void {
  el.dispatchEvent(new MouseEvent('click', { bubbles: true }))
}

describe('PanelLayer — normal def', () => {
  it('renders the tagline, title and 4 capability chips', () => {
    const panel = new PanelLayer(root)
    panel.show(software)
    expect(root.querySelector('h2')?.textContent).toBe(software.title)
    expect(root.textContent).toContain(software.tagline)
    const chips = [...root.querySelectorAll('[data-panel-chip]')]
    expect(chips.length).toBe(4)
    expect(chips.map((c) => c.textContent)).toEqual(software.capabilities)
  })
})

describe('PanelLayer — contact variant', () => {
  it('renders a mailto link + copy button, and no capability chips', () => {
    const panel = new PanelLayer(root)
    panel.show(contact)
    const mailto = root.querySelector('a[href^="mailto:"]')
    expect(mailto).not.toBeNull()
    expect(mailto!.getAttribute('href')).toBe(`mailto:${SITE.email}`)
    expect(root.querySelector('[data-panel-copy]')).not.toBeNull()
    expect(root.querySelectorAll('[data-panel-chip]').length).toBe(0)
  })

  it('copies the email via navigator.clipboard and shows a copied state', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    const panel = new PanelLayer(root)
    panel.show(contact)
    const copy = root.querySelector<HTMLElement>('[data-panel-copy]')!
    click(copy)
    expect(writeText).toHaveBeenCalledWith(SITE.email)
    await Promise.resolve()
    expect((copy.textContent ?? '').toLowerCase()).toContain('copied')
  })
})

describe('PanelLayer — satellites variant', () => {
  it('renders 4 tabs; clicking one fires onSatellite and swaps the blurb', () => {
    const panel = new PanelLayer(root)
    let got: string | null = null
    panel.onSatellite((id) => (got = id))
    panel.show(rd)
    const tabs = [...root.querySelectorAll('[data-panel-tab]')]
    expect(tabs.length).toBe(4)
    expect(tabs.map((t) => t.textContent)).toEqual(rd.satellites!.map((s) => s.title))
    click(tabs[1]!)
    expect(got).toBe(rd.satellites![1]!.id)
    expect(root.textContent).toContain(rd.satellites![1]!.blurb)
  })

  it('showSatellite swaps the blurb region and marks the active tab', () => {
    const panel = new PanelLayer(root)
    panel.show(rd)
    panel.showSatellite(rd.id, rd.satellites![2]!.id)
    expect(root.textContent).toContain(rd.satellites![2]!.blurb)
    const tabs = [...root.querySelectorAll('[data-panel-tab]')]
    expect(tabs.findIndex((t) => t.classList.contains('is-active'))).toBe(2)
  })
})

describe('PanelLayer — close / hide', () => {
  it('fires onClose when the close button is clicked', () => {
    const panel = new PanelLayer(root)
    let n = 0
    panel.onClose(() => n++)
    panel.show(software)
    click(root.querySelector('[data-panel-close]')!)
    expect(n).toBe(1)
  })

  it('hide() empties the panel content', () => {
    const panel = new PanelLayer(root)
    panel.show(software)
    expect(root.querySelector('h2')).not.toBeNull()
    panel.hide()
    expect(root.querySelector('h2')).toBeNull()
  })
})

describe('PanelLayer — swipe-close vs. content scroll', () => {
  it('does not close on a >=80px downward drag while the content is scrolled (scrollTop > 0)', () => {
    const panel = new PanelLayer(root)
    let n = 0
    panel.onClose(() => n++)
    panel.show(software)

    const panelEl = root.querySelector<HTMLElement>('[data-panel]')!
    const content = root.querySelector<HTMLElement>('.sm-panel__content')!
    Object.defineProperty(content, 'scrollTop', { value: 50, configurable: true })

    panelEl.dispatchEvent(pointerDown(1, 0, 0, 0))
    panelEl.dispatchEvent(pointerMove(1, 0, 100, 50)) // 100px downward drag in one move
    panelEl.dispatchEvent(pointerUp(1, 0, 100, 60))

    expect(n).toBe(0)
  })

  it('closes on a >=80px downward drag while the content is at the top (scrollTop <= 0)', () => {
    const panel = new PanelLayer(root)
    let n = 0
    panel.onClose(() => n++)
    panel.show(software)

    const panelEl = root.querySelector<HTMLElement>('[data-panel]')!
    const content = root.querySelector<HTMLElement>('.sm-panel__content')!
    Object.defineProperty(content, 'scrollTop', { value: 0, configurable: true })

    panelEl.dispatchEvent(pointerDown(1, 0, 0, 0))
    panelEl.dispatchEvent(pointerMove(1, 0, 100, 50)) // 100px downward drag in one move
    panelEl.dispatchEvent(pointerUp(1, 0, 100, 60))

    expect(n).toBe(1)
  })
})
