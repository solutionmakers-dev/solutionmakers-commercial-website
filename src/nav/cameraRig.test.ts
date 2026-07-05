import { describe, it, expect, vi } from 'vitest'
import * as THREE from 'three'
import { CameraRig, PATH_POINTS } from './cameraRig'
import { STATIONS } from '../content/content'

function makeCamera(): THREE.PerspectiveCamera {
  return new THREE.PerspectiveCamera(55, 1, 0.1, 120)
}

function makeRig(): { rig: CameraRig; camera: THREE.PerspectiveCamera } {
  const camera = makeCamera()
  const rig = new CameraRig(camera, STATIONS)
  return { rig, camera }
}

function tick(rig: CameraRig, frames: number, dt = 1 / 60): void {
  for (let i = 0; i < frames; i++) rig.update(dt)
}

// Reconstruct the path identically to the rig so tests can compute expected poses.
const curve = new THREE.CatmullRomCurve3(PATH_POINTS)
const UP = new THREE.Vector3(0, 1, 0)

function lateralAt(t: number): THREE.Vector3 {
  const tan = curve.getTangentAt(THREE.MathUtils.clamp(t, 0, 1))
  return new THREE.Vector3().crossVectors(tan, UP).normalize()
}

describe('PATH_POINTS', () => {
  it('starts at the origin and is roughly 90 units long', () => {
    expect(PATH_POINTS[0]!.toArray()).toEqual([0, 0, 0])
    const len = curve.getLength()
    expect(len).toBeGreaterThan(80)
    expect(len).toBeLessThan(100)
  })
})

describe('CameraRig — travel input', () => {
  it('starts at t=0 on the path', () => {
    const { rig, camera } = makeRig()
    rig.update(1 / 60)
    expect(rig.t).toBeCloseTo(0, 3)
    expect(camera.position.distanceTo(new THREE.Vector3(0, 0, 0))).toBeLessThan(0.05)
  })

  it('addTravel clamps t into [0,1]', () => {
    const { rig } = makeRig()
    rig.addTravel(1e6)
    tick(rig, 600)
    expect(rig.t).toBeLessThanOrEqual(1)
    expect(rig.t).toBeCloseTo(1, 3)
    expect(Number.isFinite(rig.t)).toBe(true)

    const { rig: rig2 } = makeRig()
    rig2.addTravel(500) // move off zero first
    tick(rig2, 120)
    rig2.addTravel(-1e6)
    tick(rig2, 600)
    expect(rig2.t).toBeGreaterThanOrEqual(0)
    expect(rig2.t).toBeCloseTo(0, 3)
  })

  it('fling settles near a station and snaps onto it', () => {
    const { rig } = makeRig()
    rig.fling(1600) // px/s forward; decays to land ~0.31 → snaps to 0.32
    tick(rig, 500)
    const nearest = rig.nearestStation()
    expect(nearest.id).toBe('software')
    expect(Math.abs(rig.t - nearest.t)).toBeLessThan(0.005) // snapped, not merely close
  })

  it('nearestStation reflects the current t', () => {
    const { rig } = makeRig()
    rig.addTravel(0.48 / 0.00042) // → targetT ≈ 0.48
    tick(rig, 400)
    expect(rig.nearestStation().id).toBe('ai')
  })

  it('onProgress fires only when t moves more than 0.001', () => {
    const { rig } = makeRig()
    const cb = vi.fn()
    rig.onProgress(cb)

    // No input: t stays put → no notifications.
    tick(rig, 10)
    expect(cb).not.toHaveBeenCalled()

    rig.addTravel(2000)
    tick(rig, 120)
    expect(cb).toHaveBeenCalled()
    const last = cb.mock.calls.at(-1)![0] as number
    expect(last).toBeGreaterThan(0)
  })
})

describe('CameraRig — stationAnchor', () => {
  it('returns finite, distinct positions with an alternating lateral sign', () => {
    const anchors = STATIONS.map((s) => rig().stationAnchor(s.id))
    function rig(): CameraRig {
      return makeRig().rig
    }

    // finite
    for (const a of anchors) {
      expect(Number.isFinite(a.x) && Number.isFinite(a.y) && Number.isFinite(a.z)).toBe(true)
    }
    // distinct
    for (let i = 0; i < anchors.length; i++) {
      for (let j = i + 1; j < anchors.length; j++) {
        expect(anchors[i]!.distanceTo(anchors[j]!)).toBeGreaterThan(0.5)
      }
    }
    // lateral offset magnitude ~2.2 and sign alternates by index
    const signed = STATIONS.map((s, i) => {
      const anchor = anchors[i]!
      const path = curve.getPointAt(s.t)
      return anchor.clone().sub(path).dot(lateralAt(s.t))
    })
    for (const s of signed) expect(Math.abs(s)).toBeCloseTo(2.2, 4)
    for (let i = 0; i + 1 < signed.length; i++) {
      expect(signed[i]! * signed[i + 1]!).toBeLessThan(0) // opposite signs
    }
  })

  it('is a no-op returning a stable value for an unknown id', () => {
    const { rig } = makeRig()
    expect(() => rig.stationAnchor('nope')).not.toThrow()
  })
})

describe('CameraRig — dive', () => {
  it('reaches the focus pose (4.4 units, 12° above, looking at the anchor) within 0.1', () => {
    const { rig, camera } = makeRig()
    const id = 'ai'
    const station = STATIONS.find((s) => s.id === id)!
    const anchor = rig.stationAnchor(id)
    const path = curve.getPointAt(station.t)
    const viewDir = path.clone().sub(anchor).normalize()
    const el = (12 * Math.PI) / 180
    const expected = anchor
      .clone()
      .add(viewDir.clone().multiplyScalar(4.4 * Math.cos(el)))
      .add(UP.clone().multiplyScalar(4.4 * Math.sin(el)))

    const onDone = vi.fn()
    rig.diveTo(id, onDone)
    tick(rig, 60) // 1 s ≥ 650 ms tween

    expect(camera.position.distanceTo(expected)).toBeLessThan(0.1)
    expect(camera.position.distanceTo(anchor)).toBeCloseTo(4.4, 1)
    expect(onDone).toHaveBeenCalledTimes(1)
  })

  it('backs the dive pose off on portrait so wide motifs fit the horizontal frame', () => {
    // Portrait phone: horizontal half-frame at 4.4 units is ~1.06 world units,
    // so the pose scales out until DIVE_FIT_HALF_WIDTH (2.2) fits.
    const aspect = 393 / 852
    const camera = new THREE.PerspectiveCamera(55, aspect, 0.1, 300)
    const rig = new CameraRig(camera, STATIONS)
    const anchor = rig.stationAnchor('rd')
    rig.diveTo('rd')
    tick(rig, 120)
    const expected = 4.4 * Math.max(1, 2.2 / (4.4 * Math.tan((27.5 * Math.PI) / 180) * aspect))
    expect(camera.position.distanceTo(anchor)).toBeCloseTo(expected, 1)
    expect(expected).toBeGreaterThan(8) // sanity: portrait really does back off
  })

  it('ignores travel input while diving, then restores travel after exitDive', () => {
    const { rig } = makeRig()
    rig.diveTo('ai')
    rig.addTravel(1e6) // must be ignored during the tween
    tick(rig, 60)
    rig.exitDive()
    tick(rig, 200)
    expect(rig.t).toBeCloseTo(0, 2) // back to the pre-dive travel t, input was ignored
  })

  it('diveTo with an unknown id does not throw', () => {
    const { rig } = makeRig()
    expect(() => rig.diveTo('nope')).not.toThrow()
  })
})

describe('CameraRig — map & warp', () => {
  it('toMap then fromMap returns to travel', () => {
    const { rig } = makeRig()
    rig.addTravel(0.32 / 0.00042)
    tick(rig, 200)
    const before = rig.t
    rig.toMap()
    tick(rig, 60)
    rig.fromMap()
    tick(rig, 120)
    expect(rig.t).toBeCloseTo(before, 2)
  })

  it('warpTo flies to the station travel pose', () => {
    const { rig } = makeRig()
    rig.warpTo('rd')
    tick(rig, 120) // > 900 ms
    expect(rig.t).toBeCloseTo(0.8, 2)
    expect(rig.nearestStation().id).toBe('rd')
  })

  it('warpToT flies to an arbitrary path parameter (home = 0)', () => {
    const { rig } = makeRig()
    rig.addTravel(0.64 / 0.00042)
    tick(rig, 300)
    rig.warpToT(0)
    tick(rig, 120) // > 900 ms
    expect(rig.t).toBeCloseTo(0, 3)
  })

  it('warpTo with an unknown id does not throw and leaves travel unchanged', () => {
    const { rig } = makeRig()
    const before = rig.t
    expect(() => rig.warpTo('nope')).not.toThrow()
    tick(rig, 60)
    expect(rig.t).toBeCloseTo(before, 3)
  })

  it('toMap keeps the canonical pose on wide viewports and pulls higher/further on portrait', () => {
    // Wide (aspect 1 ≥ fit threshold): canonical pose, mid + (0, 50, 58).
    const { rig: wide, camera: wideCam } = makeRig()
    wide.toMap()
    tick(wide, 120) // > 700 ms tween
    const mid = curve.getPointAt(0.5)
    expect(wideCam.position.y).toBeCloseTo(mid.y + 50, 1)
    expect(wideCam.position.z).toBeCloseTo(mid.z + 58, 1)

    // Portrait (phone-ish aspect): the horizontal fov is the binding
    // constraint — the pose scales up so the constellation's lateral spread
    // still fits in frame.
    const portraitCam = new THREE.PerspectiveCamera(55, 393 / 852, 0.1, 300)
    const portrait = new CameraRig(portraitCam, STATIONS)
    portrait.toMap()
    tick(portrait, 120)
    expect(portraitCam.position.y).toBeGreaterThan(wideCam.position.y + 10)
    expect(portraitCam.position.z).toBeGreaterThan(wideCam.position.z + 10)
  })
})

describe('CameraRig — setMotionScale (reduced motion)', () => {
  it('shortens a dive tween so it lands well inside the unscaled 650ms', () => {
    const { rig, camera } = makeRig()
    rig.setMotionScale(0.35)
    const anchor = rig.stationAnchor('ai')
    const onDone = vi.fn()
    rig.diveTo('ai', onDone)
    // 0.35 * 650ms ≈ 228ms — 14 frames at 60fps (~233ms) should already have
    // landed, well before the unscaled tween (650ms) would have.
    tick(rig, 14)
    expect(onDone).toHaveBeenCalledTimes(1)
    expect(camera.position.distanceTo(anchor)).toBeCloseTo(4.4, 1)
  })

  it('defaults to full-speed (scale 1) tweens', () => {
    const { rig } = makeRig()
    const onDone = vi.fn()
    rig.diveTo('ai', onDone)
    tick(rig, 14) // ~233ms, well under the unscaled 650ms tween
    expect(onDone).not.toHaveBeenCalled()
  })
})

describe('CameraRig — look offset', () => {
  it('setLook shifts the look direction but not the position', () => {
    const { rig, camera } = makeRig()
    rig.addTravel(0.32 / 0.00042)
    tick(rig, 200)
    const posBefore = camera.position.clone()

    const dirBefore = camera.getWorldDirection(new THREE.Vector3())
    rig.setLook(1, 1) // full yaw+pitch
    tick(rig, 120)
    const dirAfter = camera.getWorldDirection(new THREE.Vector3())

    expect(camera.position.distanceTo(posBefore)).toBeLessThan(0.05) // position unchanged
    expect(dirAfter.angleTo(dirBefore)).toBeGreaterThan(0.05) // look actually moved
  })
})
