import * as THREE from 'three'
import { TIERS } from '../../../core/quality'
import type { MotifBuilder } from '../station'
import { BLUE, WHITE, buildStationBase, updateBase, focusScale, createSoftCircleTexture } from './common'

/**
 * swarm — the AI Systems motif. A cloud of points drifting through a sphere,
 * each pulled toward one of five attractor loci that trade places every six
 * seconds — the cloud keeps re-organising itself, like attention shifting.
 * A sparse web of line segments links nearest pairs among a subsample,
 * recomputed twice a second, so faint constellations flicker through the swarm.
 */

const BASE_COUNT = 700
const SPHERE_RADIUS = 2
const ATTRACTOR_COUNT = 5
const ATTRACTOR_CYCLE_S = 6
const DRIFT_LAMBDA = 0.3 // per-second pull toward the point's attractor
const JITTER = 0.45 // per-point wander so the cloud stays a loose swarm, not 5 tight blobs

const SUBSAMPLE = 60 // pool for the constellation lines
const LINK_COUNT = 40 // segments drawn among the subsample
const LINK_REFRESH_S = 0.5

const POINT_SIZE = 0.05
const POINT_OPACITY = 0.85
const LINE_OPACITY = 0.28
const BLUE_STRIDE = 3 // every 3rd point brand blue, rest white

/** Deterministic-ish attractor placement: loci sit well inside the sphere. */
function randomLocus(out: THREE.Vector3): THREE.Vector3 {
  const r = SPHERE_RADIUS * (0.35 + 0.55 * Math.random())
  const theta = Math.random() * Math.PI * 2
  const phi = Math.acos(2 * Math.random() - 1)
  return out.set(
    r * Math.sin(phi) * Math.cos(theta),
    r * Math.sin(phi) * Math.sin(theta),
    r * Math.cos(phi),
  )
}

export const swarm: MotifBuilder = (def, tier) => {
  const base = buildStationBase(def)
  const motif = new THREE.Group()
  base.group.add(motif)

  const count = Math.round(BASE_COUNT * TIERS[tier].particleScale)

  // --- point cloud ----------------------------------------------------------
  const positions = new Float32Array(count * 3)
  const colors = new Float32Array(count * 3)
  const assignment = new Uint8Array(count) // which attractor each point follows
  const seed = new Float32Array(count) // per-point phase for jitter
  const white = new THREE.Color(WHITE)
  const blue = new THREE.Color(BLUE)

  const v = new THREE.Vector3()
  for (let i = 0; i < count; i++) {
    // Uniform-ish start inside the sphere.
    randomLocus(v).multiplyScalar(1 / 0.9)
    positions[i * 3] = v.x
    positions[i * 3 + 1] = v.y
    positions[i * 3 + 2] = v.z
    assignment[i] = i % ATTRACTOR_COUNT
    seed[i] = Math.random() * Math.PI * 2
    const c = i % BLUE_STRIDE === 0 ? blue : white
    colors[i * 3] = c.r
    colors[i * 3 + 1] = c.g
    colors[i * 3 + 2] = c.b
  }

  const pointGeo = new THREE.BufferGeometry()
  pointGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  pointGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3))

  const pointMat = new THREE.PointsMaterial({
    size: POINT_SIZE,
    map: createSoftCircleTexture(),
    vertexColors: true,
    transparent: true,
    opacity: POINT_OPACITY,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    sizeAttenuation: true,
  })
  motif.add(new THREE.Points(pointGeo, pointMat))

  // --- attractors -----------------------------------------------------------
  const attractors: THREE.Vector3[] = []
  const attractorTargets: THREE.Vector3[] = []
  for (let a = 0; a < ATTRACTOR_COUNT; a++) {
    attractors.push(randomLocus(new THREE.Vector3()))
    attractorTargets.push(randomLocus(new THREE.Vector3()))
  }
  let cycleTimer = 0

  // --- constellation lines ---------------------------------------------------
  // Fixed subsample of point indices; segment endpoints are refreshed in place.
  const sampleStride = Math.max(1, Math.floor(count / SUBSAMPLE))
  const sampleIdx: number[] = []
  for (let i = 0; i < count && sampleIdx.length < SUBSAMPLE; i += sampleStride) sampleIdx.push(i)

  const linePositions = new Float32Array(LINK_COUNT * 2 * 3)
  const lineColors = new Float32Array(LINK_COUNT * 2 * 3)
  const lineGeo = new THREE.BufferGeometry()
  lineGeo.setAttribute('position', new THREE.BufferAttribute(linePositions, 3))
  lineGeo.setAttribute('color', new THREE.BufferAttribute(lineColors, 3))
  const lineMat = new THREE.LineBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: LINE_OPACITY,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  })
  motif.add(new THREE.LineSegments(lineGeo, lineMat))
  let linkTimer = LINK_REFRESH_S // recompute on the first update

  function refreshLinks(): void {
    // Nearest pair for each sampled point; take the first LINK_COUNT pairs.
    let seg = 0
    for (let s = 0; s < sampleIdx.length && seg < LINK_COUNT; s++) {
      const i = sampleIdx[s]!
      const ix = positions[i * 3]!
      const iy = positions[i * 3 + 1]!
      const iz = positions[i * 3 + 2]!
      let best = -1
      let bestD = Infinity
      for (let t = 0; t < sampleIdx.length; t++) {
        if (t === s) continue
        const j = sampleIdx[t]!
        const dx = positions[j * 3]! - ix
        const dy = positions[j * 3 + 1]! - iy
        const dz = positions[j * 3 + 2]! - iz
        const d = dx * dx + dy * dy + dz * dz
        if (d < bestD) {
          bestD = d
          best = j
        }
      }
      if (best < 0) continue
      const o = seg * 6
      linePositions[o] = ix
      linePositions[o + 1] = iy
      linePositions[o + 2] = iz
      linePositions[o + 3] = positions[best * 3]!
      linePositions[o + 4] = positions[best * 3 + 1]!
      linePositions[o + 5] = positions[best * 3 + 2]!
      // Blue↔white mix: alternate segment tint.
      const c = seg % 2 === 0 ? blue : white
      for (const end of [0, 3]) {
        lineColors[o + end] = c.r
        lineColors[o + end + 1] = c.g
        lineColors[o + end + 2] = c.b
      }
      seg++
    }
    // Collapse any unused tail segments to zero-length at the origin.
    for (let k = seg * 6; k < linePositions.length; k++) linePositions[k] = 0
    ;(lineGeo.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true
    ;(lineGeo.getAttribute('color') as THREE.BufferAttribute).needsUpdate = true
  }

  return {
    group: base.group,
    core: base.core,
    update(dt, elapsed, focus) {
      updateBase(base, dt, elapsed, focus)

      // Cycle attractor targets every ATTRACTOR_CYCLE_S; ease loci toward them.
      cycleTimer += dt
      if (cycleTimer >= ATTRACTOR_CYCLE_S) {
        cycleTimer = 0
        for (const target of attractorTargets) randomLocus(target)
      }
      const ease = Math.min(1, dt * 0.6)
      for (let a = 0; a < ATTRACTOR_COUNT; a++) attractors[a]!.lerp(attractorTargets[a]!, ease)

      // Drift every point toward its attractor + a touch of sine wander.
      const pull = Math.min(1, DRIFT_LAMBDA * dt)
      const attr = pointGeo.getAttribute('position') as THREE.BufferAttribute
      for (let i = 0; i < count; i++) {
        const a = attractors[assignment[i]!]!
        const o = i * 3
        const px = positions[o]!
        const py = positions[o + 1]!
        const pz = positions[o + 2]!
        positions[o] = px + (a.x - px) * pull + Math.sin(elapsed * 0.8 + seed[i]!) * JITTER * dt
        positions[o + 1] = py + (a.y - py) * pull + Math.sin(elapsed * 0.7 + seed[i]! * 2) * JITTER * dt
        positions[o + 2] = pz + (a.z - pz) * pull + Math.cos(elapsed * 0.9 + seed[i]!) * JITTER * dt
      }
      attr.needsUpdate = true

      // Refresh the constellation web twice a second.
      linkTimer += dt
      if (linkTimer >= LINK_REFRESH_S) {
        linkTimer = 0
        refreshLinks()
      }

      motif.scale.setScalar(focusScale(focus))
      pointMat.opacity = POINT_OPACITY * (1 + focus * 0.15)
      lineMat.opacity = LINE_OPACITY * (1 + focus * 0.8)
    },
  }
}
