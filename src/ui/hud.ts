/**
 * Hud — the persistent overlay chrome that frames every mode after arrival.
 *
 * Three pieces, all fixed to the viewport edges:
 *   - wordmark chip (top-left)   — tap = home
 *   - progress dots (right edge) — one per station, nearest highlighted
 *   - orb button (bottom-right)  — toggles the map in travel, closes in focus/map
 *
 * Visibility is mode-driven (see setMode): the whole HUD is dark during
 * arrival and only lights up once the visitor has entered. Task 14 owns the
 * wiring; this class just renders, exposes callbacks and reacts to setMode /
 * setProgress.
 */
import type { Mode } from '../nav/navState'
import type { StationDef } from '../content/content'
import { SITE } from '../content/content'

export class Hud {
  private readonly wordmark: HTMLButtonElement
  private readonly dotsWrap: HTMLDivElement
  private readonly dots: HTMLButtonElement[]
  private readonly stations: StationDef[]
  private readonly orb: HTMLButtonElement
  private readonly orbGlyph: HTMLSpanElement

  private onOrbCb: (() => void) | null = null
  private onDotCb: ((id: string) => void) | null = null
  private onHomeCb: (() => void) | null = null

  constructor(root: HTMLElement, stations: StationDef[]) {
    this.stations = stations

    // --- wordmark chip (home) ---
    this.wordmark = document.createElement('button')
    this.wordmark.type = 'button'
    this.wordmark.className = 'sm-hud__wordmark u-label'
    this.wordmark.textContent = SITE.name
    this.wordmark.dataset.hudHome = ''
    this.wordmark.setAttribute('aria-label', `${SITE.name} — home`)
    this.wordmark.addEventListener('click', () => this.onHomeCb?.())

    // --- progress dots ---
    this.dotsWrap = document.createElement('div')
    this.dotsWrap.className = 'sm-hud__dots'
    this.dotsWrap.dataset.hudDots = ''
    this.dots = stations.map((s) => {
      const dot = document.createElement('button')
      dot.type = 'button'
      dot.className = 'sm-hud__dot'
      dot.dataset.hudDot = ''
      dot.dataset.stationId = s.id
      dot.setAttribute('aria-label', s.title)
      dot.addEventListener('click', () => this.onDotCb?.(s.id))
      this.dotsWrap.appendChild(dot)
      return dot
    })

    // --- orb ---
    this.orb = document.createElement('button')
    this.orb.type = 'button'
    this.orb.className = 'sm-hud__orb'
    this.orb.dataset.hudOrb = ''
    this.orbGlyph = document.createElement('span')
    this.orbGlyph.className = 'sm-hud__orb-glyph'
    this.orb.appendChild(this.orbGlyph)
    this.orb.addEventListener('click', () => this.onOrbCb?.())

    root.append(this.wordmark, this.dotsWrap, this.orb)

    // Start in arrival: everything hidden, orb showing the map glyph.
    this.renderMapGlyph()
    this.setMode('arrival')
  }

  /** Highlight the dot whose station t is nearest `t` (0..1). */
  setProgress(t: number): void {
    let best = 0
    let bestDiff = Infinity
    this.stations.forEach((s, i) => {
      const diff = Math.abs(s.t - t)
      if (diff < bestDiff) {
        bestDiff = diff
        best = i
      }
    })
    this.dots.forEach((dot, i) => dot.classList.toggle('is-active', i === best))
  }

  /**
   * Mode drives visibility:
   *   arrival — everything hidden (nothing until entered)
   *   travel  — wordmark + dots + orb (map glyph)
   *   focus   — wordmark + orb (✕); dots hidden
   *   map     — wordmark + orb (✕); dots hidden
   */
  setMode(m: Mode): void {
    const entered = m !== 'arrival'
    this.wordmark.hidden = !entered
    this.orb.hidden = !entered
    this.dotsWrap.hidden = m !== 'travel'

    if (m === 'focus' || m === 'map') {
      this.renderCloseGlyph()
      this.orb.setAttribute('aria-label', m === 'map' ? 'Close map' : 'Close')
    } else {
      this.renderMapGlyph()
      this.orb.setAttribute('aria-label', 'Open map')
    }
  }

  onOrb(cb: () => void): void {
    this.onOrbCb = cb
  }

  onDot(cb: (id: string) => void): void {
    this.onDotCb = cb
  }

  onHome(cb: () => void): void {
    this.onHomeCb = cb
  }

  /** Grid-of-dots glyph — "open the constellation map". */
  private renderMapGlyph(): void {
    this.orbGlyph.textContent = ''
    this.orbGlyph.classList.remove('is-close')
    this.orbGlyph.classList.add('is-map')
    for (let i = 0; i < 4; i++) {
      const pip = document.createElement('span')
      pip.className = 'sm-hud__orb-pip'
      this.orbGlyph.appendChild(pip)
    }
  }

  /** ✕ glyph — "close this view". */
  private renderCloseGlyph(): void {
    this.orbGlyph.classList.remove('is-map')
    this.orbGlyph.classList.add('is-close')
    this.orbGlyph.textContent = '✕'
  }
}
