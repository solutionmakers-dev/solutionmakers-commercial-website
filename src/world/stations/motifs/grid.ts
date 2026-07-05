import * as THREE from 'three'
import type { MotifBuilder } from '../station'
import { WHITE, buildStationBase, updateBase, focusScale } from './common'

/**
 * grid — the Software Products motif. A 5x3 wall of smoked-glass tiles bent
 * around a cylindrical arc, each tile bobbing on a staggered phase so the whole
 * surface shimmers like a bank of screens. White hairline edges catch the light.
 */

const COLS = 5
const ROWS = 3
const ARC_RADIUS = 3
const COL_STEP = 0.34 // radians between columns
const ROW_STEP = 0.72 // world units between rows
const TILE_W = 0.82
const TILE_H = 0.5
const TILE_D = 0.05

const TILE_OPACITY = 0.18
const EDGE_OPACITY = 0.12
const FLOAT_AMPLITUDE = 0.07
const FLOAT_SPEED = 0.8
const FLOAT_PHASE_STEP = 0.55 // radians of phase per tile index -> staggered wave

interface Tile {
  mesh: THREE.Mesh
  baseY: number
  phase: number
}

export const grid: MotifBuilder = (def, _tier) => {
  const base = buildStationBase(def)
  const motif = new THREE.Group()
  base.group.add(motif)

  const tileMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#8fa6d8'),
    transparent: true,
    opacity: TILE_OPACITY,
    metalness: 0.9,
    roughness: 0.25,
    side: THREE.DoubleSide,
  })
  const edgeMat = new THREE.LineBasicMaterial({
    color: new THREE.Color(WHITE),
    transparent: true,
    opacity: EDGE_OPACITY,
  })

  const tileGeo = new THREE.BoxGeometry(TILE_W, TILE_H, TILE_D)
  const edgeGeo = new THREE.EdgesGeometry(tileGeo)

  const tiles: Tile[] = []
  let index = 0
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const angle = (col - (COLS - 1) / 2) * COL_STEP
      const y = (row - (ROWS - 1) / 2) * ROW_STEP
      // -Z: the wall curves BEHIND the core (station groups face the path along
      // +Z), so from the path/dive side it reads as a backdrop bank of screens.
      const x = Math.sin(angle) * ARC_RADIUS
      const z = -Math.cos(angle) * ARC_RADIUS

      const tile = new THREE.Mesh(tileGeo, tileMat)
      tile.position.set(x, y, z)
      tile.lookAt(0, y, 0) // curve each tile tangent to the cylinder, facing the core
      tile.add(new THREE.LineSegments(edgeGeo, edgeMat))
      motif.add(tile)

      tiles.push({ mesh: tile, baseY: y, phase: index * FLOAT_PHASE_STEP })
      index++
    }
  }

  return {
    group: base.group,
    core: base.core,
    update(dt, elapsed, focus) {
      updateBase(base, dt, elapsed, focus)
      for (const t of tiles) {
        t.mesh.position.y = t.baseY + Math.sin(elapsed * FLOAT_SPEED + t.phase) * FLOAT_AMPLITUDE
      }
      motif.scale.setScalar(focusScale(focus))
      tileMat.opacity = TILE_OPACITY + focus * 0.14
      edgeMat.opacity = EDGE_OPACITY + focus * 0.2
    },
  }
}
