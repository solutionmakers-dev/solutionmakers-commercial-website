import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { STATIONS, type StationDef, type Motif } from '../../content/content'
import { TIERS, type Tier } from '../../core/quality'
import { MOTIFS, Station, buildStations, type MotifBuild } from './station'

// The three station defs this task implements, keyed by motif.
const ORBITS_DEF = STATIONS.find((s) => s.motif === 'orbits') as StationDef
const GRID_DEF = STATIONS.find((s) => s.motif === 'grid') as StationDef
const SWARM_DEF = STATIONS.find((s) => s.motif === 'swarm') as StationDef

/** All descendants of `obj` that are instances of `ctor`. */
// `any[]` (not `never[]`) so TS infers T from generic three.js classes like Mesh/Points.
function descendants<T extends THREE.Object3D>(
  obj: THREE.Object3D,
  ctor: abstract new (...a: any[]) => T,
): T[] {
  const out: T[] = []
  obj.traverse((c) => {
    if (c instanceof ctor) out.push(c)
  })
  return out
}

function buildOrbits(tier: Tier = 2): MotifBuild {
  return MOTIFS.orbits!(ORBITS_DEF, tier)
}
function buildGrid(tier: Tier = 2): MotifBuild {
  return MOTIFS.grid!(GRID_DEF, tier)
}
function buildSwarm(tier: Tier = 2): MotifBuild {
  return MOTIFS.swarm!(SWARM_DEF, tier)
}

describe('MOTIFS registry', () => {
  it('defines exactly the three task-10 motifs and leaves the rest for task 11', () => {
    expect(typeof MOTIFS.orbits).toBe('function')
    expect(typeof MOTIFS.grid).toBe('function')
    expect(typeof MOTIFS.swarm).toBe('function')
    const later: Motif[] = ['circuit', 'satellites', 'contact']
    for (const m of later) expect(MOTIFS[m]).toBeUndefined()
  })
})

describe.each([
  ['orbits', buildOrbits],
  ['grid', buildGrid],
  ['swarm', buildSwarm],
] as const)('%s motif builder', (name, build) => {
  it('returns a Group with children and a core tap-target', () => {
    const m = build()
    expect(m.group).toBeInstanceOf(THREE.Group)
    expect(m.group.children.length).toBeGreaterThan(0)
    expect(m.core).toBeInstanceOf(THREE.Object3D)
    // The def used by each build() carries the matching id.
    const def = name === 'orbits' ? ORBITS_DEF : name === 'grid' ? GRID_DEF : SWARM_DEF
    expect(m.core.userData.stationId).toBe(def.id)
  })

  it('shares the station base: chrome icosahedron core + blue point light', () => {
    const m = build()
    const core = m.core as THREE.Mesh
    expect(core.geometry).toBeInstanceOf(THREE.IcosahedronGeometry)
    expect((core.geometry as THREE.IcosahedronGeometry).parameters.radius).toBeCloseTo(0.35)
    const mat = core.material as THREE.MeshStandardMaterial
    expect(mat.metalness).toBeGreaterThanOrEqual(0.85)
    expect(mat.emissive.getHexString()).toBe('3a63c8')

    const lights = descendants(m.group, THREE.PointLight)
    expect(lights.length).toBe(1)
    expect(lights[0]!.intensity).toBeCloseTo(6)
    expect(lights[0]!.distance).toBeCloseTo(9)
    expect(lights[0]!.color.getHexString()).toBe('3a63c8')
  })

  it('update(dt, elapsed, focus) advances without WebGL and does not throw at focus 0 or 1', () => {
    const m = build()
    expect(() => m.update(1 / 60, 0, 0)).not.toThrow()
    expect(() => m.update(1 / 60, 1.23, 1)).not.toThrow()
    expect(() => m.update(0, 9.87, 0.5)).not.toThrow()
  })
})

describe('orbits motif specifics', () => {
  it('has three additive torus rings at r 1.2 / 1.7 / 2.2 (tube 0.012)', () => {
    const tori = descendants(buildOrbits().group, THREE.Mesh).filter(
      (mesh) => mesh.geometry instanceof THREE.TorusGeometry,
    )
    expect(tori.length).toBe(3)
    const radii = tori
      .map((t) => (t.geometry as THREE.TorusGeometry).parameters.radius)
      .sort((a, b) => a - b)
    expect(radii[0]).toBeCloseTo(1.2)
    expect(radii[1]).toBeCloseTo(1.7)
    expect(radii[2]).toBeCloseTo(2.2)
    for (const t of tori) {
      expect((t.geometry as THREE.TorusGeometry).parameters.tube).toBeCloseTo(0.012)
      const mat = t.material as THREE.MeshBasicMaterial
      expect(mat.blending).toBe(THREE.AdditiveBlending)
      expect(mat.opacity).toBeCloseTo(0.5)
    }
  })

  it('parents six satellite spheres (r 0.06) on the rings', () => {
    const spheres = descendants(buildOrbits().group, THREE.Mesh).filter(
      (mesh) => mesh.geometry instanceof THREE.SphereGeometry,
    )
    expect(spheres.length).toBe(6)
    expect((spheres[0]!.geometry as THREE.SphereGeometry).parameters.radius).toBeCloseTo(0.06)
  })
})

describe('grid motif specifics', () => {
  it('has 15 glass tiles (5x3) with the spec standard material', () => {
    const tiles = descendants(buildGrid().group, THREE.Mesh).filter(
      (mesh) => mesh.geometry instanceof THREE.BoxGeometry,
    )
    expect(tiles.length).toBe(15)
    const mat = tiles[0]!.material as THREE.MeshStandardMaterial
    expect(mat.transparent).toBe(true)
    expect(mat.opacity).toBeCloseTo(0.18)
    expect(mat.metalness).toBeCloseTo(0.9)
    expect(mat.roughness).toBeCloseTo(0.25)
  })

  it('draws white edge line segments on the tiles', () => {
    const edges = descendants(buildGrid().group, THREE.LineSegments)
    expect(edges.length).toBeGreaterThanOrEqual(15)
  })
})

describe('swarm motif specifics', () => {
  it('has a point cloud whose count is 700 * tier particleScale', () => {
    for (const tier of [0, 1, 2] as Tier[]) {
      const points = descendants(buildSwarm(tier).group, THREE.Points)[0]!
      const expected = Math.round(700 * TIERS[tier].particleScale)
      expect(points.geometry.getAttribute('position').count).toBe(expected)
    }
    // Tier 0 must be a genuinely smaller cloud than tier 2.
    const lo = descendants(buildSwarm(0).group, THREE.Points)[0]!.geometry.getAttribute('position').count
    const hi = descendants(buildSwarm(2).group, THREE.Points)[0]!.geometry.getAttribute('position').count
    expect(lo).toBeLessThan(hi)
  })

  it('connects points with line segments (recomputed over time)', () => {
    const m = buildSwarm()
    const lines = descendants(m.group, THREE.LineSegments)
    expect(lines.length).toBe(1)
    // Advancing past the 0.5s recompute window must not throw.
    expect(() => {
      for (let i = 0; i < 60; i++) m.update(1 / 60, i / 60, 0.4)
    }).not.toThrow()
  })
})

describe('Station', () => {
  const anchor = new THREE.Vector3(2, 0, -14)

  it('places its group at the anchor and exposes the core tap target', () => {
    const st = new Station(ORBITS_DEF, MOTIFS.orbits!, anchor, 2)
    expect(st.group.position.distanceTo(anchor)).toBeLessThan(1e-6)
    expect(st.core.userData.stationId).toBe(ORBITS_DEF.id)
    expect(st.def).toBe(ORBITS_DEF)
  })

  it('setActive(false) hides the group and halts updates', () => {
    const st = new Station(ORBITS_DEF, MOTIFS.orbits!, anchor, 2)
    st.update(1 / 60, 0.1) // prime one frame
    const spun = st.core.rotation.y
    st.setActive(false)
    expect(st.group.visible).toBe(false)
    st.update(1 / 60, 0.2)
    st.update(1 / 60, 0.3)
    expect(st.core.rotation.y).toBe(spun) // frozen while inactive
    st.setActive(true)
    expect(st.group.visible).toBe(true)
    st.update(1 / 60, 0.4)
    expect(st.core.rotation.y).not.toBe(spun) // resumes
  })

  it('setFocus(1) does not throw and update stays finite', () => {
    const st = new Station(GRID_DEF, MOTIFS.grid!, anchor, 2)
    expect(() => st.setFocus(1)).not.toThrow()
    expect(() => st.update(1 / 60, 0.5)).not.toThrow()
    expect(Number.isFinite(st.core.rotation.y)).toBe(true)
  })

  it('update advances the motif (core spins) with WebGL absent', () => {
    const st = new Station(SWARM_DEF, MOTIFS.swarm!, anchor, 2)
    const before = st.core.rotation.y
    st.update(1 / 60, 0.5)
    expect(st.core.rotation.y).not.toBe(before)
  })
})

describe('buildStations', () => {
  it('builds one Station per def whose motif is implemented, at its anchor', () => {
    const anchors = new Map<string, THREE.Vector3>()
    const rig = {
      stationAnchor(id: string): THREE.Vector3 {
        const v = new THREE.Vector3(Math.random(), 0, -Math.random() * 40)
        anchors.set(id, v)
        return v
      },
    }
    const stations = buildStations(STATIONS, rig, 2)
    // Only orbits/grid/swarm are implemented this task.
    expect(stations.map((s) => s.def.motif).sort()).toEqual(['grid', 'orbits', 'swarm'])
    for (const s of stations) {
      const a = anchors.get(s.def.id)!
      expect(s.group.position.distanceTo(a)).toBeLessThan(1e-6)
      expect(s.core.userData.stationId).toBe(s.def.id)
    }
  })
})
