/**
 * NavState — single owner of the site's navigation mode.
 *
 * A tiny, dependency-free state machine. Gestures and UI call its methods;
 * camera/UI wiring subscribes via `on()` to react to confirmed transitions.
 * It never guesses: any call that isn't legal for the current mode is a
 * silent no-op (returns false, emits nothing) rather than throwing, so
 * callers can fire-and-forget without guarding on mode themselves.
 */

export type Mode = 'arrival' | 'travel' | 'focus' | 'map'

export interface NavSnapshot {
  mode: Mode
  stationId: string | null
}

type Listener = (next: NavSnapshot, prev: NavSnapshot) => void

export class NavState {
  private _mode: Mode = 'arrival'
  private _stationId: string | null = null

  private readonly listeners: Listener[] = []

  /** External code reads mode/stationId but must never set them directly — NavState is the sole owner. */
  get mode(): Mode {
    return this._mode
  }

  get stationId(): string | null {
    return this._stationId
  }

  enter(): boolean {
    return this.transition('arrival', 'travel')
  }

  dive(id: string): boolean {
    return this.transition('travel', 'focus', id)
  }

  exitFocus(): boolean {
    return this.transition('focus', 'travel', null)
  }

  openMap(): boolean {
    return this.transition('travel', 'map')
  }

  closeMap(): boolean {
    return this.transition('map', 'travel')
  }

  warp(id: string): boolean {
    return this.transition('map', 'travel', id)
  }

  on(cb: Listener): void {
    this.listeners.push(cb)
  }

  /**
   * Applies mode -> nextMode iff currently in `mode`. `stationId` is only
   * touched when the caller passes one explicitly (dive sets it, exitFocus
   * clears it via `null`, warp sets it); enter/openMap/closeMap omit the
   * argument entirely and leave whatever stationId is already there alone,
   * per spec: it's retained across a warp until dive/exitFocus/warp next
   * changes it.
   */
  private transition(from: Mode, to: Mode, nextStationId?: string | null): boolean {
    if (this._mode !== from) return false

    const prev: NavSnapshot = { mode: this._mode, stationId: this._stationId }

    this._mode = to
    if (nextStationId !== undefined) this._stationId = nextStationId

    const next: NavSnapshot = { mode: this._mode, stationId: this._stationId }
    for (const cb of this.listeners) {
      try {
        cb(next, prev)
      } catch (err) {
        console.error('[navState] listener error', err)
      }
    }
    return true
  }
}
