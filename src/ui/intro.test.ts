// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { Intro } from './intro'

let root: HTMLDivElement

beforeEach(() => {
  root = document.createElement('div')
  document.body.appendChild(root)
  ;(HTMLElement.prototype as unknown as { setPointerCapture: () => void }).setPointerCapture = () => {}
  ;(HTMLElement.prototype as unknown as { releasePointerCapture: () => void }).releasePointerCapture = () => {}
})

describe('Intro — structure', () => {
  it('renders the wordmark, manifesto and a hint pill', () => {
    new Intro(root)
    expect(root.textContent).toContain('SOLUTION MAKERS')
    expect(root.textContent).toContain('slide to enter')
    expect(root.querySelector('[data-intro-hint]')).not.toBeNull()
  })
})

describe('Intro — enter', () => {
  it('play(): a wheel over the threshold calls onEntered exactly once', () => {
    const intro = new Intro(root)
    let entered = 0
    intro.play(() => entered++)
    const el = root.querySelector<HTMLElement>('[data-intro]')!
    el.dispatchEvent(new WheelEvent('wheel', { deltaY: 60, bubbles: true }))
    el.dispatchEvent(new WheelEvent('wheel', { deltaY: 60, bubbles: true }))
    expect(entered).toBe(1)
  })

  it('play(): a wheel below the threshold does not enter', () => {
    const intro = new Intro(root)
    let entered = 0
    intro.play(() => entered++)
    const el = root.querySelector<HTMLElement>('[data-intro]')!
    el.dispatchEvent(new WheelEvent('wheel', { deltaY: 6, bubbles: true }))
    expect(entered).toBe(0)
  })
})

describe('Intro — tilt', () => {
  it('requestTilt() resolves false when DeviceOrientationEvent.requestPermission is absent', async () => {
    const intro = new Intro(root)
    await expect(intro.requestTilt()).resolves.toBe(false)
  })
})
