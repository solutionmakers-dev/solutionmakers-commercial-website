import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { STATIONS, type StationDef, type Motif } from '../../content/content'
import { TIERS, type Tier } from '../../core/quality'
import { MOTIFS, Station, buildStations, type MotifBuild } from './station'

// Station defs keyed by motif. Task 10 shipped orbits/grid/swarm; task 11 adds
// circuit/satellites/contact.
const ORBITS_DEF = STATIONS.find((s) => s.motif === 'orbits') as StationDef
const GRID_DEF = STATIONS.find((s) => s.motif === 'grid') as StationDef
const SWARM_DEF = STATIONS.find((s) => s.motif === 'swarm') as StationDef
const CIRCUIT_DEF = STATIONS.find((s) => s.motif === 'circuit') as StationDef
const SATELLITES_DEF = STATIONS.find((s) => s.motif === 'satellites') as StationDef
const CONTACT_DEF = STATIONS.find((s) => s.motif === 'contact') as StationDef

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
function buildCircuit(tier: Tier = 2): MotifBuild {
  return MOTIFS.circuit!(CIRCUIT_DEF, tier)
}
function buildSatellites(tier: Tier = 2): MotifBuild {
  return MOTIFS.satellites!(SATELLITES_DEF, tier)
}
function buildContact(tier: Tier = 2): MotifBuild {
  return MOTIFS.contact!(CONTACT_DEF, tier)
}

const DEF_BY_NAME: Record<string, StationDef> = {
  orbits: ORBITS_DEF,
  grid: GRID_DEF,
  swarm: SWARM_DEF,
  circuit: CIRCUIT_DEF,
  satellites: SATELLITES_DEF,
  contact: CONTACT_DEF,
}

describe('MOTIFS registry', () => {
  it('defines all six station motifs (task 10 + task 11)', () => {
    const all: Motif[] = ['orbits', 'grid', 'swarm', 'circuit', 'satellites', 'contact']
    for (const m of all) expect(typeof MOTIFS[m]).toBe('function')
  })
})

describe.each([
  ['orbits', buildOrbits],
  ['grid', buildGrid],
  ['swarm', buildSwarm],
  ['circuit', buildCircuit],
  ['satellites', buildSatellites],
  ['contact', buildContact],
] as const)('%s motif builder', (name, build) => {
  it('returns a Group with children and a core tap-target', () => {
    const m = build()
    expect(m.group).toBeInstanceOf(THREE.Group)
    expect(m.group.children.length).toBeGreaterThan(0)
    expect(m.core).toBeInstanceOf(THREE.Object3D)
    // The def used by each build() carries the matching id.
    expect(m.core.userData.stationId).toBe(DEF_BY_NAME[name]!.id)
  })

  it('shares the station base: dark-chrome icosahedron core + blue point light', () => {
    const m = build()
    const core = m.core as THREE.Mesh
    expect(core.geometry).toBeInstanceOf(THREE.IcosahedronGeometry)
    expect((core.geometry as THREE.IcosahedronGeometry).parameters.radius).toBeCloseTo(0.35)
    const mat = core.material as THREE.MeshStandardMaterial
    expect(mat.metalness).toBeGreaterThanOrEqual(0.85)
    expect(mat.emissive.getHexString()).toBe('3a63c8')
    // Task 11 core tune: dark chrome with a blue heart — darker base color,
    // lower roughness, brighter emissive base (0.25 -> 0.45).
    expect(mat.roughness).toBeCloseTo(0.2)
    expect(mat.emissiveIntensity).toBeCloseTo(0.45)

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

describe('circuit motif specifics', () => {
  it('wires a wireframe slab device (EdgesGeometry line segments)', () => {
    const edges = descendants(buildCircuit().group, THREE.LineSegments).filter(
      (l) => l.geometry instanceof THREE.EdgesGeometry,
    )
    expect(edges.length).toBeGreaterThanOrEqual(1)
  })

  it('runs 12 PCB traces (thin tubes) out from the device edges', () => {
    const tubes = descendants(buildCircuit().group, THREE.Mesh).filter(
      (mesh) => mesh.geometry instanceof THREE.TubeGeometry,
    )
    expect(tubes.length).toBe(12)
    expect((tubes[0]!.geometry as THREE.TubeGeometry).parameters.radius).toBeCloseTo(0.008)
  })

  it('sends 12 pulse sprites (additive planes) travelling the traces', () => {
    const m = buildCircuit()
    const pulses = descendants(m.group, THREE.Mesh).filter(
      (mesh) => mesh.geometry instanceof THREE.PlaneGeometry,
    )
    expect(pulses.length).toBe(12)
    const mat = pulses[0]!.material as THREE.MeshBasicMaterial
    expect(mat.blending).toBe(THREE.AdditiveBlending)
    // Pulses ride their trace paths — advancing time moves them without throwing.
    const before = pulses[0]!.position.clone()
    for (let i = 0; i < 30; i++) m.update(1 / 60, i / 60, 0.5)
    expect(pulses[0]!.position.distanceTo(before)).toBeGreaterThan(0)
  })
})

describe('satellites motif specifics', () => {
  it('exposes exactly 4 orbiters carrying satelliteId matching the def ids', () => {
    const m = buildSatellites()
    const orbiters: THREE.Object3D[] = []
    m.group.traverse((o) => {
      if (o.userData.satelliteId !== undefined) orbiters.push(o)
    })
    expect(orbiters.length).toBe(4)
    const ids = orbiters.map((o) => o.userData.satelliteId as string).sort()
    const defIds = SATELLITES_DEF.satellites!.map((s) => s.id).sort()
    expect(ids).toEqual(defIds)
  })

  it('makes the orbiters r 0.16 emissive-blue spheres on tilted orbit rings', () => {
    const m = buildSatellites()
    const orbiters: THREE.Mesh[] = []
    m.group.traverse((o) => {
      if (o.userData.satelliteId !== undefined && o instanceof THREE.Mesh) orbiters.push(o)
    })
    expect(orbiters.length).toBe(4)
    for (const o of orbiters) {
      expect(o.geometry).toBeInstanceOf(THREE.SphereGeometry)
      expect((o.geometry as THREE.SphereGeometry).parameters.radius).toBeCloseTo(0.16)
      const mat = o.material as THREE.MeshStandardMaterial
      expect(mat.emissive.getHexString()).toBe('3a63c8')
    }
    // A thin orbit line per orbiter.
    const lines = descendants(m.group, THREE.Line).filter((l) => !(l instanceof THREE.LineSegments))
    expect(lines.length).toBeGreaterThanOrEqual(4)
  })

  it('advances the orbiters when updated (they revolve)', () => {
    const m = buildSatellites()
    const orbiter = (() => {
      let hit: THREE.Object3D | undefined
      m.group.traverse((o) => {
        if (!hit && o.userData.satelliteId !== undefined) hit = o
      })
      return hit!
    })()
    const before = orbiter.getWorldPosition(new THREE.Vector3())
    for (let i = 0; i < 30; i++) m.update(1 / 60, i / 60, 0.5)
    const after = orbiter.getWorldPosition(new THREE.Vector3())
    expect(after.distanceTo(before)).toBeGreaterThan(0)
  })
})

describe('contact motif specifics', () => {
  it('has a bright emissive-white beacon core sphere (r 0.3)', () => {
    const spheres = descendants(buildContact().group, THREE.Mesh).filter(
      (mesh) =>
        mesh.geometry instanceof THREE.SphereGeometry &&
        Math.abs((mesh.geometry as THREE.SphereGeometry).parameters.radius - 0.3) < 1e-6,
    )
    expect(spheres.length).toBe(1)
    const mat = spheres[0]!.material as THREE.MeshStandardMaterial
    expect(mat.emissive.getHexString()).toBe('ffffff')
  })

  it('breathes: the r 1.6 icosahedron cage scale changes over elapsed time', () => {
    const m = buildContact()
    const cage = descendants(m.group, THREE.Mesh).find(
      (mesh) =>
        mesh.geometry instanceof THREE.IcosahedronGeometry &&
        Math.abs((mesh.geometry as THREE.IcosahedronGeometry).parameters.radius - 1.6) < 1e-6,
    )!
    expect(cage).toBeDefined()
    m.update(0, 0, 0.5)
    const s0 = cage.scale.x
    m.update(0, 2, 0.5)
    const s2 = cage.scale.x
    expect(s2).not.toBeCloseTo(s0)
  })

  it('rings the beacon with 80 converging/diverging points', () => {
    const m = buildContact()
    const points = descendants(m.group, THREE.Points)[0]!
    expect(points.geometry.getAttribute('position').count).toBe(80)
    // The ring pulses in/out — advancing time moves its points without throwing.
    const attr = points.geometry.getAttribute('position') as THREE.BufferAttribute
    const x0 = attr.getX(0)
    for (let i = 0; i < 30; i++) m.update(1 / 60, i / 60, 0.5)
    expect(attr.getX(0)).not.toBe(x0)
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
    // All six motifs are implemented now (task 10 + task 11).
    expect(stations.map((s) => s.def.motif).sort()).toEqual([
      'circuit',
      'contact',
      'grid',
      'orbits',
      'satellites',
      'swarm',
    ])
    for (const s of stations) {
      const a = anchors.get(s.def.id)!
      expect(s.group.position.distanceTo(a)).toBeLessThan(1e-6)
      expect(s.core.userData.stationId).toBe(s.def.id)
    }
  })
})
