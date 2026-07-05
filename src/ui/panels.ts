/**
 * PanelLayer — the single glass content sheet.
 *
 * One reusable panel element (created once, filled per `show`). On phones it
 * is a bottom sheet; ≥768px it promotes to a right-side card (CSS-only). Three
 * content shapes keyed off `def.motif`:
 *   - default    — capability chips (hairline pills)
 *   - contact    — mailto button + copy-email button (clipboard, "copied")
 *   - satellites — four tabs swapping a blurb region
 *
 * Closes two ways: the ✕ (top-right) and a swipe-down on the sheet, detected
 * by reusing the GestureController (accumulated downward drag ≥ threshold).
 * Task 14 wires the callbacks to nav.
 */
import { STATIONS, SITE, type StationDef } from '../content/content'
import { GestureController } from '../nav/gestures'

/** Downward drag (px) on the sheet that dismisses it. */
const SWIPE_CLOSE_PX = 80
/** How long the copy button shows its "Copied" confirmation. */
const COPY_FEEDBACK_MS = 1600

export class PanelLayer {
  private readonly panel: HTMLElement
  private readonly content: HTMLDivElement
  private readonly close: HTMLButtonElement
  private readonly gestures: GestureController

  private onCloseCb: (() => void) | null = null
  private onSatelliteCb: ((satId: string) => void) | null = null

  private currentDef: StationDef | null = null
  private tabs: HTMLButtonElement[] = []
  private blurb: HTMLParagraphElement | null = null
  private copyTimer: ReturnType<typeof setTimeout> | null = null
  private swipeDy = 0
  private open = false

  constructor(root: HTMLElement) {
    this.panel = document.createElement('aside')
    this.panel.className = 'sm-panel'
    this.panel.dataset.panel = ''
    this.panel.hidden = true
    this.panel.setAttribute('role', 'dialog')
    this.panel.setAttribute('aria-label', 'Station detail')

    // Persistent chrome (survives content swaps): grab handle + close button.
    const handle = document.createElement('div')
    handle.className = 'sm-panel__handle'
    handle.setAttribute('aria-hidden', 'true')

    this.content = document.createElement('div')
    this.content.className = 'sm-panel__content'

    this.close = document.createElement('button')
    this.close.type = 'button'
    this.close.className = 'sm-panel__close'
    this.close.dataset.panelClose = ''
    this.close.setAttribute('aria-label', 'Close')
    this.close.textContent = '✕'
    this.close.addEventListener('click', () => this.onCloseCb?.())

    this.panel.append(handle, this.content, this.close)
    root.appendChild(this.panel)

    // Swipe-down-to-close: accumulate downward drag on the panel itself.
    this.gestures = new GestureController(this.panel)
    this.gestures.on((e) => {
      if (!this.open) return
      if (e.type === 'dragmove') {
        this.swipeDy = Math.max(0, this.swipeDy + e.dy)
        if (this.swipeDy >= SWIPE_CLOSE_PX) {
          this.swipeDy = 0
          this.onCloseCb?.()
        }
      } else if (e.type === 'dragend') {
        this.swipeDy = 0
      }
    })
  }

  show(def: StationDef): void {
    this.currentDef = def
    this.tabs = []
    this.blurb = null
    this.clearCopyTimer()
    this.content.replaceChildren()

    // Header (shared by every variant).
    const header = document.createElement('div')
    header.className = 'sm-panel__header'

    const tagline = document.createElement('p')
    tagline.className = 'sm-panel__tagline u-label'
    tagline.textContent = def.tagline

    const title = document.createElement('h2')
    title.className = 'sm-panel__title'
    title.textContent = def.title

    const body = document.createElement('p')
    body.className = 'sm-panel__body'
    body.textContent = def.body

    header.append(tagline, title, body)
    this.content.appendChild(header)

    // Variant body.
    if (def.motif === 'contact') this.renderContact()
    else if (def.motif === 'satellites' && def.satellites?.length) this.renderSatellites(def)
    else this.renderChips(def)

    this.reveal()
  }

  /** Programmatically select a satellite tab (Task 14 may drive this from the 3D scene). */
  showSatellite(defId: string, satId: string): void {
    this.selectSatellite(defId, satId)
  }

  hide(): void {
    this.open = false
    this.swipeDy = 0
    this.clearCopyTimer()
    this.panel.classList.remove('is-open')
    this.panel.hidden = true
    this.content.replaceChildren()
    this.tabs = []
    this.blurb = null
    this.currentDef = null
  }

  onClose(cb: () => void): void {
    this.onCloseCb = cb
  }

  onSatellite(cb: (satId: string) => void): void {
    this.onSatelliteCb = cb
  }

  // --- variants ------------------------------------------------------------

  private renderChips(def: StationDef): void {
    const list = document.createElement('ul')
    list.className = 'sm-panel__chips'
    for (const cap of def.capabilities) {
      const chip = document.createElement('li')
      chip.className = 'sm-panel__chip'
      chip.dataset.panelChip = ''
      chip.textContent = cap
      list.appendChild(chip)
    }
    this.content.appendChild(list)
  }

  private renderContact(): void {
    const email = SITE.email

    const address = document.createElement('p')
    address.className = 'sm-panel__email'
    address.textContent = email

    const actions = document.createElement('div')
    actions.className = 'sm-panel__actions'

    const mail = document.createElement('a')
    mail.className = 'sm-btn sm-btn--primary'
    mail.href = `mailto:${email}`
    mail.dataset.panelMail = ''
    mail.textContent = 'Email us'

    const copy = document.createElement('button')
    copy.type = 'button'
    copy.className = 'sm-btn sm-btn--ghost'
    copy.dataset.panelCopy = ''
    copy.textContent = 'Copy'
    copy.addEventListener('click', () => this.copyEmail(copy))

    actions.append(mail, copy)
    this.content.append(address, actions)
  }

  private renderSatellites(def: StationDef): void {
    const sats = def.satellites ?? []

    const tablist = document.createElement('div')
    tablist.className = 'sm-panel__tabs'
    tablist.setAttribute('role', 'tablist')
    this.tabs = sats.map((sat) => {
      const tab = document.createElement('button')
      tab.type = 'button'
      tab.className = 'sm-panel__tab'
      tab.dataset.panelTab = ''
      tab.dataset.satId = sat.id
      tab.setAttribute('role', 'tab')
      tab.textContent = sat.title
      tab.addEventListener('click', () => {
        this.selectSatellite(def.id, sat.id)
        this.onSatelliteCb?.(sat.id)
      })
      tablist.appendChild(tab)
      return tab
    })

    this.blurb = document.createElement('p')
    this.blurb.className = 'sm-panel__blurb'
    this.blurb.dataset.panelBlurb = ''

    this.content.append(tablist, this.blurb)

    // Default to the first satellite so the region is never empty.
    if (sats[0]) this.selectSatellite(def.id, sats[0].id)
  }

  private selectSatellite(defId: string, satId: string): void {
    const def = STATIONS.find((s) => s.id === defId) ?? this.currentDef ?? undefined
    const sat = def?.satellites?.find((s) => s.id === satId)
    if (this.blurb && sat) this.blurb.textContent = sat.blurb
    for (const tab of this.tabs) tab.classList.toggle('is-active', tab.dataset.satId === satId)
  }

  // --- helpers -------------------------------------------------------------

  private copyEmail(btn: HTMLButtonElement): void {
    const clip = navigator.clipboard
    if (!clip?.writeText) return
    clip
      .writeText(SITE.email)
      .then(() => this.flashCopied(btn))
      .catch(() => {})
  }

  private flashCopied(btn: HTMLButtonElement): void {
    this.clearCopyTimer()
    btn.textContent = 'Copied'
    btn.classList.add('is-copied')
    this.copyTimer = setTimeout(() => {
      btn.textContent = 'Copy'
      btn.classList.remove('is-copied')
      this.copyTimer = null
    }, COPY_FEEDBACK_MS)
  }

  private clearCopyTimer(): void {
    if (this.copyTimer !== null) {
      clearTimeout(this.copyTimer)
      this.copyTimer = null
    }
  }

  private reveal(): void {
    this.open = true
    this.swipeDy = 0
    this.panel.hidden = false
    // Force a reflow so the transition runs from the off-screen state.
    void this.panel.offsetHeight
    this.panel.classList.add('is-open')
  }
}
