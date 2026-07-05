import * as THREE from 'three'
import type { Ctx } from '../core/renderer'
import type { Post } from '../core/post'
import type { QualityManager } from '../core/quality'
import type { Environment } from '../world/environment'
import type { LogoHero } from '../world/logoHero'
import type { Station } from '../world/stations/station'
import type { Constellation } from '../world/constellation'
import type { Hud } from '../ui/hud'
import type { PanelLayer } from '../ui/panels'
import type { Intro } from '../ui/intro'
import { STATIONS, type StationDef } from '../content/content'
import { CameraRig } from './cameraRig'
import { GestureController } from './gestures'
import { NavState } from './navState'
import { readHash, writeHash } from './deepLink'
import { damp } from './damp'
import { prefersReducedMotion } from '../a11y/reducedMotion'

/**
 * Orchestrator — wires every module into the product experience. main.ts
 * builds the world and hands it over; everything behavioural lives here:
 * gestures → nav/rig, tap raycasting, HUD/panel callbacks, deep links, tilt,
 * and the per-frame update order. NavState stays the single owner of mode —
 * every flow below asks it first and bails when the transition is illegal.
 */

// --- feel constants ---------------------------------------------------------
/** Station activation distance in path-t; must cover FOCUS_RANGE_T. */
const ACTIVATE_D = 0.22
/** Hysteresis: an active station stays active until this far away. */
const DEACTIVATE_D = 0.25
/** Proximity focus ramps 0→1 as |station.t − rig.t| falls through this. */
const FOCUS_RANGE_T = 0.06
/** Dive focus damping — ~98% over the 650 ms dive tween. */
const DIVE_FOCUS_LAMBDA = 6
/** Map fade damping — ~98% over the 700 ms map tween (force-completed onDone). */
const MAP_FADE_LAMBDA = 6
/** Invisible tap-target sphere radius around each station core (covers the
 *  contact beacon overlapping the core, and makes a comfortable thumb target). */
const STATION_HIT_RADIUS = 1.0
/** Horizontal drag px → full look-around deflection. */
const DRAG_LOOK_GAIN = 1 / 260
/** Look-around drifts back to centre at this rate once the finger lifts. */
const DRAG_LOOK_DECAY = 1.6
/** Pinch-out beyond this scale in travel opens the map… */
const PINCH_OPEN = 1.25
/** …and pinch-in below this scale in map closes it. */
const PINCH_CLOSE = 0.8
/** prefers-reduced-motion: camera tweens (dive/map/warp) shrink to this
 *  fraction of their normal duration (650ms dive → ~228ms). */
const REDUCED_MOTION_TWEEN_SCALE = 0.35
/** prefers-reduced-motion: dust drift amplitude shrinks to this fraction. */
const REDUCED_MOTION_DRIFT_SCALE = 0.5

export interface AppDeps {
  ctx: Ctx
  rig: CameraRig
  stations: Station[]
  constellation: Constellation
  env: Environment
  hero: LogoHero
  quality: QualityManager
  post: Post
  hud: Hud
  panels: PanelLayer
  intro: Intro
}

export interface App {
  /** The per-frame update — hand this to startLoop. */
  frame(dt: number, elapsed: number): void
}

function defById(id: string): StationDef | undefined {
  return STATIONS.find((s) => s.id === id)
}

export function orchestrate(deps: AppDeps): App {
  const { ctx, rig, stations, constellation, env, hero, quality, post, hud, panels, intro } = deps
  const { canvas, camera } = ctx

  const nav = new NavState()

  // --- reduced motion ---------------------------------------------------------
  // Checked once at boot (the OS-level preference doesn't change mid-session
  // in any way we need to react to live). Shortens every camera tween, halves
  // the dust drift, and disables fling inertia below — a drag settles directly
  // onto the nearest station (if close enough) instead of gliding on through a
  // velocity decay; no inertia, but the station magnetism still applies.
  const reducedMotion = prefersReducedMotion()
  if (reducedMotion) {
    rig.setMotionScale(REDUCED_MOTION_TWEEN_SCALE)
    env.setMotionScale(REDUCED_MOTION_DRIFT_SCALE)
  }

  // --- tap targets ----------------------------------------------------------
  // One invisible sphere per station (material.visible=false skips rendering,
  // not raycasting). It wraps the core AND the contact motif's beacon sphere
  // that overlaps it, so a tap anywhere on the heart of a station resolves to
  // its stationId. Satellite orbiters keep their own userData.satelliteId.
  const stationHits = new Map<Station, THREE.Mesh>()
  const hitMaterial = new THREE.MeshBasicMaterial({ visible: false })
  for (const st of stations) {
    const hit = new THREE.Mesh(new THREE.SphereGeometry(STATION_HIT_RADIUS, 12, 12), hitMaterial)
    hit.userData.stationId = st.def.id
    st.group.add(hit)
    stationHits.set(st, hit)
  }

  const rdStation = stations.find((s) => s.def.motif === 'satellites')
  const satelliteHits: THREE.Object3D[] = []
  rdStation?.group.traverse((o) => {
    if (typeof o.userData.satelliteId === 'string') satelliteHits.push(o)
  })

  const raycaster = new THREE.Raycaster()
  const ndc = new THREE.Vector2()
  function raycastFrom(x: number, y: number): THREE.Raycaster {
    const rect = canvas.getBoundingClientRect()
    ndc.set(((x - rect.left) / rect.width) * 2 - 1, -((y - rect.top) / rect.height) * 2 + 1)
    raycaster.setFromCamera(ndc, camera)
    return raycaster
  }

  // --- per-frame state ------------------------------------------------------
  const activeIds = new Set<string>()
  const divedFocus = new Map<string, number>()
  for (const st of stations) {
    st.setActive(false) // proximity gating below owns activation from frame 1
    divedFocus.set(st.def.id, 0)
  }

  let mapFade = 0 // damped toward (mode==='map' ? 1 : 0); force-completed onDone
  let dragNX = 0 // accumulated horizontal-drag look, decaying toward centre
  let dragActive = false
  let tiltNX = 0
  let tiltNY = 0

  // --- nav flows (NavState first; it returning false means "not now") --------
  function hideMapNow(): void {
    mapFade = 0
    constellation.setVisible(false)
  }

  function dive(id: string): void {
    const def = defById(id)
    if (!def || !nav.dive(id)) return
    rig.diveTo(id)
    panels.show(def)
    writeHash(id)
  }

  function exitFocus(): void {
    if (!nav.exitFocus()) return // listener hides the panel
    rig.exitDive()
    writeHash(null)
  }

  function openMap(): void {
    if (!nav.openMap()) return
    constellation.setCurrent(rig.nearestStation().id)
    rig.toMap()
  }

  function closeMap(): void {
    if (!nav.closeMap()) return
    // The fade tracks mode (now 'travel') per-frame; the tween's onDone
    // force-completes it so no label ghosts survive over the travel scene.
    rig.fromMap(() => hideMapNow())
  }

  function warp(id: string): void {
    if (!nav.warp(id)) return
    constellation.setCurrent(id)
    rig.warpTo(id, () => hideMapNow())
    writeHash(id)
  }

  // --- taps -------------------------------------------------------------------
  function onTap(x: number, y: number): void {
    if (nav.mode === 'map') {
      const id = constellation.nodeAt(raycastFrom(x, y))
      if (id) warp(id)
      return
    }

    if (nav.mode === 'travel') {
      const targets: THREE.Object3D[] = []
      for (const st of stations) {
        if (activeIds.has(st.def.id)) targets.push(stationHits.get(st)!)
      }
      // Satellite orbiters join the test only while the R&D station is near.
      if (rdStation && activeIds.has(rdStation.def.id)) targets.push(...satelliteHits)
      const hit = raycastFrom(x, y).intersectObjects(targets, false)[0]
      if (!hit) return
      const satId = hit.object.userData.satelliteId as string | undefined
      if (satId && rdStation) {
        dive(rdStation.def.id)
        panels.showSatellite(rdStation.def.id, satId)
      } else {
        dive(hit.object.userData.stationId as string)
      }
      return
    }

    // Focused on R&D: tapping an orbiter selects its venture in the panel.
    if (nav.mode === 'focus' && rdStation && nav.stationId === rdStation.def.id) {
      const hit = raycastFrom(x, y).intersectObjects(satelliteHits, false)[0]
      const satId = hit?.object.userData.satelliteId as string | undefined
      if (satId) panels.showSatellite(rdStation.def.id, satId)
    }
  }

  // --- gestures ---------------------------------------------------------------
  const gestures = new GestureController(canvas)
  gestures.on((e) => {
    switch (e.type) {
      case 'dragmove':
        if (nav.mode !== 'travel') return
        dragActive = true
        rig.addTravel(-e.dy)
        dragNX = THREE.MathUtils.clamp(dragNX + e.dx * DRAG_LOOK_GAIN, -1, 1)
        break
      case 'dragend':
        dragActive = false
        if (nav.mode === 'travel') {
          // Reduced motion: no fling inertia (no glide), but station magnetism
          // must still survive — settle directly onto the nearest station
          // instead of gliding on through a velocity decay.
          if (reducedMotion) rig.settleToNearestStation()
          else rig.fling(-e.vy)
        }
        break
      case 'wheel':
        if (nav.mode === 'travel') rig.addTravel(e.delta)
        break
      case 'tap':
        onTap(e.x, e.y)
        break
      case 'pinch':
        dragActive = false // a pinch silently cancels any in-flight drag
        break
      case 'pinchend':
        dragActive = false
        if (e.scale > PINCH_OPEN) openMap()
        else if (e.scale < PINCH_CLOSE) closeMap()
        break
    }
  })

  // --- mode-driven UI -----------------------------------------------------------
  nav.on((next, prev) => {
    hud.setMode(next.mode)
    if (prev.mode === 'focus' && next.mode !== 'focus') panels.hide()
    // On phones the sheet's own ✕/swipe-close makes the orb redundant clutter —
    // CSS hides it under 768px while this class is set (desktop keeps it).
    document.body.classList.toggle('sm-mode-focus', next.mode === 'focus')
  })

  panels.onClose(() => exitFocus())

  hud.onOrb(() => {
    if (nav.mode === 'travel') openMap()
    else if (nav.mode === 'map') closeMap()
    else if (nav.mode === 'focus') exitFocus()
  })

  hud.onDot((id) => {
    if (nav.mode !== 'travel') return // dots are only shown in travel anyway
    rig.warpTo(id)
    writeHash(id)
  })

  hud.onHome(() => {
    // From focus/map, fall back to travel first (panel/map fade react via nav.on
    // and the per-frame fade); the warp then flies home from the current pose.
    if (nav.mode === 'focus') nav.exitFocus()
    else if (nav.mode === 'map') nav.closeMap()
    if (nav.mode !== 'travel') return
    rig.warpToT(0, () => hideMapNow())
    writeHash(null)
  })

  rig.onProgress((t) => {
    hud.setProgress(t)
    constellation.setCurrent(rig.nearestStation().id)
  })

  // --- arrival / deep link / tilt -------------------------------------------------
  const bootId = readHash()
  intro.play(() => {
    nav.enter()
    hud.setProgress(rig.t)
    if (bootId) rig.warpTo(bootId) // valid hash → fly straight to the station
  })

  intro.onTiltGranted(() => {
    window.addEventListener('deviceorientation', (e) => {
      tiltNX = THREE.MathUtils.clamp((e.gamma ?? 0) / 45, -1, 1)
      tiltNY = THREE.MathUtils.clamp(((e.beta ?? 45) - 45) / 45, -1, 1)
    })
  })

  // --- per-frame -------------------------------------------------------------------
  function updateLook(dt: number): void {
    dragNX = damp(dragNX, 0, DRAG_LOOK_DECAY, dt)
    if (nav.mode === 'travel') {
      // Drag dominates while touching; the gyro takes over once the finger lifts.
      rig.setLook(dragActive ? dragNX : dragNX + tiltNX, dragActive ? 0 : tiltNY)
    } else {
      rig.setLook(0, 0)
    }
  }

  function updateStations(dt: number, elapsed: number): void {
    for (const st of stations) {
      const id = st.def.id
      const d = Math.abs(st.def.t - rig.t)
      const wasActive = activeIds.has(id)
      const isActive = wasActive ? d <= DEACTIVATE_D : d < ACTIVATE_D
      if (isActive !== wasActive) {
        st.setActive(isActive)
        if (isActive) activeIds.add(id)
        else activeIds.delete(id)
      }
      if (!isActive) continue

      // Focus = proximity glow on fly-past, overridden by the dive ramp (a
      // damped 0→1 across the dive, back down on exit) for the focused station.
      const proximity = 1 - Math.min(d / FOCUS_RANGE_T, 1)
      const diveTarget = nav.mode === 'focus' && nav.stationId === id ? 1 : 0
      const dived = damp(divedFocus.get(id) ?? 0, diveTarget, DIVE_FOCUS_LAMBDA, dt)
      divedFocus.set(id, dived)
      st.setFocus(Math.max(proximity, dived))
      st.update(dt, elapsed)
    }
  }

  function updateMap(dt: number, elapsed: number): void {
    const target = nav.mode === 'map' ? 1 : 0
    mapFade = damp(mapFade, target, MAP_FADE_LAMBDA, dt)
    if (target === 0 && mapFade < 0.01) mapFade = 0 // snap the asymptotic tail
    else if (target === 1 && mapFade > 0.99) mapFade = 1
    constellation.setVisible(mapFade > 0, mapFade)
    if (mapFade > 0) constellation.update(dt, elapsed)
  }

  return {
    frame(dt: number, elapsed: number): void {
      quality.sample(dt)
      updateLook(dt)
      rig.update(dt)
      env.update(dt, elapsed, camera.position.z)
      hero.update(dt, elapsed)
      updateStations(dt, elapsed)
      updateMap(dt, elapsed)
      post.render()
    },
  }
}
