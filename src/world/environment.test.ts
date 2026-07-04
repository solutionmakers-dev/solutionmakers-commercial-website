import { describe, it, expect, vi } from 'vitest'
import * as THREE from 'three'
import { Environment } from './environment'
import { PATH_POINTS } from '../nav/cameraRig'

/** The dust field is the sole THREE.Points child of the group. */
function findDust(env: Environment): THREE.Points {
  const dust = env.group.children.find((c): c is THREE.Points => c instanceof THREE.Points)
  if (!dust) throw new Error('no THREE.Points found in Environment.group')
  return dust
}

/** The arrival cone lives in its own subgroup so both meshes rotate together. */
function findConeGroup(env: Environment): THREE.Group {
  const group = env.group.children.find(
    (c): c is THREE.Group => c instanceof THREE.Group && c.children.every((child) => child instanceof THREE.Mesh),
  )
  if (!group) throw new Error('no cone THREE.Group found in Environment.group')
  return group
}

function findSky(env: Environment): THREE.Mesh {
  const sky = env.group.children.find(
    (c): c is THREE.Mesh => c instanceof THREE.Mesh && c.geometry instanceof THREE.SphereGeometry,
  )
  if (!sky) throw new Error('no sky sphere found in Environment.group')
  return sky
}

describe('Environment — construction (no WebGL required)', () => {
  it('constructs with pure geometry/material creation and has at least 3 group children', () => {
    const env = new Environment(2)
    expect(env.group).toBeInstanceOf(THREE.Group)
    expect(env.group.children.length).toBeGreaterThanOrEqual(3)
  })

  it('(a) has a gradient sky sphere: radius 100, BackSide, vertex colors', () => {
    const env = new Environment(2)
    const sky = findSky(env)
    const geo = sky.geometry as THREE.SphereGeometry
    expect(geo.parameters.radius).toBe(100)
    const mat = sky.material as THREE.MeshBasicMaterial
    expect(mat.side).toBe(THREE.BackSide)
    expect(mat.vertexColors).toBe(true)
    expect(geo.getAttribute('color')).toBeDefined()
    // The sphere sits past the scene fog's `far` (55); fog must be disabled
    // on it specifically or the gradient flattens into a solid fog colour.
    expect(mat.fog).toBe(false)
  })

  it('(b) has a dust Points field sized 1400 * particleScale, with additive/transparent material', () => {
    const env2 = new Environment(2)
    expect(findDust(env2).geometry.getAttribute('position').count).toBe(1400)

    const env1 = new Environment(1)
    expect(findDust(env1).geometry.getAttribute('position').count).toBe(980)

    const env0 = new Environment(0)
    expect(findDust(env0).geometry.getAttribute('position').count).toBe(490)

    const mat = findDust(env2).material as THREE.PointsMaterial
    expect(mat.size).toBeCloseTo(0.045)
    expect(mat.opacity).toBeCloseTo(0.5)
    expect(mat.transparent).toBe(true)
    expect(mat.blending).toBe(THREE.AdditiveBlending)
    expect(mat.depthWrite).toBe(false)
    expect(mat.vertexColors).toBe(true)
  })

  it('(b) colors ~20% of dust points brand blue, the rest white', () => {
    const env = new Environment(2)
    const colors = findDust(env).geometry.getAttribute('color') as THREE.BufferAttribute
    const blue = new THREE.Color('#3A63C8')
    let blueCount = 0
    for (let i = 0; i < colors.count; i++) {
      if (
        Math.abs(colors.getX(i) - blue.r) < 1e-4 &&
        Math.abs(colors.getY(i) - blue.g) < 1e-4 &&
        Math.abs(colors.getZ(i) - blue.b) < 1e-4
      ) {
        blueCount++
      }
    }
    expect(blueCount / colors.count).toBeCloseTo(0.2, 1)
  })

  it('(b) dust points sit within the tube radius (14) of the path', () => {
    const env = new Environment(2)
    const pos = findDust(env).geometry.getAttribute('position') as THREE.BufferAttribute

    // Build the same curve and sample it densely
    const curve = new THREE.CatmullRomCurve3(PATH_POINTS)
    const curvePoints = curve.getPoints(200)

    for (let i = 0; i < pos.count; i++) {
      const p = new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i))

      // First verify the point is finite
      expect(Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z)).toBe(true)

      // Find minimum distance from this dust point to any curve sample point
      let minDist = Infinity
      for (const curvePoint of curvePoints) {
        const dist = p.distanceTo(curvePoint)
        if (dist < minDist) minDist = dist
      }

      // Assert minimum distance is within tube radius (14) plus small sampling error slack (0.5)
      expect(minDist).toBeLessThanOrEqual(14.5)
    }
  })

  it('(c) has two nested open-ended cones with the spec radii/height and opacities', () => {
    const env = new Environment(2)
    const coneGroup = findConeGroup(env)
    expect(coneGroup.children.length).toBe(2)

    const meshes = coneGroup.children as THREE.Mesh[]
    const geoms = meshes.map((m) => m.geometry as THREE.CylinderGeometry)
    const mats = meshes.map((m) => m.material as THREE.MeshBasicMaterial)

    // outer cone: radiusTop 0.4 -> radiusBottom 5.5, height 14, opacity 0.07
    const outerIdx = mats.findIndex((m) => Math.abs(m.opacity - 0.07) < 1e-6)
    const innerIdx = mats.findIndex((m) => Math.abs(m.opacity - 0.1) < 1e-6)
    expect(outerIdx).toBeGreaterThanOrEqual(0)
    expect(innerIdx).toBeGreaterThanOrEqual(0)

    const outerGeo = geoms[outerIdx]!
    expect(outerGeo.parameters.radiusTop).toBeCloseTo(0.4)
    expect(outerGeo.parameters.radiusBottom).toBeCloseTo(5.5)
    expect(outerGeo.parameters.height).toBe(14)
    expect(outerGeo.parameters.openEnded).toBe(true)

    for (const m of mats) {
      expect(m.blending).toBe(THREE.AdditiveBlending)
      expect(m.depthWrite).toBe(false)
      expect(m.side).toBe(THREE.DoubleSide)
      expect(m.transparent).toBe(true)
    }
  })

  it('(c) positions the cone above the path start, tip up around y≈8', () => {
    const env = new Environment(2)
    const coneGroup = findConeGroup(env)
    // Local +height/2 (7) is the narrow (radiusTop) end; tip world y = group.y + 7 ≈ 8.
    expect(coneGroup.position.y + 7).toBeCloseTo(8, 0)
  })
})

describe('Environment — applyTier', () => {
  it('applyTier(0) reduces the dust point count', () => {
    const env = new Environment(2)
    const before = findDust(env).geometry.getAttribute('position').count
    env.applyTier(0)
    const after = findDust(env).geometry.getAttribute('position').count
    expect(after).toBeLessThan(before)
    expect(after).toBe(490)
  })

  it('disposes the old dust geometry when rebuilding (no leak)', () => {
    const env = new Environment(2)
    const oldPoints = findDust(env)
    const oldGeometry = oldPoints.geometry
    const disposeSpy = vi.spyOn(oldGeometry, 'dispose')

    env.applyTier(0)

    // The old geometry's dispose method was called
    expect(disposeSpy).toHaveBeenCalledTimes(1)
    // The old Points object is no longer a child of the group
    expect(env.group.children.includes(oldPoints)).toBe(false)
  })

  it('leaves exactly one dust field in the group after repeated tier changes', () => {
    const env = new Environment(0)
    env.applyTier(1)
    env.applyTier(2)
    env.applyTier(0)
    const dustChildren = env.group.children.filter((c) => c instanceof THREE.Points)
    expect(dustChildren.length).toBe(1)
  })
})

describe('Environment — update', () => {
  it('runs without throwing across a range of dt/elapsed/cameraZ', () => {
    const env = new Environment(1)
    expect(() => env.update(1 / 60, 0, 0)).not.toThrow()
    expect(() => env.update(1 / 60, 1.2345, -40)).not.toThrow()
    expect(() => env.update(0, 999, -82)).not.toThrow()
  })

  it('drifts dust positions away from their base over elapsed time', () => {
    const env = new Environment(2)
    const dust = findDust(env)
    const pos = dust.geometry.getAttribute('position') as THREE.BufferAttribute
    const before = pos.array.slice()
    const versionBefore = pos.version

    env.update(1 / 60, 5, 0)

    let moved = false
    for (let i = 0; i < pos.array.length; i++) {
      if (Math.abs((pos.array as Float32Array)[i]! - (before as Float32Array)[i]!) > 1e-6) {
        moved = true
        break
      }
    }
    expect(moved).toBe(true)
    // `needsUpdate` is a setter-only accessor that bumps `version`; that bump
    // is the observable proof the attribute was flagged dirty for the GPU.
    expect(pos.version).toBeGreaterThan(versionBefore)
  })

  it('slowly rotates the arrival cone group', () => {
    const env = new Environment(2)
    const coneGroup = findConeGroup(env)
    const before = coneGroup.rotation.y
    env.update(1, 1, 0)
    expect(coneGroup.rotation.y).not.toBe(before)
  })

  it('recenters the sky sphere on the camera Z so the void stays enveloping', () => {
    const env = new Environment(2)
    env.update(1 / 60, 0.5, -37)
    const sky = findSky(env)
    expect(sky.position.z).toBeCloseTo(-37)
  })
})
