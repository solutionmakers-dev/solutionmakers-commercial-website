import * as THREE from 'three'
import type { Station } from './stations/station'
import { PATH_POINTS } from '../nav/cameraRig'

/**
 * Constellation — the map layer. From the `toMap` overview pose the whole
 * S-curve reads as a constellation: a glowing node per station anchor, a faint
 * additive line tracing the travel spline between them, and an uppercase title
 * label beside each node. Hidden except in map mode; Task 14's pinch gesture
 * fades it in/out via `setVisible` and taps warp via `nodeAt`.
 *
 * Every material here sets `fog: false`: the map camera sits ~76+ units from
 * the nodes while the scene fog fully saturates at 55 — with fog left on, the
 * entire layer would silently fade to background from exactly the one pose it
 * exists for.
 *
 * All canvas-texture creation is guarded for the headless (node) test
 * environment the same way as `createDustTexture` in environment.ts: no
 * `document` → no texture (glow sprites keep a null map, label sprites are
 * skipped entirely) and construction still succeeds.
 */

// --- nodes ------------------------------------------------------------------
const HIT_RADIUS = 1.2 // enlarged invisible tap target around each node
const GLOW_SCALE = 5.2 // world size of a node's glow sprite (readable from ~80u)
const GLOW_OPACITY = 0.95
const GLOW_PULSE_AMPLITUDE = 0.05
const GLOW_PULSE_SPEED = 1.4 // rad/s
const POINT_SIZE = 1.1 // the white-hot core point at each anchor
const POINT_OPACITY = 0.9

// --- spline link --------------------------------------------------------------
const LINK_SAMPLES = 120
const LINK_OPACITY = 0.25

// --- current-station ring -----------------------------------------------------
const RING_INNER = 2.0
const RING_OUTER = 2.18
const RING_OPACITY = 0.85
const RING_PULSE_AMPLITUDE = 0.07
const RING_PULSE_SPEED = 2.1 // rad/s

// --- labels -------------------------------------------------------------------
const LABEL_FONT_PX = 64
const LABEL_LETTER_SPACING_PX = 14 // wide letterspacing — the "u-label" style
const LABEL_PAD_PX = 24
const LABEL_CANVAS_H = 96
const LABEL_OPACITY = 0.6 // subtle: ~white 60%
const LABEL_WORLD_H = 1.8 // sprite height in world units (sized for map pose)
// World +z reads as screen-down from the map pose (camera above and behind,
// looking down the path) — this hangs each label just below its node, centred,
// so labels never widen the constellation's footprint on narrow screens.
const LABEL_BELOW_OFFSET = new THREE.Vector3(0, -0.4, 3.0)

// The map layer overlays the world: station cores sit exactly at the node
// anchors and would otherwise depth-occlude the additive glows into black
// dots. Everything here skips the depth test and draws after the scene.
const RENDER_ORDER_BASE = 90

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v
}

/**
 * Radial glow for a node: white-hot centre falling through brand blue to
 * transparent. Guarded for node env (no `document`) — returns null there.
 */
function createNodeGlowTexture(): THREE.Texture | null {
  if (typeof document === 'undefined') return null
  const size = 128
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  g.addColorStop(0, 'rgba(255,255,255,1)')
  g.addColorStop(0.18, 'rgba(226,234,255,0.9)')
  g.addColorStop(0.35, 'rgba(58,99,200,0.55)')
  g.addColorStop(0.7, 'rgba(58,99,200,0.12)')
  g.addColorStop(1, 'rgba(58,99,200,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

/** Soft round core for the shared Points — same guard as the glow. */
function createCoreTexture(): THREE.Texture | null {
  if (typeof document === 'undefined') return null
  const size = 64
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  g.addColorStop(0, 'rgba(255,255,255,1)')
  g.addColorStop(0.4, 'rgba(255,255,255,0.6)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

/**
 * Bakes one uppercase, letterspaced title into a canvas texture (the site's
 * "u-label" style). Space Grotesk may not be reachable from a canvas context,
 * so the stack falls back to a generic sans; the wide tracking carries the
 * look either way. Characters are drawn one-by-one so the letterspacing does
 * not depend on `ctx.letterSpacing` support. Returns null in node env.
 */
function createLabelTexture(title: string): { tex: THREE.Texture; aspect: number } | null {
  if (typeof document === 'undefined') return null
  const text = title.toUpperCase()
  const font = `500 ${LABEL_FONT_PX}px "Space Grotesk", ui-sans-serif, system-ui, sans-serif`

  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  ctx.font = font
  let width = 0
  for (const ch of text) width += ctx.measureText(ch).width + LABEL_LETTER_SPACING_PX
  width -= LABEL_LETTER_SPACING_PX // no trailing gap

  canvas.width = Math.max(2, Math.ceil(width) + LABEL_PAD_PX * 2)
  canvas.height = LABEL_CANVAS_H
  // Canvas state resets when the canvas is resized — set the font again.
  const c = canvas.getContext('2d')!
  c.font = font
  c.fillStyle = '#ffffff'
  c.textBaseline = 'middle'
  let x = LABEL_PAD_PX
  for (const ch of text) {
    c.fillText(ch, x, LABEL_CANVAS_H / 2)
    x += c.measureText(ch).width + LABEL_LETTER_SPACING_PX
  }

  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  return { tex, aspect: canvas.width / canvas.height }
}

/** A material whose opacity `setVisible` scales between 0 and its authored base. */
interface Fadeable {
  mat: THREE.Material & { opacity: number }
  base: number
}

interface Node {
  id: string
  glow: THREE.Sprite
  phase: number // decorrelates the per-node pulse
}

export class Constellation {
  /** Hidden except in map mode. */
  readonly group: THREE.Group

  private readonly hitSpheres: THREE.Mesh[] = []
  private readonly nodes: Node[] = []
  private readonly fadeables: Fadeable[] = []
  private readonly anchors: Map<string, THREE.Vector3>
  private readonly ring: THREE.Mesh

  constructor(stations: Station[], rigAnchors: Map<string, THREE.Vector3>) {
    this.group = new THREE.Group()
    this.group.visible = false
    this.anchors = rigAnchors

    const curve = new THREE.CatmullRomCurve3(PATH_POINTS)

    // --- spline link: one Line riding the exact travel path -----------------
    const linkGeometry = new THREE.BufferGeometry().setFromPoints(curve.getSpacedPoints(LINK_SAMPLES))
    const linkMaterial = new THREE.LineBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: LINK_OPACITY,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false,
      fog: false,
    })
    this.fadeables.push({ mat: linkMaterial, base: LINK_OPACITY })
    const link = new THREE.Line(linkGeometry, linkMaterial)
    link.renderOrder = RENDER_ORDER_BASE
    this.group.add(link)

    // --- current-station ring (driven by setCurrent; Task 14 calls it) ------
    const ringMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: RING_OPACITY,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false,
      side: THREE.DoubleSide,
      fog: false,
    })
    this.fadeables.push({ mat: ringMaterial, base: RING_OPACITY })
    this.ring = new THREE.Mesh(new THREE.RingGeometry(RING_INNER, RING_OUTER, 64), ringMaterial)
    this.ring.rotation.x = -Math.PI / 2 // horizontal — a halo under the node, read from above
    this.ring.renderOrder = RENDER_ORDER_BASE + 1
    this.ring.visible = false
    this.ring.userData.isCurrentRing = true
    this.group.add(this.ring)

    // --- per-station nodes ----------------------------------------------------
    const glowTexture = createNodeGlowTexture()
    const anchorPositions: number[] = []

    for (const station of stations) {
      const anchor = rigAnchors.get(station.def.id)
      if (!anchor) continue

      const nodeGroup = new THREE.Group()
      nodeGroup.position.copy(anchor)
      this.group.add(nodeGroup)

      // Enlarged invisible tap target. Raycast-only: `visible: false` on the
      // material skips rendering but not `Mesh.raycast`.
      const hit = new THREE.Mesh(
        new THREE.SphereGeometry(HIT_RADIUS, 12, 12),
        new THREE.MeshBasicMaterial({ visible: false }),
      )
      hit.userData.stationId = station.def.id
      nodeGroup.add(hit)
      this.hitSpheres.push(hit)

      // Glow sprite — blue halo with a white-hot heart.
      const glowMaterial = new THREE.SpriteMaterial({
        map: glowTexture,
        color: 0xffffff,
        transparent: true,
        opacity: GLOW_OPACITY,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        depthTest: false,
        fog: false,
      })
      this.fadeables.push({ mat: glowMaterial, base: GLOW_OPACITY })
      const glow = new THREE.Sprite(glowMaterial)
      glow.scale.setScalar(GLOW_SCALE)
      glow.renderOrder = RENDER_ORDER_BASE + 2
      nodeGroup.add(glow)

      this.nodes.push({ id: station.def.id, glow, phase: this.nodes.length * 1.7 })
      anchorPositions.push(anchor.x, anchor.y, anchor.z)

      // Title label — generated ONCE here at build; update() never re-creates.
      const label = createLabelTexture(station.def.title)
      if (label) {
        const labelMaterial = new THREE.SpriteMaterial({
          map: label.tex,
          transparent: true,
          opacity: LABEL_OPACITY,
          depthWrite: false,
          depthTest: false,
          fog: false,
        })
        this.fadeables.push({ mat: labelMaterial, base: LABEL_OPACITY })
        const sprite = new THREE.Sprite(labelMaterial)
        sprite.scale.set(LABEL_WORLD_H * label.aspect, LABEL_WORLD_H, 1)
        sprite.position.copy(LABEL_BELOW_OFFSET)
        sprite.renderOrder = RENDER_ORDER_BASE + 4
        nodeGroup.add(sprite)
      }
    }

    // Shared white-hot core: one Points object, a vertex per node.
    const coreGeometry = new THREE.BufferGeometry()
    coreGeometry.setAttribute('position', new THREE.Float32BufferAttribute(anchorPositions, 3))
    const coreMaterial = new THREE.PointsMaterial({
      size: POINT_SIZE,
      map: createCoreTexture(),
      color: 0xffffff,
      transparent: true,
      opacity: POINT_OPACITY,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false,
      sizeAttenuation: true,
      fog: false,
    })
    this.fadeables.push({ mat: coreMaterial, base: POINT_OPACITY })
    const cores = new THREE.Points(coreGeometry, coreMaterial)
    cores.renderOrder = RENDER_ORDER_BASE + 3
    this.group.add(cores)
  }

  /**
   * Show/hide the layer, optionally at a fade progress in [0,1] (drives all
   * node/link/label opacities). `setVisible(false, p)` mid-fade-out keeps the
   * group rendering at `p` until the fade lands; a bare `setVisible(false)`
   * hides it outright.
   */
  setVisible(v: boolean, progress01?: number): void {
    const p = clamp01(progress01 ?? (v ? 1 : 0))
    this.group.visible = v || p > 0
    for (const f of this.fadeables) f.mat.opacity = f.base * p
  }

  /** Ring the current station's node (Task 14 keeps this in sync). Unknown or
   *  null id → no ring. */
  setCurrent(id: string | null): void {
    const anchor = id !== null ? this.anchors.get(id) : undefined
    if (!anchor) {
      this.ring.visible = false
      return
    }
    this.ring.position.copy(anchor)
    this.ring.visible = true
  }

  /**
   * Which node a pointer ray hits, or null. Only the invisible hit spheres are
   * tested (never sprites — `Sprite.raycast` requires `raycaster.camera`), so
   * this works with any caller-built raycaster.
   */
  nodeAt(raycaster: THREE.Raycaster): string | null {
    // Raycaster ignores visible=false; hit-testing must be inert while hidden.
    if (!this.group.visible) return null
    // Tests (and pre-first-render taps) raycast before any render pass has
    // refreshed world matrices — bring them up to date first.
    this.group.updateMatrixWorld(true)
    const hits = raycaster.intersectObjects(this.hitSpheres, false)
    const first = hits[0]
    return first ? (first.object.userData.stationId as string) : null
  }

  /** Per-frame idle life: nodes breathe, the current ring pulses. Never
   *  creates or destroys children (labels are built once, in the constructor). */
  update(_dt: number, elapsed: number): void {
    for (const node of this.nodes) {
      const s = GLOW_SCALE * (1 + GLOW_PULSE_AMPLITUDE * Math.sin(elapsed * GLOW_PULSE_SPEED + node.phase))
      node.glow.scale.setScalar(s)
    }
    this.ring.scale.setScalar(1 + RING_PULSE_AMPLITUDE * Math.sin(elapsed * RING_PULSE_SPEED))
  }
}
