import * as THREE from 'three'
import { damp, easeInOutCubic, Tween } from './damp'
import type { StationDef } from '../content/content'

/**
 * CameraRig — the single owner of camera motion.
 *
 * The camera rides a Catmull-Rom spline (`PATH_POINTS`) that threads a gentle
 * S-curve through the nebula. Stations sit `stationAnchor()` off to alternating
 * sides so the camera passes *beside* them. Everything that moves does so
 * through `damp` (critically-damped, frame-rate independent) — travel never
 * snaps or teleports; it eases. Discrete pose changes (diveTo / toMap / warpTo)
 * are `Tween`s that land *exactly* on their target pose so the hand-off back to
 * damping produces no visible pop.
 *
 * Modes / input policy:
 *   travel — free scroll along the path; `addTravel`/`fling` accepted here only.
 *   tween  — a dive/map/warp animation is playing; travel input is IGNORED
 *            (simplest, documented choice — not buffered). Only one camera tween
 *            is ever active: starting a new one cancels the old.
 *   focus  — parked at a station's dive pose (after diveTo completes).
 *   map    — parked at the constellation overview pose (after toMap completes).
 *
 * `t` is the smoothed arc-length parameter of the camera along the path in
 * [0,1]; station `.t` values are arc-length fractions too, so `getPointAt(t)`
 * lines everything up.
 */

/**
 * Gentle S-curve control points (~91 units long). Starts at the origin, sweeps
 * ±6 laterally and ±1.5 vertically while advancing along -z. Exported so other
 * systems (constellation map, station placement) can reconstruct the same path.
 */
export const PATH_POINTS: THREE.Vector3[] = [
  new THREE.Vector3(0, 0, 0),
  new THREE.Vector3(6, 1.5, -22),
  new THREE.Vector3(-6, -1.5, -48),
  new THREE.Vector3(6, 1.2, -70),
  new THREE.Vector3(0, 0, -82),
]

// --- feel constants -------------------------------------------------------
const TRAVEL_PX_TO_T = 0.00042 // drag / fling pixels → arc-length fraction
const FLING_DECAY = 2.2 // fling velocity decays as e^{-2.2·dt} per second
const VEL_SETTLE = 0.0006 // |velT| below this = "settled" → snap
const SNAP_RANGE = 0.045 // snap to a station only within this many t of it
const ANCHOR_LATERAL = 2.2 // how far off the path a station group sits
const LOOK_AHEAD = 0.035 // travel gaze leads the camera by this much t
// 4.4 (raised from 3.4 in Task 14): at 3.4 the wider motifs (satellite orbits
// r≤2.4, contact mote ring r≤1.7 + cage) cropped at the frame edges from the
// dive pose; 4.4 frames a full motif with breathing room at fov 55.
const DIVE_DISTANCE = 4.4 // camera-to-anchor distance at a dive pose
// On narrow (portrait) viewports the horizontal fov is the binding constraint
// — at aspect ~0.46 the half-frame at 4.4 units is barely ±1.06 world units,
// so a motif family like the R&D orbits (r ≤ 2.4) crops to a wall of arcs.
// Same discipline as MAP_FIT_ASPECT: the dive pose backs off just enough for
// this half-width (world units) to fit the frame; aspects whose half-frame
// already covers it (≥ ~0.96 at fov 55) keep the canonical distance.
const DIVE_FIT_HALF_WIDTH = 2.2
const DIVE_ELEVATION_DEG = 12 // dive pose sits this far above the horizontal
const LOOK_MAX_YAW = 0.35 // max look-around yaw (rad)
const LOOK_MAX_PITCH = 0.2 // max look-around pitch (rad)
const POS_LAMBDA = 6 // position damping rate
const LOOK_LAMBDA = 4 // look/orientation damping rate
const DIVE_MS = 650
const MAP_MS = 700
const WARP_MS = 900
const MAP_FOV = 55 // whole curve framed in this vertical fov
const MAP_HEIGHT = 50 // map pose height above the path midpoint
const MAP_BEHIND = 58 // map pose distance behind (+z of) the midpoint
// The map pose above frames the curve for the VERTICAL fov; on narrow
// (portrait) viewports the horizontal fov becomes the binding constraint and
// the constellation's lateral spread (path ±6, anchors ±2.2, node glows and
// labels beyond that) crops at the frame edges. Below this aspect, `toMap`
// scales the pose offset up by (MAP_FIT_ASPECT / aspect) so the whole
// constellation stays in frame; wider viewports keep the canonical pose.
const MAP_FIT_ASPECT = 0.75
const PROGRESS_EPS = 0.001 // onProgress fires only when |Δt| exceeds this

const UP = new THREE.Vector3(0, 1, 0)

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v
}

/** In-place component-wise exponential damping of a Vector3 toward `target`. */
function dampVec(out: THREE.Vector3, target: THREE.Vector3, lambda: number, dt: number): void {
  out.x = damp(out.x, target.x, lambda, dt)
  out.y = damp(out.y, target.y, lambda, dt)
  out.z = damp(out.z, target.z, lambda, dt)
}

type Phase = 'travel' | 'tween' | 'focus' | 'map'

export class CameraRig {
  private readonly camera: THREE.PerspectiveCamera
  private readonly stations: StationDef[]
  private readonly curve: THREE.CatmullRomCurve3
  private readonly travelFov: number

  private phase: Phase = 'travel'

  // Travel state.
  private _t = 0 // smoothed camera parameter (exposed as `t`)
  private targetT = 0 // where travel wants to be (moved by input / snap)
  private velT = 0 // fling velocity, in t per second

  // Look-around offsets (damped toward their targets).
  private lookYaw = 0
  private lookPitch = 0
  private lookYawTarget = 0
  private lookPitchTarget = 0

  // Canonical damped pose. The camera is always `position = pos; lookAt(look)`.
  private readonly pos = new THREE.Vector3()
  private readonly look = new THREE.Vector3()

  // Parked poses for focus / map holds.
  private readonly focusPos = new THREE.Vector3()
  private readonly focusLook = new THREE.Vector3()
  private readonly mapPos = new THREE.Vector3()
  private readonly mapLook = new THREE.Vector3()

  // Active tween scratch.
  private readonly tween = new Tween()
  private readonly tweenFromPos = new THREE.Vector3()
  private readonly tweenToPos = new THREE.Vector3()
  private readonly tweenFromLook = new THREE.Vector3()
  private readonly tweenToLook = new THREE.Vector3()
  private tweenFromFov = 0
  private tweenToFov = 0
  private resolvePhase: Phase = 'travel'
  private travelResolveT = 0 // t to resume at when a tween resolves to travel
  private pendingDone: (() => void) | undefined

  private readonly progressCbs: Array<(t: number) => void> = []
  private lastNotifiedT = 0

  // Reduced-motion: scales every tween's duration (DIVE_MS/MAP_MS/WARP_MS).
  // 1 = full duration (default); set once via `setMotionScale` at boot.
  private motionScale = 1

  constructor(camera: THREE.PerspectiveCamera, stations: StationDef[]) {
    this.camera = camera
    this.stations = stations
    this.curve = new THREE.CatmullRomCurve3(PATH_POINTS)
    this.travelFov = camera.fov

    this.pos.copy(this.travelPos(0))
    this.look.copy(this.travelLook(0))
    this.applyToCamera()
  }

  get t(): number {
    return this._t
  }

  // --- geometry -----------------------------------------------------------

  /** Spline point at parameter `t` (arc-length fraction). */
  private travelPos(t: number): THREE.Vector3 {
    return this.curve.getPointAt(clamp01(t))
  }

  /**
   * Where the travel camera gazes at parameter `t`: a point a little further
   * along the path (`LOOK_AHEAD`), rotated by the current damped look-around
   * offsets so `setLook` composes cleanly on top of the travel pose.
   */
  private travelLook(t: number): THREE.Vector3 {
    const ct = clamp01(t)
    const pos = this.curve.getPointAt(ct)
    const ahead = this.curve.getPointAt(clamp01(ct + LOOK_AHEAD))
    const dir = ahead.sub(pos)
    let len = dir.length()
    if (len < 1e-4) {
      // At the very end of the path there is nothing ahead — gaze along the
      // tangent instead so we keep facing forward rather than NaN-ing.
      dir.copy(this.curve.getTangentAt(ct))
      len = 1
    } else {
      dir.divideScalar(len)
    }
    dir.applyAxisAngle(UP, this.lookYaw)
    const right = new THREE.Vector3().crossVectors(dir, UP).normalize()
    dir.applyAxisAngle(right, this.lookPitch)
    return pos.addScaledVector(dir, len)
  }

  private stationById(id: string): StationDef | undefined {
    return this.stations.find((s) => s.id === id)
  }

  private nearestTo(t: number): StationDef {
    let best: StationDef | undefined
    let bestD = Infinity
    for (const s of this.stations) {
      const d = Math.abs(s.t - t)
      if (d < bestD) {
        bestD = d
        best = s
      }
    }
    if (!best) throw new Error('CameraRig constructed without stations')
    return best
  }

  /**
   * World position where a station's group is placed: the spline point at
   * `station.t`, pushed `ANCHOR_LATERAL` sideways. The sign alternates by
   * station index so consecutive stations sit on opposite sides of the path —
   * the camera weaves past them. Unknown id → origin (stable, non-throwing).
   */
  stationAnchor(id: string): THREE.Vector3 {
    const st = this.stationById(id)
    if (!st) return new THREE.Vector3()
    const idx = this.stations.indexOf(st)
    const ct = clamp01(st.t)
    const lateral = new THREE.Vector3().crossVectors(this.curve.getTangentAt(ct), UP).normalize()
    const sign = idx % 2 === 0 ? 1 : -1
    return this.curve.getPointAt(ct).addScaledVector(lateral, ANCHOR_LATERAL * sign)
  }

  /** The dive pose for a station: `DIVE_DISTANCE` from the anchor, elevated by
   *  `DIVE_ELEVATION_DEG`, approaching from the path side, looking at the core. */
  private focusPose(id: string): { pos: THREE.Vector3; look: THREE.Vector3 } | undefined {
    const st = this.stationById(id)
    if (!st) return undefined
    const anchor = this.stationAnchor(id)
    const path = this.curve.getPointAt(clamp01(st.t))
    const viewDir = path.sub(anchor) // points from the station back toward the path
    if (viewDir.lengthSq() < 1e-8) viewDir.copy(this.curve.getTangentAt(clamp01(st.t)).negate())
    viewDir.normalize()
    // Portrait fit: back off until DIVE_FIT_HALF_WIDTH clears the horizontal
    // frame (see the constant's note); wide viewports keep the canonical 4.4.
    const halfW =
      DIVE_DISTANCE * Math.tan(((this.camera.fov / 2) * Math.PI) / 180) * Math.max(this.camera.aspect, 1e-6)
    const dist = DIVE_DISTANCE * Math.max(1, DIVE_FIT_HALF_WIDTH / halfW)
    const el = (DIVE_ELEVATION_DEG * Math.PI) / 180
    const pos = anchor
      .clone()
      .addScaledVector(viewDir, dist * Math.cos(el))
      .addScaledVector(UP, dist * Math.sin(el))
    return { pos, look: anchor }
  }

  // --- input --------------------------------------------------------------

  /** Move the travel target by `deltaPx` of drag. Ignored unless in travel. */
  addTravel(deltaPx: number): void {
    if (this.phase !== 'travel') return
    this.targetT = clamp01(this.targetT + deltaPx * TRAVEL_PX_TO_T)
  }

  /** Add fling inertia (px/s at release). Ignored unless in travel. */
  fling(velocityPxS: number): void {
    if (this.phase !== 'travel') return
    this.velT += velocityPxS * TRAVEL_PX_TO_T
  }

  /** Set look-around offset from normalized pointer coords in [-1,1]. */
  setLook(nx: number, ny: number): void {
    this.lookYawTarget = THREE.MathUtils.clamp(nx, -1, 1) * LOOK_MAX_YAW
    this.lookPitchTarget = THREE.MathUtils.clamp(ny, -1, 1) * LOOK_MAX_PITCH
  }

  // --- pose transitions ---------------------------------------------------

  private beginTween(
    toPos: THREE.Vector3,
    toLook: THREE.Vector3,
    ms: number,
    resolve: Phase,
    toFov: number,
    onDone?: () => void,
  ): void {
    this.tween.cancel() // only one camera tween at a time — this drops any predecessor
    this.tweenFromPos.copy(this.pos)
    this.tweenFromLook.copy(this.look)
    this.tweenToPos.copy(toPos)
    this.tweenToLook.copy(toLook)
    this.tweenFromFov = this.camera.fov
    this.tweenToFov = toFov
    this.resolvePhase = resolve
    this.pendingDone = onDone
    this.phase = 'tween'
    this.tween.start(
      0,
      1,
      ms,
      easeInOutCubic,
      (a) => this.applyTween(a),
      () => this.finishTween(),
    )
  }

  private applyTween(a: number): void {
    this.pos.lerpVectors(this.tweenFromPos, this.tweenToPos, a)
    this.look.lerpVectors(this.tweenFromLook, this.tweenToLook, a)
    if (this.tweenFromFov !== this.tweenToFov) {
      this.camera.fov = this.tweenFromFov + (this.tweenToFov - this.tweenFromFov) * a
      this.camera.updateProjectionMatrix()
    }
  }

  private finishTween(): void {
    this.phase = this.resolvePhase
    // Land the resolved-mode state EXACTLY on the pose the tween just reached so
    // the mode's damper continues from a fixed point — no pop.
    if (this.resolvePhase === 'travel') {
      this._t = this.travelResolveT
      this.targetT = this.travelResolveT
      this.velT = 0
    } else if (this.resolvePhase === 'focus') {
      this.focusPos.copy(this.pos)
      this.focusLook.copy(this.look)
    } else if (this.resolvePhase === 'map') {
      this.mapPos.copy(this.pos)
      this.mapLook.copy(this.look)
    }
    const done = this.pendingDone
    this.pendingDone = undefined
    done?.()
  }

  /**
   * Scales every subsequent tween's duration (dive/map/warp) by `scale` —
   * e.g. `setMotionScale(0.35)` for `prefers-reduced-motion` shortens a
   * 650ms dive to ~228ms. Set once at boot; takes effect from the next
   * tween onward (does not retroactively speed up one already in flight).
   */
  setMotionScale(scale: number): void {
    this.motionScale = scale
  }

  /** Dive intimately close to a station. Unknown id → no-op (no throw). */
  diveTo(id: string, onDone?: () => void): void {
    const fp = this.focusPose(id)
    if (!fp) return
    this.beginTween(fp.pos, fp.look, DIVE_MS * this.motionScale, 'focus', this.camera.fov, onDone)
  }

  /** Return from a dive to the travel pose at the current t. */
  exitDive(onDone?: () => void): void {
    this.travelResolveT = this._t
    this.beginTween(
      this.travelPos(this._t),
      this.travelLook(this._t),
      DIVE_MS * this.motionScale,
      'travel',
      this.travelFov,
      onDone,
    )
  }

  /** Pull back to the constellation overview: above and behind the path
   *  midpoint — higher/further on portrait viewports (see MAP_FIT_ASPECT). */
  toMap(onDone?: () => void): void {
    const mid = this.curve.getPointAt(0.5)
    const fit = Math.max(1, MAP_FIT_ASPECT / Math.max(this.camera.aspect, 1e-6))
    const toPos = mid.clone().add(new THREE.Vector3(0, MAP_HEIGHT * fit, MAP_BEHIND * fit))
    this.beginTween(toPos, mid, MAP_MS * this.motionScale, 'map', MAP_FOV, onDone)
  }

  /** Return from the map to the travel pose at the current t. */
  fromMap(onDone?: () => void): void {
    this.travelResolveT = this._t
    this.beginTween(
      this.travelPos(this._t),
      this.travelLook(this._t),
      MAP_MS * this.motionScale,
      'travel',
      this.travelFov,
      onDone,
    )
  }

  /** From the map, fly to a station's travel pose. Unknown id → no-op (no throw). */
  warpTo(id: string, onDone?: () => void): void {
    const st = this.stationById(id)
    if (!st) return
    this.warpToT(st.t, onDone)
  }

  /** Fly to an arbitrary path parameter with the warp tween (home chip → t=0). */
  warpToT(t: number, onDone?: () => void): void {
    const ct = clamp01(t)
    this.travelResolveT = ct
    this.beginTween(
      this.travelPos(ct),
      this.travelLook(ct),
      WARP_MS * this.motionScale,
      'travel',
      this.travelFov,
      onDone,
    )
  }

  // --- per-frame ----------------------------------------------------------

  update(dt: number): void {
    // Look-around offsets always ease toward their targets so the travel pose
    // reflects them the instant travel resumes.
    this.lookYaw = damp(this.lookYaw, this.lookYawTarget, LOOK_LAMBDA, dt)
    this.lookPitch = damp(this.lookPitch, this.lookPitchTarget, LOOK_LAMBDA, dt)

    switch (this.phase) {
      case 'tween':
        this.tween.update(dt)
        break
      case 'travel':
        this.updateTravel(dt)
        break
      case 'focus':
        dampVec(this.pos, this.focusPos, POS_LAMBDA, dt)
        dampVec(this.look, this.focusLook, LOOK_LAMBDA, dt)
        break
      case 'map':
        dampVec(this.pos, this.mapPos, POS_LAMBDA, dt)
        dampVec(this.look, this.mapLook, LOOK_LAMBDA, dt)
        break
    }

    this.applyToCamera()
    this.notifyProgress()
  }

  private updateTravel(dt: number): void {
    if (this.velT !== 0) {
      this.targetT = clamp01(this.targetT + this.velT * dt)
      if (this.targetT <= 0 || this.targetT >= 1) {
        this.velT = 0 // ran into a path end — kill the fling
      } else {
        this.velT *= Math.exp(-FLING_DECAY * dt)
        if (Math.abs(this.velT) < VEL_SETTLE) {
          this.velT = 0
          this.snapToNearestStation()
        }
      }
    }

    // Single position damper: the displayed t eases toward the target; the pose
    // is read straight off the spline at that eased t.
    this._t = damp(this._t, this.targetT, POS_LAMBDA, dt)
    this.pos.copy(this.travelPos(this._t))
    dampVec(this.look, this.travelLook(this._t), LOOK_LAMBDA, dt)
  }

  /** On fling settle, glide the target onto the nearest station if close enough.
   *  This nudges `targetT`; the damper eases `_t` in — a soft pull, not a jump. */
  private snapToNearestStation(): void {
    const n = this.nearestTo(this.targetT)
    if (Math.abs(n.t - this.targetT) <= SNAP_RANGE) this.targetT = clamp01(n.t)
  }

  private applyToCamera(): void {
    this.camera.position.copy(this.pos)
    this.camera.lookAt(this.look)
  }

  private notifyProgress(): void {
    if (Math.abs(this._t - this.lastNotifiedT) <= PROGRESS_EPS) return
    this.lastNotifiedT = this._t
    for (const cb of this.progressCbs) cb(this._t)
  }

  nearestStation(): StationDef {
    return this.nearestTo(this._t)
  }

  onProgress(cb: (t: number) => void): void {
    this.progressCbs.push(cb)
  }
}
