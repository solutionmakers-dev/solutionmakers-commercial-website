import * as THREE from 'three'
import { TIERS, detectInitialTier, type Tier } from './quality'

export interface Ctx {
  renderer: THREE.WebGLRenderer
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  canvas: HTMLCanvasElement
}

const FOV = 55
const NEAR = 0.1
const FAR = 120
const MAX_DPR = 2

/** Tracks each ctx's current tier so both the resize handler and applyDpr agree on it. */
const tierByCtx = new WeakMap<Ctx, Tier>()

function computeDpr(tier: Tier): number {
  return Math.min(window.devicePixelRatio, MAX_DPR) * TIERS[tier].dprScale
}

function layout(ctx: Ctx): void {
  const tier = tierByCtx.get(ctx) ?? detectInitialTier()
  const parent = ctx.canvas.parentElement ?? document.body
  const width = parent.clientWidth || window.innerWidth
  const height = parent.clientHeight || window.innerHeight

  ctx.renderer.setPixelRatio(computeDpr(tier))
  // updateStyle=false: CSS (#scene { width/height: 100% }) owns the on-screen size,
  // this only controls the drawing-buffer resolution.
  ctx.renderer.setSize(width, height, false)
  ctx.camera.aspect = width / height
  ctx.camera.updateProjectionMatrix()
}

/**
 * Creates the WebGL renderer, scene and camera. Fixed fov/near/far per spec.
 * Antialiasing and DPR scale start from the device's initial quality tier;
 * resizing is handled via a ResizeObserver on the canvas's parent element.
 */
export function createRenderer(canvas: HTMLCanvasElement): Ctx {
  const tier = detectInitialTier()

  const renderer = new THREE.WebGLRenderer({
    canvas,
    alpha: false,
    antialias: tier > 0,
    powerPreference: 'high-performance',
  })

  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(FOV, 1, NEAR, FAR)

  const ctx: Ctx = { renderer, scene, camera, canvas }
  tierByCtx.set(ctx, tier)

  const target = canvas.parentElement ?? document.body
  const observer = new ResizeObserver(() => layout(ctx))
  observer.observe(target)

  layout(ctx)

  return ctx
}

/**
 * Re-applies DPR (and re-lays-out size/aspect) for a new quality tier.
 * Call this from a QualityManager#onChange listener.
 */
export function applyDpr(ctx: Ctx, tier: Tier): void {
  tierByCtx.set(ctx, tier)
  layout(ctx)
}
