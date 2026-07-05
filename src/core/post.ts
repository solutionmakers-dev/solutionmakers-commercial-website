import * as THREE from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { CopyShader } from 'three/examples/jsm/shaders/CopyShader.js'
import { TIERS, type Tier } from './quality'
import type { Ctx } from './renderer'

/**
 * Post — the render pipeline: bloom on tiers whose config says so, plain
 * `renderer.render` otherwise.
 *
 * Chain when bloom is on:
 *
 *   RenderPass → UnrealBloomPass → ShaderPass(CopyShader, to screen)
 *
 * Two hard-won findings behind this exact shape (Task 14, re-verified by A/B
 * against the direct-render path — see the task-14 report):
 *
 * 1. With this three version the scene arrives in the composer's buffer
 *    already tone-mapped + sRGB-encoded, i.e. the RenderPass output matches
 *    the direct render (CopyShader is a verbatim blit and the WIP chain's
 *    colours match the bloom-off render exactly). The bloom therefore
 *    operates display-referred — the spec's threshold (0.72) belongs to a
 *    linear-HDR chain and does NOT transfer. Adding an OutputPass to get that
 *    HDR chain double-applies ACES + sRGB (A/B-confirmed full-frame grey
 *    wash, ~3× brighter void).
 *
 * 2. UnrealBloomPass must NOT terminate the chain: its renderToScreen path
 *    draws the base image through an internal (tone-mapped) basic material,
 *    which re-applies the output transform — same wash. The trailing
 *    CopyShader pass is transform-free, so the finished frame reaches the
 *    screen verbatim at the cost of one blit.
 *
 * Sizing: the renderer owns DPR/size (ResizeObserver in renderer.ts +
 * applyDpr on tier change). Rather than duplicating those listeners, render()
 * mirrors the renderer's current pixel ratio + logical size into the composer
 * whenever they drift — that one cheap comparison covers window resizes,
 * orientation changes AND tier DPR changes in a single place.
 */

// Bloom look — retuned from the spec's (0.55, 0.7, 0.72) in Task 14's visual
// pass. Those numbers assume bloom over linear HDR; in this display-referred
// chain (finding 1 above) the hero's lit chrome fills a large patch at ≈1.0,
// so any low threshold passes the whole patch and UnrealBloom re-adds its
// FULL colour summed over 5 blur octaves — the mark drowned in a white ball
// even at strength 0.15/threshold 0.95. Display-referred bloom must therefore
// be a whisper: threshold 0.99 selects only the truly saturated pixels
// (chrome streak, station cores, beacon) and strength 0.05 adds a soft halo
// that never re-saturates the region interior — the mark stays structured.
// A/B-verified against bloom-off at the hero, travel and dive poses on both
// viewports — see the task-14 report's tuning series.
export const BLOOM_STRENGTH = 0.05
export const BLOOM_RADIUS = 0.25
export const BLOOM_THRESHOLD = 0.99

export class Post {
  private readonly ctx: Ctx
  private composer: EffectComposer | null = null
  private readonly lastSize = new THREE.Vector2(-1, -1)
  private lastDpr = -1
  private readonly sizeScratch = new THREE.Vector2()

  constructor(ctx: Ctx, tier: Tier) {
    this.ctx = ctx
    this.setTier(tier)
  }

  /** Build/tear down the bloom chain for a tier (quality.onChange calls this). */
  setTier(tier: Tier): void {
    const wantBloom = TIERS[tier].bloom
    if (wantBloom === (this.composer !== null)) return

    this.composer?.dispose()
    this.composer = null
    if (!wantBloom) return

    const { renderer, scene, camera } = this.ctx
    const size = renderer.getSize(this.sizeScratch)
    const composer = new EffectComposer(renderer)
    composer.addPass(new RenderPass(scene, camera))
    composer.addPass(
      new UnrealBloomPass(new THREE.Vector2(size.x, size.y), BLOOM_STRENGTH, BLOOM_RADIUS, BLOOM_THRESHOLD),
    )
    composer.addPass(new ShaderPass(CopyShader))
    this.composer = composer
    // Force a size sync on the first render after a rebuild.
    this.lastSize.set(-1, -1)
    this.lastDpr = -1
  }

  render(): void {
    const { renderer, scene, camera } = this.ctx
    if (!this.composer) {
      renderer.render(scene, camera)
      return
    }

    // Mirror the renderer's DPR + logical size (applyDpr semantics) on drift.
    const size = renderer.getSize(this.sizeScratch)
    const dpr = renderer.getPixelRatio()
    if (!size.equals(this.lastSize) || dpr !== this.lastDpr) {
      this.lastSize.copy(size)
      this.lastDpr = dpr
      this.composer.setPixelRatio(dpr)
      this.composer.setSize(size.x, size.y)
    }

    this.composer.render()
  }
}
