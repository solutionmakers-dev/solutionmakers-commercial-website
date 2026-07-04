import '@fontsource/space-grotesk/latin-400.css'
import '@fontsource/space-grotesk/latin-500.css'
import '@fontsource/inter/latin-400.css'
import './style.css'

import * as THREE from 'three'
import { createRenderer, applyDpr } from './core/renderer'
import { startLoop } from './core/loop'
import { QualityManager } from './core/quality'
import { Environment } from './world/environment'

const canvas = document.querySelector<HTMLCanvasElement>('#scene')
if (!canvas) throw new Error('missing #scene canvas')

const ctx = createRenderer(canvas)
const { renderer, scene, camera } = ctx

scene.background = new THREE.Color('#070B14')
// Scene-level fog: fades the void to the sky colour with distance, on top of
// (not instead of) Environment's own gradient sky sphere.
scene.fog = new THREE.Fog('#070B14', 18, 55)

const quality = new QualityManager()
const env = new Environment(quality.tier)
scene.add(env.group)
quality.onChange((tier) => {
  applyDpr(ctx, tier)
  env.applyTier(tier)
})

startLoop((dt, elapsed) => {
  quality.sample(dt)
  env.update(dt, elapsed, camera.position.z)
  renderer.render(scene, camera)
})
