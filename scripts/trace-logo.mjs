import { writeFile } from 'node:fs/promises'
import potrace from 'potrace'

const svg = await new Promise((res, rej) =>
  potrace.trace('src/assets/logo-src.png', { threshold: 180, turdSize: 24, optTolerance: 0.35 },
    (err, out) => (err ? rej(err) : res(out))))

// Tighten the viewBox to the mark's bounding box and normalize fill to a literal
// #000, since the mark is later extruded into 3D geometry (SVGLoader) where a
// tight, single-color silhouette matters more than the raw canvas dimensions.
const d = svg.match(/d="([^"]*)"/)[1]
const tokens = d.match(/[MCLZmclz]|-?\d+\.?\d*/g)
const pts = []
let cmd = ''
for (let i = 0; i < tokens.length; ) {
  const t = tokens[i]
  if (/[MCLZmclz]/.test(t)) {
    cmd = t
    i++
    continue
  }
  if (cmd === 'M' || cmd === 'L') {
    pts.push([parseFloat(tokens[i]), parseFloat(tokens[i + 1])])
    i += 2
  } else if (cmd === 'C') {
    for (let k = 0; k < 3; k++) {
      pts.push([parseFloat(tokens[i]), parseFloat(tokens[i + 1])])
      i += 2
    }
  } else {
    i++
  }
}
const xs = pts.map((p) => p[0])
const ys = pts.map((p) => p[1])
const minX = Math.min(...xs)
const maxX = Math.max(...xs)
const minY = Math.min(...ys)
const maxY = Math.max(...ys)
const pad = Math.round(0.02 * Math.max(maxX - minX, maxY - minY))
const vbX = Math.floor(minX - pad)
const vbY = Math.floor(minY - pad)
const vbW = Math.ceil(maxX - minX + pad * 2)
const vbH = Math.ceil(maxY - minY + pad * 2)

const tightened = svg
  .replace(/width="[^"]*" height="[^"]*"/, `width="${vbW}" height="${vbH}"`)
  .replace(/viewBox="[^"]*"/, `viewBox="${vbX} ${vbY} ${vbW} ${vbH}"`)
  .replace(/fill="black"/, 'fill="#000"')

await writeFile('src/assets/logo-mark.svg', tightened)
console.log('traced -> src/assets/logo-mark.svg')
console.log(`tight viewBox: ${vbX} ${vbY} ${vbW} ${vbH}`)
