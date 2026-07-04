import { describe, it, expect, vi } from 'vitest'
import { NavState, type NavSnapshot } from './navState'

function snap(mode: NavSnapshot['mode'], stationId: string | null): NavSnapshot {
  return { mode, stationId }
}

describe('NavState — legal path', () => {
  it('walks the full legal path: arrival -> travel -> focus -> travel -> map -> travel', () => {
    const nav = new NavState()
    const calls: Array<{ next: NavSnapshot; prev: NavSnapshot }> = []
    nav.on((next, prev) => calls.push({ next, prev }))

    expect(nav.mode).toBe('arrival')
    expect(nav.stationId).toBeNull()

    expect(nav.enter()).toBe(true)
    expect(nav.mode).toBe('travel')
    expect(nav.stationId).toBeNull()

    expect(nav.dive('alpha')).toBe(true)
    expect(nav.mode).toBe('focus')
    expect(nav.stationId).toBe('alpha')

    expect(nav.exitFocus()).toBe(true)
    expect(nav.mode).toBe('travel')
    expect(nav.stationId).toBeNull()

    expect(nav.openMap()).toBe(true)
    expect(nav.mode).toBe('map')
    expect(nav.stationId).toBeNull()

    expect(nav.warp('beta')).toBe(true)
    expect(nav.mode).toBe('travel')
    expect(nav.stationId).toBe('beta')

    expect(calls).toEqual([
      { prev: snap('arrival', null), next: snap('travel', null) },
      { prev: snap('travel', null), next: snap('focus', 'alpha') },
      { prev: snap('focus', 'alpha'), next: snap('travel', null) },
      { prev: snap('travel', null), next: snap('map', null) },
      { prev: snap('map', null), next: snap('travel', 'beta') },
    ])
  })

  it('supports multiple listeners, all notified on each legal transition', () => {
    const nav = new NavState()
    const a = vi.fn()
    const b = vi.fn()
    nav.on(a)
    nav.on(b)

    nav.enter()

    expect(a).toHaveBeenCalledTimes(1)
    expect(b).toHaveBeenCalledTimes(1)
    expect(a).toHaveBeenCalledWith(snap('travel', null), snap('arrival', null))
    expect(b).toHaveBeenCalledWith(snap('travel', null), snap('arrival', null))
  })

  it('retains stationId across a warp until the next transition that actually changes it', () => {
    const nav = new NavState()
    nav.enter()
    nav.openMap()
    nav.warp('gamma')
    expect(nav.stationId).toBe('gamma')

    // Re-entering/leaving the map without diving or warping again must not touch it.
    expect(nav.openMap()).toBe(true)
    expect(nav.stationId).toBe('gamma')
    expect(nav.closeMap()).toBe(true)
    expect(nav.stationId).toBe('gamma')

    // A fresh dive is what finally changes it.
    expect(nav.dive('delta')).toBe(true)
    expect(nav.stationId).toBe('delta')
  })

  it('isolates listener exceptions: one throwing listener does not prevent others from being notified', () => {
    const nav = new NavState()
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const listenerOne = vi.fn()
    const listenerTwo = vi.fn(() => {
      throw new Error('listener two error')
    })
    const listenerThree = vi.fn()

    nav.on(listenerOne)
    nav.on(listenerTwo)
    nav.on(listenerThree)

    const result = nav.enter()

    expect(result).toBe(true)
    expect(listenerOne).toHaveBeenCalledTimes(1)
    expect(listenerOne).toHaveBeenCalledWith(snap('travel', null), snap('arrival', null))
    expect(listenerThree).toHaveBeenCalledTimes(1)
    expect(listenerThree).toHaveBeenCalledWith(snap('travel', null), snap('arrival', null))
    expect(nav.mode).toBe('travel')

    spy.mockRestore()
  })
})

describe('NavState — illegal transitions', () => {
  function inArrival(): NavState {
    return new NavState()
  }
  function inTravel(): NavState {
    const nav = new NavState()
    nav.enter()
    return nav
  }
  function inFocus(): NavState {
    const nav = inTravel()
    nav.dive('station-x')
    return nav
  }
  function inMap(): NavState {
    const nav = inTravel()
    nav.openMap()
    return nav
  }

  const cases: Array<{
    modeName: string
    setup: () => NavState
    illegal: Array<{ name: string; call: (nav: NavState) => boolean }>
  }> = [
    {
      modeName: 'arrival',
      setup: inArrival,
      illegal: [
        { name: 'dive', call: (n) => n.dive('x') },
        { name: 'exitFocus', call: (n) => n.exitFocus() },
        { name: 'openMap', call: (n) => n.openMap() },
        { name: 'closeMap', call: (n) => n.closeMap() },
        { name: 'warp', call: (n) => n.warp('x') },
      ],
    },
    {
      modeName: 'travel',
      setup: inTravel,
      illegal: [
        { name: 'enter', call: (n) => n.enter() },
        { name: 'exitFocus', call: (n) => n.exitFocus() },
        { name: 'closeMap', call: (n) => n.closeMap() },
        { name: 'warp', call: (n) => n.warp('x') },
      ],
    },
    {
      modeName: 'focus',
      setup: inFocus,
      illegal: [
        { name: 'enter', call: (n) => n.enter() },
        { name: 'dive', call: (n) => n.dive('y') },
        { name: 'openMap', call: (n) => n.openMap() },
        { name: 'closeMap', call: (n) => n.closeMap() },
        { name: 'warp', call: (n) => n.warp('x') },
      ],
    },
    {
      modeName: 'map',
      setup: inMap,
      illegal: [
        { name: 'enter', call: (n) => n.enter() },
        { name: 'dive', call: (n) => n.dive('x') },
        { name: 'exitFocus', call: (n) => n.exitFocus() },
        { name: 'openMap', call: (n) => n.openMap() },
      ],
    },
  ]

  for (const { modeName, setup, illegal } of cases) {
    for (const { name, call } of illegal) {
      it(`${name}() from ${modeName} returns false and emits nothing`, () => {
        const nav = setup()
        const before: NavSnapshot = { mode: nav.mode, stationId: nav.stationId }
        const spy = vi.fn()
        nav.on(spy)

        const result = call(nav)

        expect(result).toBe(false)
        expect(spy).not.toHaveBeenCalled()
        expect(nav.mode).toBe(before.mode)
        expect(nav.stationId).toBe(before.stationId)
      })
    }
  }
})
