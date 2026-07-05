import '@fontsource/space-grotesk/latin-400.css'
import '@fontsource/space-grotesk/latin-500.css'
import '@fontsource/inter/latin-400.css'
import './style.css'

import * as THREE from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { createRenderer, applyDpr } from './core/renderer'
import { startLoop } from './core/loop'
import { QualityManager } from './core/quality'
import { Post } from './core/post'
import { Environment } from './world/environment'
import { LogoHero } from './world/logoHero'
import { buildStations } from './world/stations/station'
import { Constellation } from './world/constellation'
import { CameraRig } from './nav/cameraRig'
import { orchestrate } from './nav/orchestrator'
import { STATIONS, SITE } from './content/content'
import { Hud } from './ui/hud'
import { PanelLayer } from './ui/panels'
import { Intro } from './ui/intro'
import { buildMirror, revealMirrorAsFallback } from './a11y/mirror'
import logoSvg from './assets/logo-mark.svg?raw'

// main is a composition root only: it builds the world + UI and hands them to
// the orchestrator (src/nav/orchestrator.ts), which owns all behaviour.

const canvas = document.querySelector<HTMLCanvasElement>('#scene')
if (!canvas) throw new Error('missing #scene canvas')
const uiRoot = document.querySelector<HTMLElement>('#ui')
if (!uiRoot) throw new Error('missing #ui root')
const mirrorRoot = document.querySelector<HTMLElement>('#mirror')
if (!mirrorRoot) throw new Error('missing #mirror root')

// Accessible mirror: real, focusable content for screen readers/SEO/crawlers,
// built unconditionally on every boot (not only the no-WebGL fallback below)
// — the canvas stays aria-hidden regardless of which path this boot takes.
buildMirror(mirrorRoot, STATIONS, SITE)

/**
 * WebGL creation can fail outright (old browser, disabled/blocklisted GPU,
 * `webgl` context creation refused, …) — `THREE.WebGLRenderer` throws
 * synchronously in that case. On failure, reveal the mirror as a static
 * fallback page and skip the whole 3D boot; no error escapes.
 */
function boot(canvas: HTMLCanvasElement, uiRoot: HTMLElement, mirrorRoot: HTMLElement): void {
  let ctx: ReturnType<typeof createRenderer>
  try {
    ctx = createRenderer(canvas)
  } catch {
    revealMirrorAsFallback(mirrorRoot)
    return
  }

  const { renderer, scene, camera } = ctx

  scene.background = new THREE.Color('#070B14')
  // Scene-level fog: fades the void to the sky colour with distance, on top of
  // (not instead of) Environment's own gradient sky sphere.
  scene.fog = new THREE.Fog('#070B14', 18, 55)

  // Image-based lighting for the metal mark: bake a soft studio (RoomEnvironment)
  // into a PMREM once. Set as the scene's default environment AND handed to the
  // hero explicitly — a `metalness: 1` material with no env map renders pure black.
  const pmrem = new THREE.PMREMGenerator(renderer)
  const envMap = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
  scene.environment = envMap
  pmrem.dispose()

  const quality = new QualityManager()
  const env = new Environment(quality.tier)
  scene.add(env.group)

  const hero = new LogoHero(logoSvg)
  hero.setEnvMap(envMap)
  scene.add(hero.group)

  const rig = new CameraRig(camera, STATIONS)

  // Stations sit at their spline anchors, off to alternating sides of the path.
  const stations = buildStations(STATIONS, rig, quality.tier)
  for (const st of stations) scene.add(st.group)

  // Constellation map layer — hidden except in map mode (pinch-out fades it in;
  // taps on its nodes warp).
  const anchors = new Map(STATIONS.map((s) => [s.id, rig.stationAnchor(s.id)]))
  const constellation = new Constellation(stations, anchors)
  scene.add(constellation.group)

  // Post pipeline: bloom (+ tone-mapped output) on capable tiers, else direct.
  const post = new Post(ctx, quality.tier)
  quality.onChange((tier) => {
    applyDpr(ctx, tier)
    env.applyTier(tier)
    post.setTier(tier)
  })

  // UI overlay.
  const hud = new Hud(uiRoot, STATIONS)
  const panels = new PanelLayer(uiRoot)
  const intro = new Intro(uiRoot)

  // WebGL context loss: pause is implicit (the browser stops delivering
  // frames' worth of GPU work; our RAF loop keeps ticking harmlessly), so all
  // that's needed is to swallow the browser's default "kill the context for
  // good" behaviour and give a small, honest sign of life while it recovers.
  const contextLostOverlay = document.createElement('div')
  contextLostOverlay.className = 'sm-context-lost'
  contextLostOverlay.textContent = 'resuming…'
  contextLostOverlay.hidden = true
  uiRoot.appendChild(contextLostOverlay)

  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault() // opt into automatic restoration instead of a permanent loss
    contextLostOverlay.hidden = false
  })
  canvas.addEventListener('webglcontextrestored', () => {
    contextLostOverlay.hidden = true
  })

  const app = orchestrate({ ctx, rig, stations, constellation, env, hero, quality, post, hud, panels, intro })
  startLoop(app.frame)
}

boot(canvas, uiRoot, mirrorRoot)
