import * as THREE from 'three'
import type { MotifBuilder } from '../station'
import { BLUE, buildStationBase, updateBase, focusScale } from './common'

/**
 * satellites — the R&D Lab motif. Four venture "moons" on their own tilted
 * orbits around the lab core, each a solid emissive-blue sphere carrying the
 * `userData.satelliteId` of the venture it represents (consumer / real-estate /
 * trade / health) so navigation can raycast and dive into them later. Thin
 * orbit hairlines make the family structure legible from the fly-past.
 */

const ORBITER_RADIUS = 0.16
const LINE_OPACITY = 0.3
const LINE_SEGMENTS = 128
const EMISSIVE_BASE = 0.7
const EMISSIVE_PULSE = 0.25

// One entry per def satellite, in order: orbit radius (1.3–2.4), spin speed
// (rad/s), inclination Euler and starting angle. Tilts stay ≤ ~0.45 rad off the
// group's XY plane so the outer orbit's extent toward the path (~r·sin(tilt))
// stays under the 2.2-unit camera clearance — same discipline as `orbits`.
const ORBITS: Array<{
  r: number
  speed: number
  tilt: [number, number, number]
  angle: number
}> = [
  { r: 1.3, speed: 0.5, tilt: [0.35, 0.12, 0], angle: 0.4 },
  { r: 1.65, speed: -0.38, tilt: [-0.28, -0.3, 0.1], angle: 2.1 },
  { r: 2.0, speed: 0.3, tilt: [0.22, 0.42, -0.12], angle: 4.0 },
  { r: 2.4, speed: -0.24, tilt: [-0.4, 0.18, 0.06], angle: 5.3 },
]

function orbitLine(r: number, mat: THREE.LineBasicMaterial): THREE.LineLoop {
  const pts: THREE.Vector3[] = []
  for (let i = 0; i < LINE_SEGMENTS; i++) {
    const a = (i / LINE_SEGMENTS) * Math.PI * 2
    pts.push(new THREE.Vector3(Math.cos(a) * r, Math.sin(a) * r, 0))
  }
  return new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts), mat)
}

export const satellites: MotifBuilder = (def, _tier) => {
  const base = buildStationBase(def)
  const motif = new THREE.Group()
  base.group.add(motif)

  const lineMat = new THREE.LineBasicMaterial({
    color: new THREE.Color(BLUE),
    transparent: true,
    opacity: LINE_OPACITY,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  })

  const defs = def.satellites ?? []
  const spinners: THREE.Group[] = []
  const orbiterMats: THREE.MeshStandardMaterial[] = []

  ORBITS.forEach((cfg, i) => {
    const sat = defs[i]
    if (!sat) return

    // Plane group sets the orbit's inclination; the spinner inside revolves, so
    // the orbiter and (symmetric) orbit line share one coordinate frame.
    const plane = new THREE.Group()
    plane.rotation.set(cfg.tilt[0], cfg.tilt[1], cfg.tilt[2])
    motif.add(plane)
    plane.add(orbitLine(cfg.r, lineMat))

    const spinner = new THREE.Group()
    spinner.rotation.z = cfg.angle
    plane.add(spinner)
    spinners.push(spinner)

    const mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color('#1d2f55'),
      metalness: 0.6,
      roughness: 0.35,
      emissive: new THREE.Color(BLUE),
      emissiveIntensity: EMISSIVE_BASE,
    })
    orbiterMats.push(mat)
    const orbiter = new THREE.Mesh(new THREE.SphereGeometry(ORBITER_RADIUS, 24, 24), mat)
    orbiter.position.set(cfg.r, 0, 0)
    // The future tap target: navigation raycasts for this id to dive in.
    orbiter.userData.satelliteId = sat.id
    spinner.add(orbiter)
  })

  return {
    group: base.group,
    core: base.core,
    update(dt, elapsed, focus) {
      updateBase(base, dt, elapsed, focus)
      spinners.forEach((spinner, i) => {
        spinner.rotation.z += dt * ORBITS[i]!.speed
      })
      // Staggered emissive shimmer so the four ventures read as independently alive.
      orbiterMats.forEach((mat, i) => {
        mat.emissiveIntensity =
          EMISSIVE_BASE + EMISSIVE_PULSE * (0.5 + 0.5 * Math.sin(elapsed * 1.2 + i * 1.7)) + focus * 0.3
      })
      motif.scale.setScalar(focusScale(focus))
      lineMat.opacity = LINE_OPACITY * (1 + focus * 0.8)
    },
  }
}
