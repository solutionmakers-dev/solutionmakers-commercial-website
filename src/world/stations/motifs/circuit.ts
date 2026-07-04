import * as THREE from 'three'
import type { MotifBuilder } from '../station'
import { BLUE, WHITE, buildStationBase, updateBase, focusScale, createSoftCircleTexture } from './common'

/**
 * circuit — the Hardware Innovation motif. A wireframe slab "device" (a phone-
 * sized board seen face-on) with twelve Manhattan-routed PCB traces breaking out
 * from its edges, each carrying a light pulse that travels the copper on a loop.
 * Atoms, meet bits: the board is still, the signals never are.
 */

const DEVICE_W = 1.6
const DEVICE_H = 2.6
const DEVICE_D = 0.12

const TRACE_RADIUS = 0.008
const TRACE_OPACITY = 0.55
const PAD_RADIUS = 0.035
const PULSE_SIZE = 0.09
const PULSE_OPACITY = 0.9
const EDGE_OPACITY = 0.85
const SCREEN_OPACITY = 0.22
const SWAY = 0.07 // gentle whole-motif yaw sway (rad)

/**
 * Twelve Manhattan polylines (all in the board's XY plane, z=0): three per edge,
 * each starting ON the device edge and stepping outward with axis-aligned bends,
 * like breakout routing on a dev board.
 */
const TRACES: Array<Array<[number, number]>> = [
  // right edge (x = +0.8)
  [[0.8, 0.9], [1.4, 0.9], [1.4, 1.5], [2.2, 1.5]],
  [[0.8, 0.3], [1.7, 0.3], [1.7, -0.2], [2.4, -0.2]],
  [[0.8, -0.5], [1.2, -0.5], [1.2, -1.1], [2.0, -1.1]],
  // left edge (x = -0.8)
  [[-0.8, 0.6], [-1.5, 0.6], [-1.5, 1.2], [-2.3, 1.2]],
  [[-0.8, 0.0], [-1.3, 0.0], [-1.3, -0.6], [-2.1, -0.6]],
  [[-0.8, -0.8], [-1.8, -0.8], [-1.8, -1.4], [-2.4, -1.4]],
  // top edge (y = +1.3)
  [[-0.45, 1.3], [-0.45, 1.8], [-1.1, 1.8], [-1.1, 2.3]],
  [[0.1, 1.3], [0.1, 2.1], [0.7, 2.1]],
  [[0.5, 1.3], [0.5, 1.7], [1.3, 1.7], [1.3, 2.2]],
  // bottom edge (y = -1.3)
  [[-0.5, -1.3], [-0.5, -1.9], [-1.2, -1.9], [-1.2, -2.3]],
  [[0.0, -1.3], [0.0, -2.2], [0.6, -2.2]],
  [[0.55, -1.3], [0.55, -1.7], [1.4, -1.7], [1.4, -2.2]],
]

// Per-pulse loop speed (fraction of trace per second) — varied so the pulses
// never phase-lock into a single synchronized blink.
const PULSE_SPEEDS = [0.34, 0.27, 0.4, 0.3, 0.37, 0.25, 0.32, 0.42, 0.28, 0.36, 0.31, 0.39]

function tracePath(points: Array<[number, number]>): THREE.CurvePath<THREE.Vector3> {
  const path = new THREE.CurvePath<THREE.Vector3>()
  for (let i = 0; i < points.length - 1; i++) {
    const [ax, ay] = points[i]!
    const [bx, by] = points[i + 1]!
    path.add(new THREE.LineCurve3(new THREE.Vector3(ax, ay, 0), new THREE.Vector3(bx, by, 0)))
  }
  return path
}

export const circuit: MotifBuilder = (def, _tier) => {
  const base = buildStationBase(def)
  const motif = new THREE.Group()
  base.group.add(motif)

  // --- device slab ----------------------------------------------------------
  const edgeMat = new THREE.LineBasicMaterial({
    color: new THREE.Color(BLUE),
    transparent: true,
    opacity: EDGE_OPACITY,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  })
  const slabGeo = new THREE.BoxGeometry(DEVICE_W, DEVICE_H, DEVICE_D)
  motif.add(new THREE.LineSegments(new THREE.EdgesGeometry(slabGeo), edgeMat))

  // Inset "screen" hairline on the front face — sells the slab as a device.
  const screenMat = new THREE.LineBasicMaterial({
    color: new THREE.Color(WHITE),
    transparent: true,
    opacity: SCREEN_OPACITY,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  })
  const sw = DEVICE_W * 0.8
  const sh = DEVICE_H * 0.84
  const sz = DEVICE_D / 2 + 0.005
  const screenPts = [
    new THREE.Vector3(-sw / 2, -sh / 2, sz),
    new THREE.Vector3(sw / 2, -sh / 2, sz),
    new THREE.Vector3(sw / 2, sh / 2, sz),
    new THREE.Vector3(-sw / 2, sh / 2, sz),
  ]
  motif.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(screenPts), screenMat))

  // Hairline component footprints (SoC, passives, connector) on the board face —
  // kept clear of the center where the chrome core floats. [cx, cy, w, h]
  const COMPONENTS: Array<[number, number, number, number]> = [
    [-0.35, 0.78, 0.3, 0.3],
    [0.32, 0.92, 0.22, 0.14],
    [0.42, -0.62, 0.18, 0.28],
    [-0.4, -0.82, 0.26, 0.16],
    [0.02, -1.02, 0.34, 0.1],
  ]
  for (const [cx, cy, w, h] of COMPONENTS) {
    const pts = [
      new THREE.Vector3(cx - w / 2, cy - h / 2, sz),
      new THREE.Vector3(cx + w / 2, cy - h / 2, sz),
      new THREE.Vector3(cx + w / 2, cy + h / 2, sz),
      new THREE.Vector3(cx - w / 2, cy + h / 2, sz),
    ]
    motif.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts), screenMat))
  }

  // --- PCB traces + pads ------------------------------------------------------
  const traceMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(BLUE),
    transparent: true,
    opacity: TRACE_OPACITY,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  })
  const padMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(BLUE),
    transparent: true,
    opacity: 0.8,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  })
  const padGeo = new THREE.CircleGeometry(PAD_RADIUS, 16)

  const paths: THREE.CurvePath<THREE.Vector3>[] = []
  for (const pts of TRACES) {
    const path = tracePath(pts)
    paths.push(path)
    motif.add(new THREE.Mesh(new THREE.TubeGeometry(path, 48, TRACE_RADIUS, 6, false), traceMat))
    // Terminal pad at the outer end of the trace.
    const [ex, ey] = pts[pts.length - 1]!
    const pad = new THREE.Mesh(padGeo, padMat)
    pad.position.set(ex, ey, 0)
    motif.add(pad)
  }

  // --- pulses ------------------------------------------------------------------
  const sprite = createSoftCircleTexture()
  const pulseMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(WHITE),
    transparent: true,
    opacity: PULSE_OPACITY,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    map: sprite,
    side: THREE.DoubleSide,
  })
  const pulseGeo = new THREE.PlaneGeometry(PULSE_SIZE, PULSE_SIZE)
  const pulses: THREE.Mesh[] = []
  const scratch = new THREE.Vector3()
  for (let i = 0; i < paths.length; i++) {
    const pulse = new THREE.Mesh(pulseGeo, pulseMat)
    const phase = i / paths.length
    paths[i]!.getPointAt(phase, scratch)
    pulse.position.set(scratch.x, scratch.y, 0.02)
    pulses.push(pulse)
    motif.add(pulse)
  }

  return {
    group: base.group,
    core: base.core,
    update(dt, elapsed, focus) {
      updateBase(base, dt, elapsed, focus)
      // Each pulse rides its trace on a loop, offset by its index phase.
      for (let i = 0; i < pulses.length; i++) {
        const u = (elapsed * PULSE_SPEEDS[i]! + i / pulses.length) % 1
        paths[i]!.getPointAt(u, scratch)
        pulses[i]!.position.set(scratch.x, scratch.y, 0.02)
      }
      motif.rotation.y = Math.sin(elapsed * 0.3) * SWAY
      motif.scale.setScalar(focusScale(focus))
      traceMat.opacity = TRACE_OPACITY * (1 + focus * 0.6)
      edgeMat.opacity = EDGE_OPACITY * (1 + focus * 0.15)
      pulseMat.opacity = PULSE_OPACITY * (1 + focus * 0.1)
    },
  }
}
