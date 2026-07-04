import '@fontsource/space-grotesk/latin-400.css'
import '@fontsource/space-grotesk/latin-500.css'
import '@fontsource/inter/latin-400.css'
import './style.css'

import * as THREE from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { createRenderer, applyDpr } from './core/renderer'
import { startLoop } from './core/loop'
import { QualityManager } from './core/quality'
import { Environment } from './world/environment'
import { LogoHero } from './world/logoHero'
import { buildStations } from './world/stations/station'
import { CameraRig } from './nav/cameraRig'
import { GestureController } from './nav/gestures'
import { STATIONS } from './content/content'
import logoSvg from './assets/logo-mark.svg?raw'

const canvas = document.querySelector<HTMLCanvasElement>('#scene')
if (!canvas) throw new Error('missing #scene canvas')

const ctx = createRenderer(canvas)
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
quality.onChange((tier) => {
  applyDpr(ctx, tier)
  env.applyTier(tier)
})

const hero = new LogoHero(logoSvg)
hero.setEnvMap(envMap)
scene.add(hero.group)

const rig = new CameraRig(camera, STATIONS)

// Stations sit at their spline anchors, off to alternating sides of the path.
const stations = buildStations(STATIONS, rig, quality.tier)
for (const st of stations) scene.add(st.group)

// Focus ramps 0→1 as the camera's path parameter nears a station's t.
const FOCUS_RANGE_T = 0.06

// TEMP until Task 14 wiring: minimal wheel → travel so the path can be flown
// for dev checks, and the rig exposed for dev screenshots (diveTo framing).
// Task 14 replaces all of this with the full gesture → nav mapping.
const gestures = new GestureController(canvas)
gestures.on((e) => {
  if (e.type === 'wheel') rig.addTravel(e.delta)
})
;(window as unknown as { __rig?: CameraRig }).__rig = rig

startLoop((dt, elapsed) => {
  quality.sample(dt)
  rig.update(dt)
  env.update(dt, elapsed, camera.position.z)
  hero.update(dt, elapsed)
  for (const st of stations) {
    st.setFocus(1 - Math.min(Math.abs(rig.t - st.def.t) / FOCUS_RANGE_T, 1))
    st.update(dt, elapsed)
  }
  renderer.render(scene, camera)
})
