import * as THREE from 'three'
import { TIERS, type Tier } from '../core/quality'
import { PATH_POINTS } from '../nav/cameraRig'

/**
 * Environment — the void: gradient sky, drifting dust field, and the
 * volumetric arrival light cone over the hero/logo zone. Owns nothing that
 * needs the renderer/WebGL context; every child is plain geometry + a
 * `MeshBasicMaterial`/`PointsMaterial`, so this constructs cleanly in a
 * headless (node) test environment.
 */

// --- (a) gradient sky sphere ----------------------------------------------
const SKY_RADIUS = 100
const SKY_TOP = '#0B1226'
const SKY_BOTTOM = '#070B14'

function createSky(): THREE.Mesh {
  const geometry = new THREE.SphereGeometry(SKY_RADIUS, 32, 32)
  const top = new THREE.Color(SKY_TOP)
  const bottom = new THREE.Color(SKY_BOTTOM)

  const position = geometry.getAttribute('position')
  const colors = new Float32Array(position.count * 3)
  const color = new THREE.Color()
  for (let i = 0; i < position.count; i++) {
    const y = position.getY(i)
    const t = (y + SKY_RADIUS) / (2 * SKY_RADIUS) // -radius..+radius -> 0..1
    color.copy(bottom).lerp(top, t)
    colors[i * 3] = color.r
    colors[i * 3 + 1] = color.g
    colors[i * 3 + 2] = color.b
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))

  // `fog: false` — the sphere sits at radius 100, past the scene fog's `far`
  // (55), so left at the material default (`fog: true`) every fragment would
  // render at 100% fog colour, flattening the gradient into a solid tone.
  // The backdrop itself stays a clean, always-visible gradient; the dust and
  // cone (fog left on, the default) are what visibly fade with distance.
  const material = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false })
  return new THREE.Mesh(geometry, material)
}

// --- (b) dust field ---------------------------------------------------------
const DUST_BASE_COUNT = 1400
const DUST_TUBE_RADIUS = 14
const DUST_SIZE = 0.045
const DUST_OPACITY = 0.5
const DUST_BLUE_HEX = '#3A63C8'
// Every 5th point is brand blue (exactly 20%), the rest white — a deterministic
// pattern rather than a per-rebuild random draw, so the ratio never drifts.
const DUST_BLUE_STRIDE = 5
// Slow, decorrelated per-axis sine drift. Frequencies are irrational-ish
// relative to each other so the field never visibly "breathes" in sync; each
// axis's phase is keyed off a *different* axis of the point's own base
// position, so neighbouring points drift out of step without needing a
// second stored phase buffer.
const DUST_DRIFT_AMPLITUDE = 0.55
const DUST_DRIFT_FREQ_X = 0.17
const DUST_DRIFT_FREQ_Y = 0.13
const DUST_DRIFT_FREQ_Z = 0.11
// Keep dust out of a small sphere around the path start (where the camera
// begins): points that spawn right on top of the lens render as huge, in-focus
// blobs that dominate the frame. Excluding them keeps the field reading as a
// distant haze of fine motes.
const DUST_MIN_START_DIST = 2

const UP = new THREE.Vector3(0, 1, 0)
const WORLD_X = new THREE.Vector3(1, 0, 0)

/**
 * A small round radial-gradient sprite so each point renders as a soft mote
 * rather than the hard square a bare `PointsMaterial` draws. Guarded for the
 * headless (node) test environment, where there is no `document`/canvas — the
 * field still constructs there, just without the map (never rendered in tests).
 */
function createDustTexture(): THREE.Texture | null {
  if (typeof document === 'undefined') return null
  const size = 64
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  g.addColorStop(0, 'rgba(255,255,255,1)')
  g.addColorStop(0.5, 'rgba(255,255,255,0.35)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

interface DustField {
  points: THREE.Points
  geometry: THREE.BufferGeometry
  base: Float32Array
}

/** Builds a fresh dust field sized for `tier`. Positions are scattered
 *  randomly through a tube of radius `DUST_TUBE_RADIUS` around the whole
 *  travel path, in a frame built from the path's own tangent so the tube
 *  follows the S-curve rather than a fixed world axis. */
function createDust(tier: Tier): DustField {
  const count = Math.round(DUST_BASE_COUNT * TIERS[tier].particleScale)
  const curve = new THREE.CatmullRomCurve3(PATH_POINTS)

  const base = new Float32Array(count * 3)
  const colors = new Float32Array(count * 3)
  const white = new THREE.Color('#ffffff')
  const blue = new THREE.Color(DUST_BLUE_HEX)
  const start = curve.getPointAt(0)

  for (let i = 0; i < count; i++) {
    // Rejection-sample a spot in the tube, retrying until it clears the small
    // exclusion sphere around the path start (bounded so it can never spin).
    let point = new THREE.Vector3()
    for (let attempt = 0; attempt < 8; attempt++) {
      const t = Math.random()
      const centre = curve.getPointAt(t)
      const tangent = curve.getTangentAt(t)

      let right = new THREE.Vector3().crossVectors(tangent, UP)
      if (right.lengthSq() < 1e-8) right = new THREE.Vector3().crossVectors(tangent, WORLD_X)
      right.normalize()
      const upv = new THREE.Vector3().crossVectors(right, tangent).normalize()

      const r = DUST_TUBE_RADIUS * Math.sqrt(Math.random()) // sqrt for a uniform disk, not a centre-heavy one
      const theta = Math.random() * Math.PI * 2
      point = centre.addScaledVector(right, r * Math.cos(theta)).addScaledVector(upv, r * Math.sin(theta))
      if (point.distanceTo(start) >= DUST_MIN_START_DIST) break
    }

    base[i * 3] = point.x
    base[i * 3 + 1] = point.y
    base[i * 3 + 2] = point.z

    const c = i % DUST_BLUE_STRIDE === 0 ? blue : white
    colors[i * 3] = c.r
    colors[i * 3 + 1] = c.g
    colors[i * 3 + 2] = c.b
  }

  const geometry = new THREE.BufferGeometry()
  // The live position attribute starts as a copy of `base`; `base` itself is
  // kept untouched so per-frame drift is always computed from the rest pose,
  // never compounded onto the previous frame's offset.
  geometry.setAttribute('position', new THREE.BufferAttribute(base.slice(), 3))
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))

  const material = new THREE.PointsMaterial({
    size: DUST_SIZE,
    map: createDustTexture(),
    vertexColors: true,
    transparent: true,
    opacity: DUST_OPACITY,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    sizeAttenuation: true,
  })

  return { points: new THREE.Points(geometry, material), geometry, base }
}

// --- (c) arrival light cone --------------------------------------------------
const CONE_HEIGHT = 14
const CONE_TOP_RADIUS = 0.4
const CONE_BOTTOM_RADIUS = 5.5
// The cone's wide bottom (radius 5.5) fills the whole frame at the mark's depth,
// and it's drawn DoubleSide × two nested cones — so every screen ray crosses ~4
// additive-white surfaces. At the old 0.07/0.1 that accumulated into a flat grey
// wash that lifted the corners off the near-black navy void. Kept very low so the
// void stays dark and the cone reads only as a faint shaft brightening over the
// mark (subtle > showy, per the presskit's single soft light shaft).
const CONE_OUTER_OPACITY = 0.035
const CONE_INNER_OPACITY = 0.05
// The inner cone is a tighter, brighter core nested inside the soft outer
// wash — the brief pins the outer cone's radii exactly but only the inner
// cone's opacity, so this scale is a deliberate "faked volumetric" choice.
const CONE_INNER_SCALE = 0.55
// Path start (PATH_POINTS[0]) is the origin; the hero/logo sits just off it
// at ~(0, 0.2, -2). The cone's tip (its narrow, radiusTop end) sits at
// world y ≈ 8, so the shaft flares down and over the hero zone.
const CONE_TIP_Y = 8
const CONE_X = 0
const CONE_Z = -2
const CONE_ROTATION_SPEED = 0.05 // rad/s — "slowly rotates"

function createConeMesh(radialScale: number, opacity: number): THREE.Mesh {
  const geometry = new THREE.CylinderGeometry(
    CONE_TOP_RADIUS * radialScale,
    CONE_BOTTOM_RADIUS * radialScale,
    CONE_HEIGHT,
    32,
    1,
    true, // openEnded
  )
  const material = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  })
  return new THREE.Mesh(geometry, material)
}

function createArrivalCone(): THREE.Group {
  const group = new THREE.Group()
  group.add(createConeMesh(1, CONE_OUTER_OPACITY), createConeMesh(CONE_INNER_SCALE, CONE_INNER_OPACITY))
  // CylinderGeometry is centred at its local origin with the radiusTop end at
  // +height/2: placing that local point at world y=CONE_TIP_Y means the
  // group itself sits at CONE_TIP_Y - height/2.
  group.position.set(CONE_X, CONE_TIP_Y - CONE_HEIGHT / 2, CONE_Z)
  return group
}

// --- Environment -------------------------------------------------------------

export class Environment {
  readonly group: THREE.Group

  private readonly sky: THREE.Mesh
  private readonly coneGroup: THREE.Group
  private dust!: THREE.Points
  private dustGeometry!: THREE.BufferGeometry
  private dustBase!: Float32Array

  constructor(tier: Tier) {
    this.group = new THREE.Group()

    this.sky = createSky()
    this.group.add(this.sky)

    this.rebuildDust(tier)

    this.coneGroup = createArrivalCone()
    this.group.add(this.coneGroup)
  }

  /** Rebuilds the dust field's particle count for `tier`, disposing the old
   *  geometry/material so repeated tier changes don't leak GPU buffers. */
  applyTier(tier: Tier): void {
    this.rebuildDust(tier)
  }

  private rebuildDust(tier: Tier): void {
    const next = createDust(tier)

    if (this.dust) {
      this.group.remove(this.dust)
      this.dustGeometry.dispose()
      const material = this.dust.material
      if (Array.isArray(material)) material.forEach((m) => m.dispose())
      else material.dispose()
    }

    this.dust = next.points
    this.dustGeometry = next.geometry
    this.dustBase = next.base
    this.group.add(this.dust)
  }

  /** Per-frame: drift the dust, slowly rotate the arrival cone, and recentre
   *  the sky sphere's Z on the camera so the void keeps enveloping it however
   *  far it has travelled down the path (the sphere's colour depends only on
   *  local vertex Y, so a Z-only translation never disturbs the gradient). */
  update(dt: number, elapsed: number, cameraZ: number): void {
    this.sky.position.z = cameraZ
    this.driftDust(elapsed)
    this.coneGroup.rotation.y += dt * CONE_ROTATION_SPEED
  }

  private driftDust(elapsed: number): void {
    const attr = this.dustGeometry.getAttribute('position') as THREE.BufferAttribute
    const arr = attr.array as Float32Array
    const base = this.dustBase

    for (let i = 0; i < attr.count; i++) {
      const bx = base[i * 3]!
      const by = base[i * 3 + 1]!
      const bz = base[i * 3 + 2]!
      arr[i * 3] = bx + Math.sin(elapsed * DUST_DRIFT_FREQ_X + by) * DUST_DRIFT_AMPLITUDE
      arr[i * 3 + 1] = by + Math.sin(elapsed * DUST_DRIFT_FREQ_Y + bz) * DUST_DRIFT_AMPLITUDE
      arr[i * 3 + 2] = bz + Math.sin(elapsed * DUST_DRIFT_FREQ_Z + bx) * DUST_DRIFT_AMPLITUDE
    }
    attr.needsUpdate = true
  }
}
