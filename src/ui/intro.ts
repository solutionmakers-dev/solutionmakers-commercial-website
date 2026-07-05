/**
 * Intro — the arrival sequence over the 3D hero.
 *
 * Renders the large letterspaced wordmark, the two manifesto lines and a
 * gently drifting "slide to enter" hint. `play` fades them in and arms the
 * first-meaningful-input trigger: the first wheel or drag past a small
 * threshold fades the intro out and calls `onEntered` exactly once.
 *
 * `requestTilt` fronts the iOS DeviceOrientationEvent permission prompt; on
 * every other platform it resolves false. A tilt chip is revealed post-enter
 * on iOS only — Task 14 decides whether to actually request the permission.
 */
import { SITE } from '../content/content'
import { GestureController } from '../nav/gestures'

/** Total wheel/drag movement (px) that counts as "the visitor wants in". */
const ENTER_THRESHOLD_PX = 24

interface DeviceOrientationPermission {
  requestPermission?: () => Promise<'granted' | 'denied' | 'default'>
}

export class Intro {
  private readonly el: HTMLDivElement
  private readonly tiltChip: HTMLButtonElement
  private gestures: GestureController | null = null
  private input = 0
  private entered = false
  private onEnteredCb: (() => void) | null = null

  constructor(root: HTMLElement) {
    this.el = document.createElement('div')
    this.el.className = 'sm-intro'
    this.el.dataset.intro = ''

    const inner = document.createElement('div')
    inner.className = 'sm-intro__inner'

    const wordmark = document.createElement('div')
    wordmark.className = 'sm-intro__wordmark u-label'
    wordmark.textContent = SITE.name

    const line1 = document.createElement('p')
    line1.className = 'sm-intro__line1'
    line1.textContent = SITE.manifesto.line1

    const line2 = document.createElement('p')
    line2.className = 'sm-intro__line2'
    line2.textContent = SITE.manifesto.line2

    const hint = document.createElement('div')
    hint.className = 'sm-intro__hint'
    hint.dataset.introHint = ''
    const arrow = document.createElement('span')
    arrow.className = 'sm-intro__hint-arrow'
    arrow.setAttribute('aria-hidden', 'true')
    arrow.textContent = '↑'
    const hintText = document.createElement('span')
    hintText.className = 'sm-intro__hint-text u-label'
    hintText.textContent = SITE.hint
    hint.append(arrow, hintText)

    inner.append(wordmark, line1, line2, hint)
    this.el.appendChild(inner)
    root.appendChild(this.el)

    // Tilt chip lives outside the fading overlay so it can persist post-enter.
    this.tiltChip = document.createElement('button')
    this.tiltChip.type = 'button'
    this.tiltChip.className = 'sm-intro__tilt'
    this.tiltChip.dataset.introTilt = ''
    this.tiltChip.textContent = 'Tilt to look around'
    this.tiltChip.hidden = true
    this.tiltChip.addEventListener('click', () => void this.requestTilt())
    root.appendChild(this.tiltChip)
  }

  play(onEntered: () => void): void {
    this.onEnteredCb = onEntered
    this.entered = false
    this.input = 0
    this.el.classList.remove('is-out')
    this.el.classList.add('is-in')

    this.gestures = new GestureController(this.el)
    this.gestures.on((e) => {
      if (this.entered) return
      if (e.type === 'wheel') this.input += Math.abs(e.delta)
      else if (e.type === 'dragmove') this.input += Math.hypot(e.dx, e.dy)
      if (this.input >= ENTER_THRESHOLD_PX) this.enter()
    })
  }

  async requestTilt(): Promise<boolean> {
    const DOE = (window as unknown as { DeviceOrientationEvent?: DeviceOrientationPermission })
      .DeviceOrientationEvent
    if (!DOE || typeof DOE.requestPermission !== 'function') return false
    try {
      const res = await DOE.requestPermission()
      const granted = res === 'granted'
      if (granted) this.tiltChip.hidden = true
      return granted
    } catch {
      return false
    }
  }

  private enter(): void {
    if (this.entered) return
    this.entered = true
    this.el.classList.remove('is-in')
    this.el.classList.add('is-out')
    this.gestures?.dispose()
    this.gestures = null

    // iOS gates device orientation behind a user gesture — surface the chip so
    // the visitor can grant it; elsewhere requestPermission is undefined.
    if (this.iosTiltAvailable()) this.tiltChip.hidden = false

    this.onEnteredCb?.()
  }

  private iosTiltAvailable(): boolean {
    const DOE = (window as unknown as { DeviceOrientationEvent?: DeviceOrientationPermission })
      .DeviceOrientationEvent
    return !!DOE && typeof DOE.requestPermission === 'function'
  }
}
