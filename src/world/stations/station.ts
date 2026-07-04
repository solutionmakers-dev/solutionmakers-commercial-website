import * as THREE from 'three'
import type { Motif, StationDef } from '../../content/content'
import type { Tier } from '../../core/quality'
import { PATH_POINTS } from '../../nav/cameraRig'
import { orbits } from './motifs/orbits'
import { grid } from './motifs/grid'
import { swarm } from './motifs/swarm'

/**
 * Station — one glowing installation beside the travel path. A motif builder
 * produces the visuals (chrome core + brand light + motif geometry); Station
 * wraps them with placement, visibility gating and the 0..1 focus dial that
 * navigation drives as the camera nears/dives.
 */

export interface MotifBuild {
  group: THREE.Group
  update(dt: number, elapsed: number, focus: number): void
  /** The tap target — `userData.stationId` is set for raycast hit-testing. */
  core: THREE.Object3D
}

export type MotifBuilder = (def: StationDef, tier: Tier) => MotifBuild

/**
 * Motif registry. `Partial` because it is filled across tasks: task 10 ships
 * orbits/grid/swarm; task 11 adds circuit/satellites/contact (add the imports
 * and keys here — `buildStations` will pick the new ones up automatically).
 */
export const MOTIFS: Partial<Record<Motif, MotifBuilder>> = {
  orbits,
  grid,
  swarm,
}

export class Station {
  readonly def: StationDef
  readonly group: THREE.Group
  readonly core: THREE.Object3D

  private readonly build: MotifBuild
  private active = true
  private focus = 0

  constructor(def: StationDef, builder: MotifBuilder, anchor: THREE.Vector3, tier: Tier) {
    this.def = def
    this.build = builder(def, tier)
    this.group = this.build.group
    this.core = this.build.core
    this.group.position.copy(anchor)
  }

  /** Hide + halt: an inactive station neither renders nor animates. */
  setActive(a: boolean): void {
    this.active = a
    this.group.visible = a
  }

  /** 0..1 — motifs brighten/expand subtly as navigation approaches/dives. */
  setFocus(f: number): void {
    this.focus = THREE.MathUtils.clamp(f, 0, 1)
  }

  update(dt: number, elapsed: number): void {
    if (!this.active) return
    this.build.update(dt, elapsed, this.focus)
  }
}

/** Anything that can place a station — satisfied by CameraRig. */
export interface AnchorSource {
  stationAnchor(id: string): THREE.Vector3
}

/**
 * Builds a Station for every def whose motif has a registered builder, placed
 * at its rig anchor. Defs with not-yet-implemented motifs are skipped (they
 * appear as tasks land builders in `MOTIFS`).
 */
export function buildStations(defs: StationDef[], rig: AnchorSource, tier: Tier): Station[] {
  // Same spline the rig rides — used only to face each station back at the path.
  const curve = new THREE.CatmullRomCurve3(PATH_POINTS)
  const out: Station[] = []
  for (const def of defs) {
    const builder = MOTIFS[def.motif]
    if (!builder) continue
    const station = new Station(def, builder, rig.stationAnchor(def.id), tier)
    // Yaw the group's +Z toward the passing camera (anchor and path point share
    // a Y, so this never tips the base ring off the horizontal): motifs are
    // authored face-on to +Z (grid backdrop, orbit tilts, dive framing).
    station.group.lookAt(curve.getPointAt(THREE.MathUtils.clamp(def.t, 0, 1)))
    out.push(station)
  }
  return out
}
