import * as THREE from 'three'
import { SVGLoader } from 'three/examples/jsm/loaders/SVGLoader.js'

/**
 * LogoHero — the site's signature brand moment: the traced "S-lightbulb" mark
 * (src/assets/logo-mark.svg) extruded into a solid chrome slab, gleaming under
 * the arrival light shaft on the dark-navy void. Echoes the presskit hero
 * (public/og.jpg): the S-swoosh curls top→bulb, filament waves fan the lower
 * bulb, and a soft brand-blue glow breathes behind it.
 */

// --- shape parsing ----------------------------------------------------------

// A traced silhouette occasionally carries a full-canvas background rectangle.
// We treat a shape as a background plate ONLY when it is BOTH huge (its bbox
// spans most of the viewBox) AND essentially solid (its fill nearly fills that
// bbox — i.e. it's a rectangle). The real mark's largest piece, the S-swoosh,
// spans ~0.9 of the (tightened) viewBox but is a thin curve (fill/bbox ≈ 0.18),
// so it is kept; a genuine background rect (fill/bbox ≈ 1) is dropped. Using
// only the ">60% of viewBox" test would wrongly delete the S itself.
const BACKGROUND_MIN_VIEWBOX_FRACTION = 0.6
const BACKGROUND_MIN_FILL_RATIO = 0.9
const SHAPE_SAMPLES = 48

function viewBoxArea(root: Element, shapes: THREE.Shape[]): number {
  const vb = root.getAttribute('viewBox')
  if (vb) {
    const [, , w, h] = vb.split(/[\s,]+/).map(Number)
    if (w && h && Number.isFinite(w) && Number.isFinite(h)) return w * h
  }
  // No viewBox → fall back to the union bbox of all shapes. The dual filter's
  // fill-ratio clause still protects a non-rectangular mark from being culled.
  const box = new THREE.Box2()
  for (const s of shapes) for (const p of s.getPoints(SHAPE_SAMPLES)) box.expandByPoint(p)
  const size = new THREE.Vector2()
  box.getSize(size)
  return size.x * size.y || 1
}

function isBackgroundPlate(shape: THREE.Shape, refArea: number): boolean {
  const pts = shape.getPoints(SHAPE_SAMPLES)
  const box = new THREE.Box2()
  for (const p of pts) box.expandByPoint(p)
  const size = new THREE.Vector2()
  box.getSize(size)
  const bboxArea = size.x * size.y
  if (bboxArea <= 0) return true // degenerate: drop it
  const fraction = bboxArea / refArea
  const fillRatio = Math.abs(THREE.ShapeUtils.area(pts)) / bboxArea
  return fraction > BACKGROUND_MIN_VIEWBOX_FRACTION && fillRatio > BACKGROUND_MIN_FILL_RATIO
}

/**
 * Parse the traced SVG into extrudable shapes: `SVGLoader.parse` → each path's
 * `toShapes()` (three ≥0.164 auto-detects winding, so any holes are honoured) →
 * drop background plates. Requires a DOMParser (browser, or jsdom in tests).
 */
export function parseLogoShapes(svgText: string): THREE.Shape[] {
  const data = new SVGLoader().parse(svgText)
  const shapesUnfiltered: THREE.Shape[] = []
  for (const path of data.paths) shapesUnfiltered.push(...path.toShapes())
  // Runtime `data.xml` is the parsed <svg> root element (@types/three types it
  // loosely as XMLDocument); read its viewBox for the plate-size reference.
  const refArea = viewBoxArea(data.xml as unknown as Element, shapesUnfiltered)
  const kept = shapesUnfiltered.filter((s) => !isBackgroundPlate(s, refArea))
  if (kept.length === 0) throw new Error('parseLogoShapes: no mark shapes found in SVG — check the trace')
  return kept
}

// --- the chrome mark --------------------------------------------------------

const MARK_HEIGHT = 1.0 // world units, tip-to-tail
const MARK_POSITION = new THREE.Vector3(0, 0.15, -2) // at the path start, under the cone; Y=0.15 chosen visually (adjudicated)
const EXTRUDE_DEPTH = 0.28
const BEVEL = 0.02

const MARK_COLOR = '#e8eaee'
const MARK_METALNESS = 1
const MARK_ROUGHNESS = 0.18
const MARK_ENV_INTENSITY = 0.7

// Slow yaw sway, ±6°.
const SWAY_DEG = 6
const SWAY_RAD = (SWAY_DEG * Math.PI) / 180
const SWAY_SPEED = 0.35 // rad/s of the driving sine

// Brand-blue glow behind the bulb's lower third.
const GLOW_BLUE = '#3A63C8'
const GLOW_RADIUS = 0.95 // half-size of the glow plane
const GLOW_OFFSET = new THREE.Vector3(-0.05, -0.42, -0.18) // behind the bulb's lower third
const GLOW_OPACITY_MIN = 0.25
const GLOW_OPACITY_MAX = 0.5
const GLOW_PULSE_SPEED = 0.9 // rad/s

/** Union bbox of all shapes in the 2D SVG plane, before extrusion. */
function shapes2DBounds(shapes: THREE.Shape[]): THREE.Box2 {
  const box = new THREE.Box2()
  for (const s of shapes) for (const p of s.getPoints(SHAPE_SAMPLES)) box.expandByPoint(p)
  return box
}

/**
 * A soft radial sprite texture for the additive glow. The alpha falls all the
 * way to zero by ~55% of the plane radius (and 0 at the edge), so the glow is a
 * contained halo hugging the bulb rather than a full-frame wash. The material's
 * `color` (brand blue) tints this white gradient, so the additive contribution
 * reads unmistakably blue against the dark navy void. Guarded for the headless
 * (node) test environment, where there is no `document`/canvas — the hero still
 * constructs there, just without the glow texture.
 */
function createGlowTexture(): THREE.Texture | null {
  if (typeof document === 'undefined') return null
  const size = 256
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  g.addColorStop(0, 'rgba(255,255,255,1)')
  g.addColorStop(0.25, 'rgba(255,255,255,0.45)')
  g.addColorStop(0.55, 'rgba(255,255,255,0.1)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

export class LogoHero {
  readonly group: THREE.Group
  private readonly material: THREE.MeshStandardMaterial
  private readonly glowMaterial: THREE.MeshBasicMaterial

  constructor(svgText: string) {
    const shapes = parseLogoShapes(svgText)

    // Size the extrusion so depth/bevel (0.28 / 0.02) are meaningful against a
    // ~3.2-unit-tall mark: pick the world scale from the shapes' 2D height, then
    // extrude with depth/bevel pre-divided by that scale so they land on target
    // once the geometry is scaled down.
    const bounds = shapes2DBounds(shapes)
    const size = new THREE.Vector2()
    const center = new THREE.Vector2()
    bounds.getSize(size)
    bounds.getCenter(center)
    const scale = MARK_HEIGHT / size.y

    const geometry = new THREE.ExtrudeGeometry(shapes, {
      depth: EXTRUDE_DEPTH / scale,
      bevelEnabled: true,
      bevelThickness: BEVEL / scale,
      bevelSize: BEVEL / scale,
      bevelSegments: 2,
      curveSegments: 24,
    })
    geometry.translate(-center.x, -center.y, 0)
    geometry.scale(scale, scale, scale)
    // Straddle z=0 so the slab is centred front-to-back.
    geometry.computeBoundingBox()
    const bb = geometry.boundingBox!
    geometry.translate(0, 0, -(bb.min.z + bb.max.z) / 2)

    this.material = new THREE.MeshStandardMaterial({
      color: new THREE.Color(MARK_COLOR),
      metalness: MARK_METALNESS,
      roughness: MARK_ROUGHNESS,
      envMapIntensity: MARK_ENV_INTENSITY,
    })

    const mesh = new THREE.Mesh(geometry, this.material)
    // SVG's y-axis points DOWN — flip it at the object level so the mark reads
    // right-side-up (S-curl at top, bulb below). Reflecting via object scale (not
    // baked into the geometry) lets the renderer flip face winding for the
    // negative determinant, keeping the lit front face toward the camera.
    mesh.scale.y = -1

    // Blue glow: additive plane behind the bulb, pulsing opacity. Rendered in
    // the transparent pass with depthTest false, so it draws over/around the mark.
    this.glowMaterial = new THREE.MeshBasicMaterial({
      map: createGlowTexture(),
      color: new THREE.Color(GLOW_BLUE),
      transparent: true,
      opacity: GLOW_OPACITY_MIN,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false,
      side: THREE.DoubleSide,
      fog: false,
    })
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(GLOW_RADIUS * 2, GLOW_RADIUS * 2), this.glowMaterial)
    glow.position.copy(GLOW_OFFSET)

    this.group = new THREE.Group()
    this.group.add(mesh, glow)
    this.group.position.copy(MARK_POSITION)
  }

  /** Feed the PMREM environment map so the metal actually reflects something —
   *  without it, `metalness: 1` renders pure black. */
  setEnvMap(tex: THREE.Texture): void {
    this.material.envMap = tex
    this.material.needsUpdate = true
  }

  update(_dt: number, elapsed: number): void {
    this.group.rotation.y = SWAY_RAD * Math.sin(elapsed * SWAY_SPEED)
    const pulse = (Math.sin(elapsed * GLOW_PULSE_SPEED) + 1) / 2 // 0..1
    this.glowMaterial.opacity = GLOW_OPACITY_MIN + (GLOW_OPACITY_MAX - GLOW_OPACITY_MIN) * pulse
  }
}
