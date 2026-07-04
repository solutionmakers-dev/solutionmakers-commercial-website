import '@fontsource/space-grotesk/latin-400.css'
import '@fontsource/space-grotesk/latin-500.css'
import '@fontsource/inter/latin-400.css'
import './style.css'

import * as THREE from 'three'
import { createRenderer, applyDpr } from './core/renderer'
import { startLoop } from './core/loop'
import { QualityManager } from './core/quality'

const SKY_RADIUS = 100
const SKY_TOP = '#0B1226'
const SKY_BOTTOM = '#070B14'

function createSky(): THREE.Mesh {
  const geometry = new THREE.SphereGeometry(SKY_RADIUS, 32, 32)
  const top = new THREE.Color(SKY_TOP)
  const bottom = new THREE.Color(SKY_BOTTOM)

  const position = geometry.getAttribute('position')
  const colors = new Float32Array(position.count * 3)
  const color = new THREE.Color()
  for (let i = 0; i < position.count; i++) {
    const y = position.getY(i)
    const t = (y + SKY_RADIUS) / (2 * SKY_RADIUS) // -radius..+radius -> 0..1
    color.copy(bottom).lerp(top, t)
    colors[i * 3] = color.r
    colors[i * 3 + 1] = color.g
    colors[i * 3 + 2] = color.b
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))

  const material = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })
  return new THREE.Mesh(geometry, material)
}

const canvas = document.querySelector<HTMLCanvasElement>('#scene')
if (!canvas) throw new Error('missing #scene canvas')

const ctx = createRenderer(canvas)
const { renderer, scene, camera } = ctx

scene.background = new THREE.Color('#070B14')
scene.add(createSky())

const quality = new QualityManager()
quality.onChange((tier) => applyDpr(ctx, tier))

startLoop((dt) => {
  quality.sample(dt)
  renderer.render(scene, camera)
})
