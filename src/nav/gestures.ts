/**
 * GestureController — the input layer for the whole site.
 *
 * Pointer Events only (no touch/mouse event fallbacks). Classifies a stream
 * of pointerdown/move/up/cancel + wheel into a small typed vocabulary that
 * downstream nav code (camera travel, constellation map, station dives)
 * consumes without caring whether the input was a finger, a pen or a mouse.
 */

export type GestureEvent =
  | { type: 'dragmove'; dx: number; dy: number } // px since last event
  | { type: 'dragend'; vx: number; vy: number } // px/s at release
  | { type: 'pinch'; scale: number } // current/initial distance
  | { type: 'pinchend'; scale: number }
  | { type: 'tap'; x: number; y: number } // client coords
  | { type: 'wheel'; delta: number } // deltaY normalized

/** Below this total movement (px) a down->up is a tap candidate, not a drag. */
const TAP_MOVE_PX = 10
/** Above this duration (ms) a down->up is never a tap, regardless of movement. */
const TAP_MAX_MS = 350
/** Release velocity is computed from samples within this trailing window (ms). */
const VELOCITY_WINDOW_MS = 80

interface PointSample {
  t: number
  x: number
  y: number
}

type Mode = 'idle' | 'tapdrag' | 'pinch'

function dist(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

export class GestureController {
  private readonly el: HTMLElement
  private readonly listeners: Array<(e: GestureEvent) => void> = []

  /** Live coordinates for every currently-down pointer (including ones we ignore for classification). */
  private readonly points = new Map<number, { x: number; y: number }>()
  private mode: Mode = 'idle'

  // --- single-pointer tap/drag state ---
  private activeId: number | null = null
  private startX = 0
  private startY = 0
  private startT = 0
  private lastX = 0
  private lastY = 0
  private dragging = false
  private history: PointSample[] = []
  /**
   * True when this tapdrag was resumed on a remaining finger after a pinch
   * ended (see `endPointer`'s pinch branch). That finger's "start" is reset
   * to the moment of resume, so a quick, roughly-stationary lift of it would
   * otherwise misclassify as a fresh tap — it isn't one, it's just the tail
   * end of the pinch gesture. While this flag is set, tap classification is
   * suppressed; the resumed pointer can still become a real drag if it moves
   * past the threshold.
   */
  private suppressTap = false

  // --- two-pointer pinch state ---
  private pinchIds: [number, number] | null = null
  private pinchInitialDist = 0
  private pinchLastScale = 1

  constructor(el: HTMLElement) {
    this.el = el
    el.addEventListener('pointerdown', this.onPointerDown)
    el.addEventListener('pointermove', this.onPointerMove)
    el.addEventListener('pointerup', this.onPointerUp)
    el.addEventListener('pointercancel', this.onPointerCancel)
    el.addEventListener('wheel', this.onWheel)
  }

  on(cb: (e: GestureEvent) => void): void {
    this.listeners.push(cb)
  }

  dispose(): void {
    this.el.removeEventListener('pointerdown', this.onPointerDown)
    this.el.removeEventListener('pointermove', this.onPointerMove)
    this.el.removeEventListener('pointerup', this.onPointerUp)
    this.el.removeEventListener('pointercancel', this.onPointerCancel)
    this.el.removeEventListener('wheel', this.onWheel)
    this.listeners.length = 0
  }

  private emit(e: GestureEvent): void {
    for (const cb of this.listeners) cb(e)
  }

  private beginTapDrag(id: number, x: number, y: number, t: number, suppressTap = false): void {
    this.mode = 'tapdrag'
    this.activeId = id
    this.startX = x
    this.startY = y
    this.lastX = x
    this.lastY = y
    this.startT = t
    this.dragging = false
    this.history = [{ t, x, y }]
    this.suppressTap = suppressTap
  }

  private readonly onPointerDown = (e: PointerEvent): void => {
    try {
      this.el.setPointerCapture(e.pointerId)
    } catch {
      // unsupported (e.g. jsdom) — harmless in that case
    }
    this.points.set(e.pointerId, { x: e.clientX, y: e.clientY })

    if (this.mode === 'idle') {
      this.beginTapDrag(e.pointerId, e.clientX, e.clientY, e.timeStamp)
      return
    }

    if (this.mode === 'tapdrag' && this.points.size === 2) {
      // A second simultaneous pointer always means pinch. This silently
      // cancels any in-flight drag — no dragend is emitted for it.
      const otherId = [...this.points.keys()].find((id) => id !== e.pointerId)
      if (otherId === undefined) return
      const other = this.points.get(otherId)
      const self = this.points.get(e.pointerId)
      if (!other || !self) return

      this.pinchIds = [otherId, e.pointerId]
      this.pinchInitialDist = Math.max(dist(other, self), 1e-6)
      this.pinchLastScale = 1
      this.mode = 'pinch'
      this.activeId = null
      this.dragging = false
      this.history = []
      return
    }

    // mode === 'pinch' already, or an otherwise unexpected 3rd+ pointer:
    // it's tracked in `points` for bookkeeping but does not affect
    // classification (only the original two pinch pointers do).
  }

  private readonly onPointerMove = (e: PointerEvent): void => {
    if (this.points.has(e.pointerId)) {
      this.points.set(e.pointerId, { x: e.clientX, y: e.clientY })
    }

    if (this.mode === 'tapdrag' && e.pointerId === this.activeId) {
      this.history.push({ t: e.timeStamp, x: e.clientX, y: e.clientY })

      const totalDist = Math.hypot(e.clientX - this.startX, e.clientY - this.startY)
      if (!this.dragging && totalDist >= TAP_MOVE_PX) {
        this.dragging = true
      }
      if (this.dragging) {
        // `lastX`/`lastY` still hold the down point until the very first
        // dragmove below, so this first delta is measured from the down
        // point rather than from wherever we crossed TAP_MOVE_PX. That
        // folds any sub-threshold wiggle (up to ~10px) into the first
        // dragmove instead of discarding it — intentional, no motion lost.
        const dx = e.clientX - this.lastX
        const dy = e.clientY - this.lastY
        this.lastX = e.clientX
        this.lastY = e.clientY
        this.emit({ type: 'dragmove', dx, dy })
      }
      return
    }

    if (this.mode === 'pinch' && this.pinchIds && this.pinchIds.includes(e.pointerId)) {
      const [id1, id2] = this.pinchIds
      const p1 = this.points.get(id1)
      const p2 = this.points.get(id2)
      if (p1 && p2) {
        this.pinchLastScale = dist(p1, p2) / this.pinchInitialDist
        this.emit({ type: 'pinch', scale: this.pinchLastScale })
      }
      return
    }

    // move of a pointer we don't classify on (e.g. a 3rd+ finger) — ignored
  }

  private readonly onPointerUp = (e: PointerEvent): void => {
    this.endPointer(e, false)
  }

  private readonly onPointerCancel = (e: PointerEvent): void => {
    this.endPointer(e, true)
  }

  private endPointer(e: PointerEvent, cancelled: boolean): void {
    this.points.delete(e.pointerId)
    try {
      this.el.releasePointerCapture(e.pointerId)
    } catch {
      // unsupported / already released — harmless
    }

    if (this.mode === 'tapdrag' && e.pointerId === this.activeId) {
      const duration = e.timeStamp - this.startT
      const totalDist = Math.hypot(e.clientX - this.startX, e.clientY - this.startY)

      if (cancelled) {
        // The browser stole this gesture mid-motion (e.g. a system nav
        // swipe). Whatever velocity we'd computed is not a real release —
        // emitting it would fling the camera on input we didn't finish
        // classifying. Always report a dead stop instead.
        this.emit({ type: 'dragend', vx: 0, vy: 0 })
      } else if (!this.dragging && !this.suppressTap && totalDist < TAP_MOVE_PX && duration < TAP_MAX_MS) {
        this.emit({ type: 'tap', x: e.clientX, y: e.clientY })
      } else if (this.suppressTap && !this.dragging) {
        // Resumed from a pinch (see the pinch branch below) and lifted
        // again before crossing the drag threshold: this finger never did
        // anything on its own — not a tap (it's not a fresh gesture) and
        // not a drag (it never moved). Emit nothing.
      } else {
        const { vx, vy } = this.computeVelocity(e.timeStamp, e.clientX, e.clientY)
        this.emit({ type: 'dragend', vx, vy })
      }

      this.mode = 'idle'
      this.activeId = null
      this.dragging = false
      this.suppressTap = false
      this.history = []
      return
    }

    if (this.mode === 'pinch' && this.pinchIds && this.pinchIds.includes(e.pointerId)) {
      this.emit({ type: 'pinchend', scale: this.pinchLastScale })
      this.pinchIds = null
      this.mode = 'idle'

      // If another pointer is still down (the other pinch finger, or a
      // leftover 3rd+ finger), resume tap/drag tracking on it fresh —
      // its "start" is now, not whenever it originally went down. It's
      // drag-only, though: tap classification is suppressed (see
      // `suppressTap`) so a quick stationary lift right after the pinch
      // doesn't register as a phantom tap.
      const remainingId = [...this.points.keys()][0]
      if (remainingId !== undefined) {
        const p = this.points.get(remainingId)
        if (p) this.beginTapDrag(remainingId, p.x, p.y, e.timeStamp, true)
      }
      return
    }

    // an untracked 3rd+ pointer ended — nothing to do besides the removal above
  }

  private computeVelocity(endT: number, endX: number, endY: number): { vx: number; vy: number } {
    const windowStart = endT - VELOCITY_WINDOW_MS
    const inWindow = this.history.filter((s) => s.t >= windowStart)
    const base = inWindow[0] ?? this.history[this.history.length - 1]
    if (!base) return { vx: 0, vy: 0 }

    const dt = (endT - base.t) / 1000
    if (dt <= 0) return { vx: 0, vy: 0 }

    return { vx: (endX - base.x) / dt, vy: (endY - base.y) / dt }
  }

  private readonly onWheel = (e: WheelEvent): void => {
    // Sign convention: wheel-down (positive deltaY) = travel forward positive.
    // Native deltaY is already positive on wheel-down, so we pass it through
    // unmodified rather than inverting it.
    this.emit({ type: 'wheel', delta: e.deltaY })
  }
}
