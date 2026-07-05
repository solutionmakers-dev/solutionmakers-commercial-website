import * as THREE from 'three'
import type { MotifBuilder } from '../station'
import { BLUE, WHITE, buildStationBase, updateBase, focusScale, createSoftCircleTexture } from './common'

/**
 * orbits — the Consulting motif. Three tilted additive rings turning at
 * different speeds, each carrying a couple of small satellite spheres, wheeling
 * around the chrome core like senior minds circling a hard problem.
 */

const TUBE = 0.012
const RING_OPACITY = 0.5
const SAT_RADIUS = 0.06

// [radius, spin speed (rad/s), tilt as Euler xyz]. Tilts stay within ~0.55 rad
// of the group's XY plane (station groups face the path along +Z): the rings
// read as a layered orrery from the fly-past AND their extent toward the path
// stays ≤ ~1.1 units — the camera passes 2.2 units away, so it never clips
// through the outer (r 2.2) ring.
const RINGS: Array<{ r: number; speed: number; tilt: [number, number, number] }> = [
  { r: 1.2, speed: 0.5, tilt: [0.45, 0.15, 0] },
  { r: 1.7, speed: -0.34, tilt: [-0.35, -0.4, 0.1] },
  { r: 2.2, speed: 0.24, tilt: [0.2, 0.5, -0.15] },
]

// Six satellites total, spread across the three rings (indices + angular seed).
const SATELLITES: Array<{ ring: number; angle: number; blue: boolean }> = [
  { ring: 0, angle: 0, blue: false },
  { ring: 0, angle: Math.PI, blue: true },
  { ring: 1, angle: Math.PI * 0.4, blue: true },
  { ring: 1, angle: Math.PI * 1.3, blue: false },
  { ring: 2, angle: Math.PI * 0.7, blue: false },
  { ring: 2, angle: Math.PI * 1.6, blue: true },
]

export const orbits: MotifBuilder = (def, _tier) => {
  const base = buildStationBase(def)
  const motif = new THREE.Group()
  base.group.add(motif)

  const sprite = createSoftCircleTexture()
  const spinners: THREE.Group[] = []
  const ringMats: THREE.MeshBasicMaterial[] = []

  RINGS.forEach(({ r, tilt }, i) => {
    // A tilt group orients the orbital plane; a spinner inside it turns, so both
    // the ring and its satellites revolve together about the plane's normal.
    const plane = new THREE.Group()
    plane.rotation.set(tilt[0], tilt[1], tilt[2])
    const spinner = new THREE.Group()
    plane.add(spinner)
    motif.add(plane)
    spinners[i] = spinner

    const ringMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(i === 1 ? WHITE : BLUE),
      transparent: true,
      opacity: RING_OPACITY,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
    ringMats[i] = ringMat
    spinner.add(new THREE.Mesh(new THREE.TorusGeometry(r, TUBE, 8, 96), ringMat))
  })

  for (const sat of SATELLITES) {
    const mat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(sat.blue ? BLUE : WHITE),
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      map: sprite,
    })
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(SAT_RADIUS, 12, 12), mat)
    const r = RINGS[sat.ring]!.r
    mesh.position.set(Math.cos(sat.angle) * r, Math.sin(sat.angle) * r, 0)
    spinners[sat.ring]!.add(mesh)
  }

  return {
    group: base.group,
    core: base.core,
    update(dt, elapsed, focus) {
      updateBase(base, dt, elapsed, focus)
      RINGS.forEach(({ speed }, i) => {
        spinners[i]!.rotation.z += dt * speed
      })
      const s = focusScale(focus)
      motif.scale.setScalar(s)
      const op = RING_OPACITY * (1 + focus * 0.5)
      for (const m of ringMats) m.opacity = op
    },
  }
}
