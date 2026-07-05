import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { STATIONS } from '../content/content'
import { CameraRig, PATH_POINTS } from '../nav/cameraRig'
import { buildStations, type Station } from './stations/station'
import { Constellation } from './constellation'

/**
 * Constellation smoke tests — node env (no WebGL, no document). Canvas-texture
 * creation inside the constellation must be guarded exactly like
 * `createDustTexture` in environment.ts, so construction here never throws.
 */

function makeWorld(): { stations: Station[]; anchors: Map<string, THREE.Vector3>; con: Constellation } {
  const camera = new THREE.PerspectiveCamera(62, 16 / 9, 0.1, 200)
  const rig = new CameraRig(camera, STATIONS)
  const stations = buildStations(STATIONS, rig, 2)
  const anchors = new Map<string, THREE.Vector3>(STATIONS.map((s) => [s.id, rig.stationAnchor(s.id)]))
  return { stations, anchors, con: new Constellation(stations, anchors) }
}

/** All descendants of `obj` matching a predicate. */
function collect(obj: THREE.Object3D, pred: (o: THREE.Object3D) => boolean): THREE.Object3D[] {
  const out: THREE.Object3D[] = []
  obj.traverse((c) => {
    if (pred(c)) out.push(c)
  })
  return out
}

/** The enlarged invisible hit spheres carry `userData.stationId`. */
function hitSpheres(con: Constellation): THREE.Mesh[] {
  return collect(con.group, (o) => o instanceof THREE.Mesh && o.userData.stationId !== undefined) as THREE.Mesh[]
}

/** A raycaster shooting straight down from `height` above `(x, z)`. */
function rayDown(x: number, z: number, height = 50): THREE.Raycaster {
  return new THREE.Raycaster(new THREE.Vector3(x, height, z), new THREE.Vector3(0, -1, 0))
}

describe('Constellation — construction (node env, no document)', () => {
  it('constructs without throwing and exposes a group', () => {
    const { con } = makeWorld()
    expect(con.group).toBeInstanceOf(THREE.Group)
    expect(con.group.children.length).toBeGreaterThan(0)
  })

  it('starts hidden — the map layer only shows in map mode', () => {
    const { con } = makeWorld()
    expect(con.group.visible).toBe(false)
  })

  it('places one node per station, exactly at its rig anchor (±1e-6)', () => {
    const { con, anchors } = makeWorld()
    const spheres = hitSpheres(con)
    expect(spheres.length).toBe(STATIONS.length) // 6
    con.group.updateMatrixWorld(true)
    for (const s of spheres) {
      const anchor = anchors.get(s.userData.stationId as string)
      expect(anchor).toBeDefined()
      const world = s.getWorldPosition(new THREE.Vector3())
      expect(world.distanceTo(anchor!)).toBeLessThan(1e-6)
    }
  })

  it('gives every hit sphere radius 1.2', () => {
    const { con } = makeWorld()
    for (const s of hitSpheres(con)) {
      const geo = s.geometry as THREE.SphereGeometry
      expect(geo).toBeInstanceOf(THREE.SphereGeometry)
      expect(geo.parameters.radius).toBeCloseTo(1.2)
    }
  })

  it('links the nodes with a Line sampled along the travel spline (additive, white 25%)', () => {
    const { con } = makeWorld()
    const lines = collect(
      con.group,
      (o) => o instanceof THREE.Line && !(o instanceof THREE.LineSegments),
    ) as THREE.Line[]
    expect(lines.length).toBeGreaterThanOrEqual(1)
    const spline = lines.find((l) => l.geometry.getAttribute('position').count >= 120)!
    expect(spline).toBeDefined()
    const mat = spline.material as THREE.LineBasicMaterial
    expect(mat.blending).toBe(THREE.AdditiveBlending)
    expect(mat.transparent).toBe(true)
    expect(mat.opacity).toBeCloseTo(0.25)
    // First and last samples land on the path's endpoints.
    const pos = spline.geometry.getAttribute('position') as THREE.BufferAttribute
    const first = new THREE.Vector3(pos.getX(0), pos.getY(0), pos.getZ(0))
    const lastI = pos.count - 1
    const last = new THREE.Vector3(pos.getX(lastI), pos.getY(lastI), pos.getZ(lastI))
    expect(first.distanceTo(PATH_POINTS[0]!)).toBeLessThan(1e-4)
    expect(last.distanceTo(PATH_POINTS[PATH_POINTS.length - 1]!)).toBeLessThan(1e-4)
  })
})

describe('Constellation — nodeAt hit testing', () => {
  it('returns the station id for a ray aimed straight down at each node', () => {
    const { con, anchors } = makeWorld()
    con.setVisible(true)
    for (const def of STATIONS) {
      const a = anchors.get(def.id)!
      expect(con.nodeAt(rayDown(a.x, a.z))).toBe(def.id)
    }
  })

  it('returns null for a ray aimed far off the path', () => {
    const { con } = makeWorld()
    con.setVisible(true)
    expect(con.nodeAt(rayDown(500, 500))).toBeNull()
    expect(con.nodeAt(rayDown(0, 400))).toBeNull()
  })

  it('hit-tests through the enlarged r=1.2 sphere, not just the visual point', () => {
    const { con, anchors } = makeWorld()
    con.setVisible(true)
    const a = anchors.get(STATIONS[0]!.id)!
    // 1 unit off-centre still hits (inside r=1.2)...
    expect(con.nodeAt(rayDown(a.x + 1.0, a.z))).toBe(STATIONS[0]!.id)
    // ...well outside r=1.2 (and any neighbour) misses.
    expect(con.nodeAt(rayDown(a.x + 30, a.z))).toBeNull()
  })

  it('returns null when hidden, even if the ray hits a node; resumes after setVisible(true)', () => {
    const { con, anchors } = makeWorld()
    const a = anchors.get(STATIONS[0]!.id)!
    const ray = rayDown(a.x, a.z)
    // While hidden (default), nodeAt is inert.
    expect(con.group.visible).toBe(false)
    expect(con.nodeAt(ray)).toBeNull()
    // After setVisible(true), the same ray hits.
    con.setVisible(true)
    expect(con.nodeAt(ray)).toBe(STATIONS[0]!.id)
  })
})

describe('Constellation — visibility & fade', () => {
  it('setVisible(true) shows the group; setVisible(false) hides it', () => {
    const { con } = makeWorld()
    con.setVisible(true)
    expect(con.group.visible).toBe(true)
    con.setVisible(false)
    expect(con.group.visible).toBe(false)
  })

  it('setVisible(true, p) scales fadeable material opacity by p', () => {
    const { con } = makeWorld()
    con.setVisible(true, 1)
    const line = collect(
      con.group,
      (o) => o instanceof THREE.Line && !(o instanceof THREE.LineSegments),
    )[0] as THREE.Line
    const mat = line.material as THREE.LineBasicMaterial
    const full = mat.opacity
    con.setVisible(true, 0.5)
    expect(mat.opacity).toBeCloseTo(full * 0.5)
    con.setVisible(true, 1)
    expect(mat.opacity).toBeCloseTo(full)
  })
})

describe('Constellation — current-station ring', () => {
  it('setCurrent(id) shows a ring at that node; setCurrent(null) hides it', () => {
    const { con, anchors } = makeWorld()
    const ring = collect(con.group, (o) => o.userData.isCurrentRing === true)[0]!
    expect(ring).toBeDefined()
    con.setCurrent('ai')
    expect(ring.visible).toBe(true)
    con.group.updateMatrixWorld(true)
    const world = ring.getWorldPosition(new THREE.Vector3())
    expect(world.distanceTo(anchors.get('ai')!)).toBeLessThan(1e-6)
    con.setCurrent(null)
    expect(ring.visible).toBe(false)
    con.setCurrent('nope-not-a-station')
    expect(ring.visible).toBe(false)
  })
})

describe('Constellation — update & label stability', () => {
  it('update(dt, elapsed) runs without throwing (no WebGL)', () => {
    const { con } = makeWorld()
    expect(() => con.update(1 / 60, 0)).not.toThrow()
    expect(() => con.update(1 / 60, 1.234)).not.toThrow()
    expect(() => con.update(0, 99)).not.toThrow()
  })

  it('generates labels once: total descendant count is stable across updates and visibility flips', () => {
    const { con } = makeWorld()
    const countAll = (): number => collect(con.group, () => true).length
    const before = countAll()
    for (let i = 0; i < 30; i++) con.update(1 / 60, i / 60)
    con.setVisible(true)
    con.update(1 / 60, 1)
    con.setVisible(false)
    con.update(1 / 60, 2)
    con.setCurrent('software')
    con.update(1 / 60, 3)
    expect(countAll()).toBe(before)
  })
})
