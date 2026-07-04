// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { GestureController, type GestureEvent } from './gestures'

/**
 * jsdom has no PointerEvent constructor. Polyfill with a MouseEvent subclass
 * carrying the extra pointer fields our controller reads, plus a way to force
 * `timeStamp` (a real, read-only Event property) to an arbitrary test clock
 * value so drag-velocity / tap-duration math is fully deterministic.
 */
class FakePointerEvent extends MouseEvent {
  readonly pointerId: number
  readonly isPrimary: boolean
  constructor(
    type: string,
    params: MouseEventInit & { pointerId?: number; isPrimary?: boolean; timeStamp?: number } = {},
  ) {
    super(type, params)
    this.pointerId = params.pointerId ?? 0
    this.isPrimary = params.isPrimary ?? true
    if (params.timeStamp !== undefined) {
      Object.defineProperty(this, 'timeStamp', { value: params.timeStamp, configurable: true })
    }
  }
}

function down(id: number, x: number, y: number, t: number): Event {
  return new FakePointerEvent('pointerdown', { pointerId: id, clientX: x, clientY: y, timeStamp: t })
}
function move(id: number, x: number, y: number, t: number): Event {
  return new FakePointerEvent('pointermove', { pointerId: id, clientX: x, clientY: y, timeStamp: t })
}
function up(id: number, x: number, y: number, t: number): Event {
  return new FakePointerEvent('pointerup', { pointerId: id, clientX: x, clientY: y, timeStamp: t })
}
function cancel(id: number, x: number, y: number, t: number): Event {
  return new FakePointerEvent('pointercancel', { pointerId: id, clientX: x, clientY: y, timeStamp: t })
}

let el: HTMLDivElement

beforeEach(() => {
  el = document.createElement('div')
  // jsdom doesn't implement pointer capture at all.
  el.setPointerCapture = () => {}
  el.releasePointerCapture = () => {}
})

function record(ctrl: GestureController): GestureEvent[] {
  const events: GestureEvent[] = []
  ctrl.on((e) => events.push(e))
  return events
}

describe('GestureController — tap', () => {
  it('classifies pointerdown -> up as a tap when movement <10px and duration <350ms', () => {
    const ctrl = new GestureController(el)
    const events = record(ctrl)

    el.dispatchEvent(down(1, 100, 100, 0))
    el.dispatchEvent(up(1, 103, 102, 200))

    expect(events).toEqual([{ type: 'tap', x: 103, y: 102 }])
  })

  it('is not a tap when duration >=350ms even with tiny movement', () => {
    const ctrl = new GestureController(el)
    const events = record(ctrl)

    el.dispatchEvent(down(1, 50, 50, 0))
    el.dispatchEvent(up(1, 51, 50, 400))

    expect(events.some((e) => e.type === 'tap')).toBe(false)
  })

  it('is not a tap when movement >=10px even if released quickly', () => {
    const ctrl = new GestureController(el)
    const events = record(ctrl)

    el.dispatchEvent(down(1, 0, 0, 0))
    el.dispatchEvent(up(1, 20, 0, 50))

    expect(events.some((e) => e.type === 'tap')).toBe(false)
  })
})

describe('GestureController — drag', () => {
  it('emits per-move dragmove deltas once total movement crosses 10px, then a signed dragend velocity from the last 80ms window', () => {
    const ctrl = new GestureController(el)
    const events = record(ctrl)

    el.dispatchEvent(down(1, 0, 0, 0))
    el.dispatchEvent(move(1, 5, 0, 10)) // 5px: below threshold, no dragmove yet
    el.dispatchEvent(move(1, 20, 0, 50)) // 20px total: crosses threshold
    el.dispatchEvent(move(1, 40, 0, 100))
    el.dispatchEvent(up(1, 60, 0, 150))

    const moves = events.filter((e): e is Extract<GestureEvent, { type: 'dragmove' }> => e.type === 'dragmove')
    expect(moves.length).toBe(2)
    expect(moves[1]).toEqual({ type: 'dragmove', dx: 20, dy: 0 })

    const end = events.find((e) => e.type === 'dragend')
    expect(end).toBeDefined()
    if (end?.type === 'dragend') {
      // last 80ms window before t=150 starts at t=70: only the t=100 sample (x=40) qualifies.
      // vx = (60 - 40) / ((150 - 100) / 1000) = 400 px/s
      expect(end.vx).toBeCloseTo(400)
      expect(end.vy).toBeCloseTo(0)
    }
    expect(events.some((e) => e.type === 'tap')).toBe(false)
  })

  it('reports negative velocity for a leftward release', () => {
    const ctrl = new GestureController(el)
    const events = record(ctrl)

    el.dispatchEvent(down(1, 100, 0, 0))
    el.dispatchEvent(move(1, 70, 0, 50))
    el.dispatchEvent(move(1, 40, 0, 100))
    el.dispatchEvent(up(1, 20, 0, 150))

    const end = events.find((e) => e.type === 'dragend')
    expect(end).toBeDefined()
    if (end?.type === 'dragend') {
      // window starts at t=70: t=100 sample (x=40) qualifies.
      // vx = (20 - 40) / 0.05 = -400 px/s
      expect(end.vx).toBeCloseTo(-400)
    }
  })
})

describe('GestureController — pinch', () => {
  it('treats a second simultaneous pointer as a pinch, not a drag, and reports a running scale', () => {
    const ctrl = new GestureController(el)
    const events = record(ctrl)

    el.dispatchEvent(down(1, 0, 0, 0))
    el.dispatchEvent(move(1, 5, 0, 10)) // sub-threshold; no drag yet
    el.dispatchEvent(down(2, 100, 0, 20)) // second pointer -> pinch, cancels the would-be drag
    el.dispatchEvent(move(2, 150, 0, 30)) // p1 stays at (5,0): dist 145 vs initial 95

    expect(events.some((e) => e.type === 'dragmove')).toBe(false)
    const pinch = events.find((e) => e.type === 'pinch')
    expect(pinch).toBeDefined()
    if (pinch?.type === 'pinch') {
      expect(pinch.scale).toBeCloseTo(145 / 95)
    }
  })

  it('emits pinchend when either pointer lifts, and does not misclassify subsequent single-pointer moves as pinch', () => {
    const ctrl = new GestureController(el)
    const events = record(ctrl)

    el.dispatchEvent(down(1, 0, 0, 0))
    el.dispatchEvent(down(2, 100, 0, 10))
    el.dispatchEvent(move(2, 150, 0, 20)) // scale = 150/100 = 1.5
    el.dispatchEvent(up(1, 0, 0, 30))

    const pinchend = events.find((e) => e.type === 'pinchend')
    expect(pinchend).toBeDefined()
    if (pinchend?.type === 'pinchend') {
      expect(pinchend.scale).toBeCloseTo(1.5)
    }
  })

  it('ignores a third simultaneous pointer for classification purposes', () => {
    const ctrl = new GestureController(el)
    const events = record(ctrl)

    el.dispatchEvent(down(1, 0, 0, 0))
    el.dispatchEvent(down(2, 100, 0, 10))
    el.dispatchEvent(down(3, 200, 0, 20))
    const countBefore = events.length
    el.dispatchEvent(move(3, 250, 0, 30))

    expect(events.length).toBe(countBefore) // 3rd pointer's move produces no event
  })

  it('does not emit a phantom tap when a pinch ends by sequential finger-lift (quick, roughly stationary)', () => {
    const ctrl = new GestureController(el)
    const events = record(ctrl)

    el.dispatchEvent(down(1, 0, 0, 0))
    el.dispatchEvent(down(2, 100, 0, 10)) // pinch starts, initial dist 100
    el.dispatchEvent(move(2, 110, 0, 20)) // scale 1.1
    el.dispatchEvent(up(1, 0, 0, 30)) // first finger lifts -> pinchend, resumes tapdrag on id2 (drag-only)
    el.dispatchEvent(up(2, 110, 0, 40)) // quick, stationary lift of the resumed finger

    expect(events).toEqual([
      { type: 'pinch', scale: 1.1 },
      { type: 'pinchend', scale: 1.1 },
    ])
    expect(events.some((e) => e.type === 'tap')).toBe(false)
  })

  it('lets the finger remaining after a pinch still drag if it moves past the threshold', () => {
    const ctrl = new GestureController(el)
    const events = record(ctrl)

    el.dispatchEvent(down(1, 0, 0, 0))
    el.dispatchEvent(down(2, 100, 0, 10)) // pinch starts, initial dist 100
    el.dispatchEvent(up(2, 100, 0, 20)) // second finger lifts -> pinchend, resumes tapdrag on id1
    el.dispatchEvent(move(1, 30, 0, 50)) // resumed finger moves 30px -> crosses drag threshold
    el.dispatchEvent(up(1, 30, 0, 80))

    expect(events[0]).toEqual({ type: 'pinchend', scale: 1 })
    const moves = events.filter((e): e is Extract<GestureEvent, { type: 'dragmove' }> => e.type === 'dragmove')
    expect(moves.length).toBeGreaterThan(0)
    expect(moves[0]).toEqual({ type: 'dragmove', dx: 30, dy: 0 })
    const last = events.at(-1)
    expect(last?.type).toBe('dragend')
    expect(events.some((e) => e.type === 'tap')).toBe(false)
  })
})

describe('GestureController — pointercancel', () => {
  it('never emits tap on a cancelled pointer, even with negligible movement/duration', () => {
    const ctrl = new GestureController(el)
    const events = record(ctrl)

    el.dispatchEvent(down(1, 10, 10, 0))
    el.dispatchEvent(cancel(1, 11, 10, 20))

    expect(events.some((e) => e.type === 'tap')).toBe(false)
  })

  it('emits a dead-stop dragend (vx:0, vy:0) instead of a momentum fling when a fast drag is cancelled', () => {
    const ctrl = new GestureController(el)
    const events = record(ctrl)

    el.dispatchEvent(down(1, 0, 0, 0))
    el.dispatchEvent(move(1, 20, 0, 10)) // crosses drag threshold
    el.dispatchEvent(move(1, 100, 0, 20)) // fast move — would compute a large real velocity
    el.dispatchEvent(cancel(1, 120, 0, 25)) // browser steals the gesture mid-motion

    const end = events.find((e) => e.type === 'dragend')
    expect(end).toEqual({ type: 'dragend', vx: 0, vy: 0 })
  })
})

describe('GestureController — wheel', () => {
  it('passes deltaY through as delta (wheel-down / positive deltaY = travel forward positive)', () => {
    const ctrl = new GestureController(el)
    const events = record(ctrl)

    el.dispatchEvent(new WheelEvent('wheel', { deltaY: 120 }))
    el.dispatchEvent(new WheelEvent('wheel', { deltaY: -50 }))

    expect(events).toEqual([
      { type: 'wheel', delta: 120 },
      { type: 'wheel', delta: -50 },
    ])
  })
})

describe('GestureController — dispose', () => {
  it('stops emitting events after dispose', () => {
    const ctrl = new GestureController(el)
    const events = record(ctrl)
    ctrl.dispose()

    el.dispatchEvent(down(1, 0, 0, 0))
    el.dispatchEvent(up(1, 1, 1, 50))
    el.dispatchEvent(new WheelEvent('wheel', { deltaY: 10 }))

    expect(events.length).toBe(0)
  })
})
