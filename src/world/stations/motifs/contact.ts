import * as THREE from 'three'
import type { MotifBuilder } from '../station'
import { BLUE, WHITE, buildStationBase, updateBase, focusScale, createSoftCircleTexture } from './common'

/**
 * contact — the Make With Us motif: a signal beacon at the end of the path.
 * A bright white light burns at the heart of the chrome core (it pokes through
 * the icosahedron's facets, so the metal reads as lit from within), wrapped in
 * a slowly-breathing geodesic wireframe cage, while a ring of 80 motes
 * converges and diverges around it — a transmission, inviting an answer.
 */

const BEACON_RADIUS = 0.3
const BEACON_EMISSIVE = 2.4

const CAGE_RADIUS = 1.6
const CAGE_DETAIL = 0 // the pure 20-face icosahedron: bold, sparse lines, not a web
const CAGE_OPACITY = 0.35
const BREATH_AMPLITUDE = 0.06
const BREATH_SPEED = 0.8
const CAGE_TURN = 0.12 // slow yaw (rad/s, elapsed-driven)

const RING_COUNT = 80
const RING_MID = 1.15
const RING_AMPLITUDE = 0.55 // converge/diverge sweep: r 0.6 .. 1.7
const RING_CONVERGE_SPEED = 0.5
const RING_TURN = 0.18 // slow revolution of the whole ring (rad/s)
const RING_PHASE_STEP = 0.12 // per-point phase -> the pulse spirals, not snaps
const POINT_SIZE = 0.07
const POINT_OPACITY = 0.85
const BLUE_STRIDE = 3 // every 3rd mote brand blue, rest white

export const contact: MotifBuilder = (def, _tier) => {
  const base = buildStationBase(def)
  const motif = new THREE.Group()
  base.group.add(motif)

  // --- beacon heart -----------------------------------------------------------
  const beaconMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(WHITE),
    emissive: new THREE.Color(WHITE),
    emissiveIntensity: BEACON_EMISSIVE,
    roughness: 0.4,
    metalness: 0,
  })
  motif.add(new THREE.Mesh(new THREE.SphereGeometry(BEACON_RADIUS, 32, 32), beaconMat))

  // --- breathing cage -----------------------------------------------------------
  const cageMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(BLUE),
    wireframe: true,
    transparent: true,
    opacity: CAGE_OPACITY,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  })
  const cage = new THREE.Mesh(new THREE.IcosahedronGeometry(CAGE_RADIUS, CAGE_DETAIL), cageMat)
  motif.add(cage)

  // --- converging/diverging mote ring -------------------------------------------
  const positions = new Float32Array(RING_COUNT * 3)
  const colors = new Float32Array(RING_COUNT * 3)
  const white = new THREE.Color(WHITE)
  const blue = new THREE.Color(BLUE)
  for (let i = 0; i < RING_COUNT; i++) {
    const c = i % BLUE_STRIDE === 0 ? blue : white
    colors[i * 3] = c.r
    colors[i * 3 + 1] = c.g
    colors[i * 3 + 2] = c.b
  }
  const ringGeo = new THREE.BufferGeometry()
  ringGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  ringGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  const ringMatPoints = new THREE.PointsMaterial({
    size: POINT_SIZE,
    map: createSoftCircleTexture(),
    vertexColors: true,
    transparent: true,
    opacity: POINT_OPACITY,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    sizeAttenuation: true,
  })
  motif.add(new THREE.Points(ringGeo, ringMatPoints))

  function layoutRing(elapsed: number): void {
    for (let i = 0; i < RING_COUNT; i++) {
      const angle = (i / RING_COUNT) * Math.PI * 2 + elapsed * RING_TURN
      const r =
        RING_MID + RING_AMPLITUDE * Math.sin(elapsed * RING_CONVERGE_SPEED + i * RING_PHASE_STEP)
      positions[i * 3] = Math.cos(angle) * r
      positions[i * 3 + 1] = Math.sin(angle) * r
      positions[i * 3 + 2] = 0
    }
    ;(ringGeo.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true
  }
  layoutRing(0)

  return {
    group: base.group,
    core: base.core,
    update(dt, elapsed, focus) {
      updateBase(base, dt, elapsed, focus)
      // Everything here is elapsed-driven, so the beacon breathes at the same
      // tempo no matter the frame rate (and stays testable with dt = 0).
      cage.scale.setScalar(1 + BREATH_AMPLITUDE * Math.sin(elapsed * BREATH_SPEED))
      cage.rotation.y = elapsed * CAGE_TURN
      layoutRing(elapsed)
      beaconMat.emissiveIntensity =
        BEACON_EMISSIVE * (1 + 0.12 * Math.sin(elapsed * 1.1)) + focus * 0.8
      motif.scale.setScalar(focusScale(focus))
      cageMat.opacity = CAGE_OPACITY * (1 + focus * 0.8)
      ringMatPoints.opacity = POINT_OPACITY * (1 + focus * 0.15)
    },
  }
}
