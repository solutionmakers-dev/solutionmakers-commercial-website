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
import { Constellation } from './world/constellation'
import { CameraRig } from './nav/cameraRig'
import { damp } from './nav/damp'
import { GestureController } from './nav/gestures'
import { STATIONS } from './content/content'
import { Hud } from './ui/hud'
import { PanelLayer } from './ui/panels'
import { Intro } from './ui/intro'
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

// Constellation map layer — hidden except in map mode (Task 14's pinch-out
// fades it in; taps on its nodes warp).
const anchors = new Map(STATIONS.map((s) => [s.id, rig.stationAnchor(s.id)]))
const constellation = new Constellation(stations, anchors)
scene.add(constellation.group)

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

// TEMP until Task 14 wiring: key 'm' toggles map mode (rig pose + constellation
// fade) so the layer can be verified visually. Task 14 replaces this with the
// pinch-out gesture and moves fade/current-station ownership into nav.
let mapOn = false
let mapFade = 0 // damped toward mapOn; drives the constellation fade
window.addEventListener('keydown', (e) => {
  if (e.key !== 'm') return
  mapOn = !mapOn
  if (mapOn) {
    constellation.setCurrent(rig.nearestStation().id)
    rig.toMap()
  } else {
    rig.fromMap()
  }
})

startLoop((dt, elapsed) => {
  quality.sample(dt)
  rig.update(dt)
  env.update(dt, elapsed, camera.position.z)
  hero.update(dt, elapsed)
  for (const st of stations) {
    st.setFocus(1 - Math.min(Math.abs(rig.t - st.def.t) / FOCUS_RANGE_T, 1))
    st.update(dt, elapsed)
  }
  // TEMP (Task 14): drive the constellation fade toward the map toggle state.
  const fadeTarget = mapOn ? 1 : 0
  mapFade = damp(mapFade, fadeTarget, 5, dt)
  if (Math.abs(mapFade - fadeTarget) < 0.005) mapFade = fadeTarget
  constellation.setVisible(mapOn || mapFade > 0, mapFade)
  constellation.update(dt, elapsed)
  renderer.render(scene, camera)
})

// TEMP (Task 13 visual verification ONLY — remove; Task 14 wires the real UI).
// `?ui=<state>` mounts the overlay components over the live hero so their
// premium look can be screenshotted. Not part of the shipped nav flow.
const uiDemo = new URLSearchParams(location.search).get('ui')
if (uiDemo) {
  const uiRoot = document.querySelector<HTMLElement>('#ui')
  if (uiRoot) {
    if (uiDemo === 'intro') {
      new Intro(uiRoot).play(() => {})
    } else if (uiDemo === 'hud') {
      const hud = new Hud(uiRoot, STATIONS)
      hud.setMode('travel')
      hud.setProgress(0.48)
      rig.addTravel(720) // TEMP: drift into open space so the HUD chrome reads cleanly for the shot
    } else if (uiDemo.startsWith('panel')) {
      const id = uiDemo.split('-')[1] ?? 'software'
      const def = STATIONS.find((s) => s.id === id) ?? STATIONS[1]!
      const hud = new Hud(uiRoot, STATIONS)
      hud.setMode('focus')
      new PanelLayer(uiRoot).show(def)
    }
  }
}
