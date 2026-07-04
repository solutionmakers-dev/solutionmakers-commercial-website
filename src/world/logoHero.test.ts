// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { parseLogoShapes } from './logoHero'
// The real traced mark, exactly as main.ts consumes it (vite ?raw → file text).
import realSvg from '../assets/logo-mark.svg?raw'

// viewBox "495 91 888 1193"
const VIEWBOX_AREA = 888 * 1193

/** Axis-aligned bbox of a shape's flattened outline, in SVG user units. */
function shapeBBoxArea(shape: THREE.Shape): number {
  const pts = shape.getPoints(64)
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const p of pts) {
    minX = Math.min(minX, p.x); minY = Math.min(minY, p.y)
    maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y)
  }
  return (maxX - minX) * (maxY - minY)
}

function totalCurves(shapes: THREE.Shape[]): number {
  return shapes.reduce((sum, s) => sum + s.curves.length + s.holes.reduce((h, hole) => h + hole.curves.length, 0), 0)
}

describe('parseLogoShapes — real traced mark', () => {
  it('returns at least one shape', () => {
    expect(parseLogoShapes(realSvg).length).toBeGreaterThanOrEqual(1)
  })

  it('returns no shape that spans (essentially) the full viewBox — a background plate', () => {
    for (const shape of parseLogoShapes(realSvg)) {
      // The mark's largest piece (the S-swoosh) is ~0.9 of the viewBox but is a
      // thin curve, not a plate; a true background rect would be ~1.0.
      expect(shapeBBoxArea(shape) / VIEWBOX_AREA).toBeLessThan(0.95)
    }
  })

  it('carries plenty of curve detail (>= 8 curves total across all shapes)', () => {
    expect(totalCurves(parseLogoShapes(realSvg))).toBeGreaterThanOrEqual(8)
  })
})

describe('parseLogoShapes — background-plate filter', () => {
  // A full-viewBox rect (fills its whole bbox) PLUS a small triangle path.
  const svgWithPlate = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
    <rect x="0" y="0" width="100" height="100" fill="#000"/>
    <path d="M 40 40 L 60 40 L 50 60 Z" fill="#fff"/>
  </svg>`

  it('drops the full-viewBox background rect but keeps the smaller mark shape', () => {
    const shapes = parseLogoShapes(svgWithPlate)
    expect(shapes.length).toBe(1)
    // The kept shape is the small triangle, well under the viewBox.
    expect(shapeBBoxArea(shapes[0]!) / (100 * 100)).toBeLessThan(0.5)
  })
})
