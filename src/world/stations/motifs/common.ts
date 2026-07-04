import * as THREE from 'three'
import type { StationDef } from '../../../content/content'

/**
 * Shared station scaffolding — the parts every station wears regardless of its
 * motif: a chrome-ish icosahedron *core* (the raycast tap target), a soft brand
 * point light, and a faint base ring. Motif modules build this first, drop their
 * own line/point geometry into the returned group, and call `updateBase` each
 * frame so the core spin + focus response (emissive / light / ring) stays in one
 * place instead of being copy-pasted three times.
 */

export const BLUE = '#3A63C8'
export const WHITE = '#ffffff'

const CORE_RADIUS = 0.35
const CORE_EMISSIVE_BASE = 0.25
const CORE_EMISSIVE_FOCUS = 0.25 // added at focus 1 -> 0.25..0.5 (more washes the metal flat)
const CORE_SPIN_Y = 0.3
const CORE_SPIN_X = 0.12

const LIGHT_INTENSITY = 6
const LIGHT_DISTANCE = 9
const LIGHT_FOCUS_GAIN = 4 // added at focus 1 -> 6..10

const RING_INNER = 2.5
const RING_OUTER = 2.62
const RING_OPACITY = 0.14
const RING_FOCUS_GAIN = 1.6 // multiplies opacity toward this at focus 1

export interface StationBase {
  group: THREE.Group
  core: THREE.Mesh
  coreMat: THREE.MeshStandardMaterial
  light: THREE.PointLight
  ringMat: THREE.MeshBasicMaterial
}

/**
 * A soft round sprite so points/satellites read as glowing motes, not hard
 * squares. Guarded for the headless (node) test environment — returns null
 * there, and the material simply renders without a map (never displayed).
 */
export function createSoftCircleTexture(): THREE.Texture | null {
  if (typeof document === 'undefined') return null
  const size = 64
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  g.addColorStop(0, 'rgba(255,255,255,1)')
  g.addColorStop(0.4, 'rgba(255,255,255,0.5)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

export function buildStationBase(def: StationDef): StationBase {
  const group = new THREE.Group()

  const coreMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#dfe4ee'),
    metalness: 0.9,
    roughness: 0.25,
    emissive: new THREE.Color(BLUE),
    emissiveIntensity: CORE_EMISSIVE_BASE,
  })
  const core = new THREE.Mesh(new THREE.IcosahedronGeometry(CORE_RADIUS, 0), coreMat)
  core.userData.stationId = def.id
  group.add(core)

  // Offset up/front/right (station groups face the path along local +Z) so the
  // core shows lit-vs-dark facets — at the origin the light would sit *inside*
  // the core mesh and shade none of it.
  const light = new THREE.PointLight(new THREE.Color(BLUE), LIGHT_INTENSITY, LIGHT_DISTANCE)
  light.position.set(1.4, 1.8, 1.6)
  group.add(light)

  // Faint base ring: a flat blue hairline halo the motif floats above.
  const ringMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(BLUE),
    transparent: true,
    opacity: RING_OPACITY,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  })
  const ring = new THREE.Mesh(new THREE.RingGeometry(RING_INNER, RING_OUTER, 96), ringMat)
  ring.rotation.x = -Math.PI / 2
  group.add(ring)

  return { group, core, coreMat, light, ringMat }
}

/** Per-frame core spin + focus-driven brightening, shared by every motif. */
export function updateBase(base: StationBase, dt: number, _elapsed: number, focus: number): void {
  base.core.rotation.y += dt * CORE_SPIN_Y
  base.core.rotation.x += dt * CORE_SPIN_X
  base.coreMat.emissiveIntensity = CORE_EMISSIVE_BASE + focus * CORE_EMISSIVE_FOCUS
  base.light.intensity = LIGHT_INTENSITY + focus * LIGHT_FOCUS_GAIN
  base.ringMat.opacity = RING_OPACITY * (1 + focus * RING_FOCUS_GAIN)
}

/** Common focus scale: motifs breathe from 1 -> 1.06 as they gain focus. */
export function focusScale(focus: number): number {
  return 1 + focus * 0.06
}
