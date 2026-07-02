# The Solution Space — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Solution Makers' mobile-first immersive 3D website — a single continuous navigable space with depth-based touch navigation and no traditional menus.

**Architecture:** Vanilla three.js scene driven by a gesture→state-machine→camera-rig pipeline. Content definitions in one module drive 3D stations, DOM panels, HUD, a11y mirror, and deep links. DOM overlay for text/UI; WebGL for the world.

**Tech Stack:** Vite 6, TypeScript (strict), three.js (latest), vitest, @fontsource (Space Grotesk, Inter), potrace (dev-only, logo tracing), Playwright (dev verification). Package manager: pnpm.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-02-solution-space-design.md` — binding.
- Mobile-first: every interaction must work with one finger + pinch; desktop wheel/mouse are secondary mappings of the same actions.
- Colors: void `#070B14`→`#0B1226`; brand blue `#3A63C8`; text white 87%; hairlines white 12%.
- Perf: DPR ≤ 2, no shadow maps, no HDR/texture downloads, JS < 500 KB gz, single scene.
- Brand assets come from `/Users/solutionmakers/SolutionMakersCloud/presskit/` (copied into repo in Task 2, never hot-linked).
- Contact email placeholder `contact@solutionmakers.io` — keep the `// EDIT-ME` comment.
- All copy in `src/content/content.ts` only. No copy strings in other modules.
- Commit after every task (message given per task).
- Run all commands from repo root `/Users/solutionmakers/solutionmakers-commercial-website`.

---

### Task 1: Scaffold (Vite + TS strict + vitest + fonts + shell)

**Files:**
- Create: `package.json`, `vite.config.ts`, `tsconfig.json`, `index.html`, `src/main.ts`, `src/style.css`, `.gitignore`

**Interfaces:**
- Produces: `#scene` canvas element, `#ui` overlay div, `#mirror` semantic main; CSS custom props `--void`, `--void2`, `--blue`, `--text`, `--hairline`; font families `"Space Grotesk"` and `"Inter"` loaded via @fontsource side-effect imports in `main.ts`.

- [ ] **Step 1: Init project**

```bash
pnpm init
pnpm add three
pnpm add -D typescript vite vitest @types/three @fontsource/space-grotesk @fontsource/inter
```

- [ ] **Step 2: Write configs**

`tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022", "module": "ESNext", "moduleResolution": "bundler",
    "strict": true, "noUncheckedIndexedAccess": true, "noEmit": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"], "types": ["vite/client"]
  },
  "include": ["src", "scripts"]
}
```

`vite.config.ts`:
```ts
import { defineConfig } from 'vite'
export default defineConfig({
  build: { target: 'es2022' },
  server: { host: true },
})
```

Add to `package.json` scripts: `"dev": "vite"`, `"build": "vite build"`, `"preview": "vite preview"`, `"test": "vitest run"`, `"typecheck": "tsc --noEmit"`. Set `"type": "module"`.

`.gitignore`: `node_modules/`, `dist/`, `.DS_Store`.

- [ ] **Step 3: Write `index.html`**

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no" />
  <title>Solution Makers — Technology & Innovation Group</title>
  <meta name="description" content="Solution Makers builds what's next: IT consulting, software products, AI systems, hardware innovation and multi-domain R&D." />
  <meta name="theme-color" content="#070B14" />
  <meta property="og:title" content="Solution Makers" />
  <meta property="og:description" content="A technology and innovation group. Enter the Solution Space." />
  <meta property="og:image" content="/og.jpg" />
  <link rel="icon" href="/favicon.png" />
</head>
<body>
  <canvas id="scene" aria-hidden="true"></canvas>
  <div id="ui"></div>
  <main id="mirror"></main>
  <script type="module" src="/src/main.ts"></script>
</body>
</html>
```

- [ ] **Step 4: Write `src/style.css`** — custom props from Global Constraints; `html,body{margin:0;height:100%;overscroll-behavior:none;background:var(--void);color:var(--text);font-family:Inter,system-ui,sans-serif}`; `#scene{position:fixed;inset:0;width:100%;height:100%;touch-action:none}`; `#ui{position:fixed;inset:0;pointer-events:none}` (children re-enable with `pointer-events:auto`); `#mirror{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)}`; `.u-label{font-family:"Space Grotesk";letter-spacing:.35em;text-transform:uppercase;font-size:11px}`.

- [ ] **Step 5: Write `src/main.ts`** — imports `@fontsource/space-grotesk/latin-400.css`, `@fontsource/space-grotesk/latin-500.css`, `@fontsource/inter/latin-400.css`, `./style.css`; logs `boot`. Run `pnpm dev`, confirm dark page, no console errors. Run `pnpm typecheck`.

- [ ] **Step 6: Commit** `feat: scaffold vite+ts+three project shell`

---

### Task 2: Brand asset pipeline (trace logo → SVG, favicon, OG)

**Files:**
- Create: `scripts/trace-logo.mjs`, `src/assets/logo-mark.svg` (generated, committed), `public/favicon.png`, `public/og.jpg`, `public/logo-white.png`

**Interfaces:**
- Produces: `src/assets/logo-mark.svg` — single-color (`#000`) vector of the S-bulb mark, tight viewBox, importable as raw string via `?raw`.

- [ ] **Step 1: Copy source assets**

```bash
mkdir -p src/assets public
cp "/Users/solutionmakers/SolutionMakersCloud/presskit/logobig.png" src/assets/logo-src.png
cp "/Users/solutionmakers/SolutionMakersCloud/presskit/solutionmakers-logo-white.png" public/logo-white.png
cp "/Users/solutionmakers/SolutionMakersCloud/presskit/solutionmakersbg notext centered.jpg" public/og.jpg
sips -Z 512 "/Users/solutionmakers/SolutionMakersCloud/presskit/logo180.png" --out public/favicon.png
```

- [ ] **Step 2: Write `scripts/trace-logo.mjs`**

```js
import { writeFile } from 'node:fs/promises'
import potrace from 'potrace'
const svg = await new Promise((res, rej) =>
  potrace.trace('src/assets/logo-src.png', { threshold: 180, turdSize: 24, optTolerance: 0.35 },
    (err, out) => (err ? rej(err) : res(out))))
await writeFile('src/assets/logo-mark.svg', svg)
console.log('traced -> src/assets/logo-mark.svg')
```

`pnpm add -D potrace`, add script `"trace": "node scripts/trace-logo.mjs"`, run `pnpm trace`.

- [ ] **Step 3: Verify trace quality** — render `src/assets/logo-mark.svg` via `qlmanage -t -s 800 -o /tmp/…` and visually inspect: silhouette must read clearly as the S-bulb (swoosh + 3 filament waves). If waves fused, lower `turdSize`/adjust `threshold` (try 140–200) and re-run until clean.

- [ ] **Step 4: Commit** `feat: brand assets + logo vector trace pipeline`

---

### Task 3: Content module (single source of truth)

**Files:**
- Create: `src/content/content.ts`
- Test: `src/content/content.test.ts`

**Interfaces:**
- Produces:
```ts
export interface Satellite { id: string; title: string; blurb: string }
export type Motif = 'orbits' | 'grid' | 'swarm' | 'circuit' | 'satellites' | 'contact'
export interface StationDef {
  id: string; title: string; tagline: string; body: string;
  capabilities: string[]; motif: Motif; t: number; satellites?: Satellite[]
}
export const SITE: { name: string; email: string; manifesto: { line1: string; line2: string }; hint: string }
export const STATIONS: StationDef[]   // ordered by t ascending, t in (0,1]
```

- [ ] **Step 1: Write failing test** `src/content/content.test.ts`

```ts
import { describe, it, expect } from 'vitest'
import { STATIONS, SITE } from './content'

describe('content', () => {
  it('has 6 stations ordered by depth', () => {
    expect(STATIONS.length).toBe(6)
    const ts = STATIONS.map(s => s.t)
    expect([...ts].sort((a, b) => a - b)).toEqual(ts)
    expect(new Set(STATIONS.map(s => s.id)).size).toBe(6)
  })
  it('keeps t within (0,1] and ids url-safe', () => {
    for (const s of STATIONS) {
      expect(s.t).toBeGreaterThan(0); expect(s.t).toBeLessThanOrEqual(1)
      expect(s.id).toMatch(/^[a-z-]+$/)
      expect(s.capabilities.length).toBeGreaterThanOrEqual(3)
    }
  })
  it('r&d station carries 4 satellites', () => {
    const rd = STATIONS.find(s => s.motif === 'satellites')!
    expect(rd.satellites?.length).toBe(4)
  })
  it('site copy present', () => {
    expect(SITE.email).toContain('@')
    expect(SITE.manifesto.line1.length).toBeGreaterThan(4)
  })
})
```

- [ ] **Step 2: Run** `pnpm vitest run src/content` → FAIL (module missing).

- [ ] **Step 3: Implement `src/content/content.ts`** with this exact copy deck:

```ts
export const SITE = {
  name: 'SOLUTION MAKERS',
  email: 'contact@solutionmakers.io', // EDIT-ME: replace with the real contact address
  manifesto: {
    line1: 'We make solutions.',
    line2: 'Software, intelligence and hardware — imagined, engineered and shipped end to end.',
  },
  hint: 'slide to enter',
}
```

Stations (`t` values: 0.16, 0.32, 0.48, 0.64, 0.80, 1.0):
1. `consulting` / "Consulting" / tagline "Senior minds on hard problems." / body: "We embed with your teams to untangle architecture, rescue delivery and design systems that survive contact with reality. Strategy that ships." / capabilities: "Architecture & audits", "Delivery rescue & leadership", "Cloud & platform engineering", "Security by design" / motif `orbits`.
2. `software` / "Software Products" / "Apps and SaaS, crafted like instruments." / body: "From consumer apps to industrial SaaS, we design, build and operate products people rely on daily — fast, beautiful and maintainable." / caps: "Mobile & web apps", "SaaS platforms", "Design systems & UX", "Product operations" / motif `grid`.
3. `ai` / "AI Systems" / "Intelligence, applied with judgment." / body: "We build AI that earns its place in production: agents, copilots, vision and language systems wired into real workflows with real guardrails." / caps: "LLM agents & copilots", "Applied ML & vision", "RAG & knowledge systems", "Evaluation & safety" / motif `swarm`.
4. `hardware` / "Hardware Innovation" / "Atoms, meet bits." / body: "Connected devices, embedded platforms and the firmware that makes them feel alive — prototyped in-house and taken to production." / caps: "Embedded & IoT", "Prototyping to production", "Firmware & connectivity", "Industrial design partners" / motif `circuit`.
5. `rd` / "R&D Lab" / "Where the next divisions are born." / body: "A standing lab exploring domains where technology can still surprise: ventures we incubate, operate and spin out." / caps: "Venture incubation", "Domain research", "Rapid pilots", "Spin-out engineering" / motif `satellites` / satellites:
   - `consumer` "Consumer Apps" — "Products for daily life, from social to lifestyle — designed for retention, not addiction."
   - `real-estate` "Real Estate" — "Property tech that moves markets: listings intelligence, media automation, transaction tooling."
   - `trade` "Import / Export" — "Trade tooling for a connected world: sourcing, logistics visibility and cross-border commerce."
   - `health` "Medical & Health" — "Careful technology for care: patient experience, clinical workflow and health data done right."
6. `contact` / "Make With Us" / "Have a problem worth solving?" / body: "Tell us what you are trying to build — or untangle. We answer personally, usually within a day." / caps: "Projects & partnerships", "Product co-development", "Long-term engineering" / motif `contact`.

- [ ] **Step 4: Run** `pnpm vitest run src/content` → PASS. **Step 5: Commit** `feat: content model and full copy deck`

---

### Task 4: Core (renderer, loop, adaptive quality)

**Files:**
- Create: `src/core/renderer.ts`, `src/core/loop.ts`, `src/core/quality.ts`
- Test: `src/core/quality.test.ts`
- Modify: `src/main.ts`

**Interfaces:**
- Produces:
```ts
// renderer.ts
export interface Ctx { renderer: THREE.WebGLRenderer; scene: THREE.Scene; camera: THREE.PerspectiveCamera; canvas: HTMLCanvasElement }
export function createRenderer(canvas: HTMLCanvasElement): Ctx   // fov 55, near .1, far 120, alpha:false, antialias by tier, powerPreference 'high-performance'; handles resize via ResizeObserver; DPR = min(devicePixelRatio, 2) * tierScale
// loop.ts
export function startLoop(cb: (dt: number, elapsed: number) => void): () => void  // RAF, dt clamped to 1/20 s
// quality.ts
export type Tier = 0 | 1 | 2
export interface TierConfig { dprScale: number; particleScale: number; bloom: boolean }
export const TIERS: Record<Tier, TierConfig>  // 0:{.6,.35,false} 1:{.8,.7,true} 2:{1,1,true}
export class QualityManager {
  tier: Tier                       // starts at 2 (1 if devicePixelRatio>2.5 && mobile UA)
  sample(dt: number): void         // rolling 60-frame avg; <45fps for 90 consecutive frames → step down; >55fps for 300 → step up (max 2); 3 s cooldown between changes
  onChange(cb: (t: Tier) => void): void
}
```

- [ ] **Step 1: Write failing test** `src/core/quality.test.ts` — construct `QualityManager`, feed `sample(1/30)` × 90 → expect tier drops 2→1; feed another 90 slow frames after fake cooldown (advance internal time by calling sample with accumulated dt ≥ 3 s) → 0; then `sample(1/60)` × 300 → back to 1. Use a `now` injection: constructor accepts `nowFn?: () => number` for testability; tests drive a fake clock.
- [ ] **Step 2: Run → FAIL.** **Step 3: Implement** quality.ts exactly per rules above; renderer.ts and loop.ts per signatures (loop uses `renderer.setAnimationLoop`-independent RAF; no three import in loop.ts).
- [ ] **Step 4: Wire in `main.ts`:** create renderer, radial-gradient background via `scene.background = new THREE.Color('#070B14')` plus a large inward-facing sphere with a vertex-colored gradient material (`#0B1226` top → `#070B14` bottom); start loop rendering. `pnpm dev` → dark gradient void, 60 fps, no errors. `pnpm typecheck && pnpm test` pass.
- [ ] **Step 5: Commit** `feat: core renderer, loop, adaptive quality`

---

### Task 5: Gesture controller

**Files:**
- Create: `src/nav/gestures.ts`
- Test: `src/nav/gestures.test.ts`

**Interfaces:**
- Produces:
```ts
export type GestureEvent =
  | { type: 'dragmove'; dx: number; dy: number }        // px since last event
  | { type: 'dragend'; vx: number; vy: number }         // px/s at release
  | { type: 'pinch'; scale: number }                    // current/initial distance
  | { type: 'pinchend'; scale: number }
  | { type: 'tap'; x: number; y: number }               // client coords
  | { type: 'wheel'; delta: number }                    // deltaY normalized
export class GestureController {
  constructor(el: HTMLElement)
  on(cb: (e: GestureEvent) => void): void
  dispose(): void
}
```
Rules: pointerdown→up with <10 px total movement and <350 ms = `tap`. Single pointer movement ≥10 px = drag (emit `dragmove` deltas; velocity from last 80 ms window on release). Two pointers = pinch (cancels drag, emits `pinch` with running scale; `pinchend` on any pointer loss). Wheel events → `wheel` with `e.deltaY` (invert so wheel-down = travel forward positive). Uses Pointer Events only; calls `setPointerCapture`.

- [ ] **Step 1: Write failing tests** using synthetic `PointerEvent`s dispatched on a detached div (jsdom env — add `// @vitest-environment jsdom` header): tap classification, drag emits deltas and end-velocity sign, two-pointer produces pinch not drag, wheel mapping. (Construct events with `new PointerEvent('pointerdown', {pointerId:1, clientX, clientY, isPrimary:true})`; jsdom lacks PointerEvent — polyfill in test with `class extends MouseEvent` assigning `pointerId`. Stub `el.setPointerCapture = () => {}`.)
- [ ] **Step 2: Run → FAIL.** **Step 3: Implement.** **Step 4: Run → PASS; typecheck.**
- [ ] **Step 5: Commit** `feat: touch-first gesture controller (drag/pinch/tap/wheel)`

---

### Task 6: Navigation state machine

**Files:**
- Create: `src/nav/navState.ts`
- Test: `src/nav/navState.test.ts`

**Interfaces:**
- Produces:
```ts
export type Mode = 'arrival' | 'travel' | 'focus' | 'map'
export interface NavSnapshot { mode: Mode; stationId: string | null }
export class NavState {
  readonly mode: Mode                    // starts 'arrival'
  readonly stationId: string | null
  enter(): boolean                       // arrival→travel
  dive(id: string): boolean              // travel→focus(id)
  exitFocus(): boolean                   // focus→travel
  openMap(): boolean                     // travel→map
  closeMap(): boolean                    // map→travel
  warp(id: string): boolean              // map→travel (stationId = id, consumers treat as warp target)
  on(cb: (next: NavSnapshot, prev: NavSnapshot) => void): void
}
```
Every method returns false (no-op, no event) when called in a wrong mode. `stationId` is set by `dive`/`warp`, cleared by `exitFocus` (kept after warp until next transition).

- [ ] **Step 1: Failing tests:** full legal-path walk (arrival→enter→dive→exitFocus→openMap→warp), each illegal call from each mode returns false and emits nothing (spy on listener), snapshots carry correct prev/next.
- [ ] **Step 2: FAIL → Step 3: Implement (plain class, no deps) → Step 4: PASS.**
- [ ] **Step 5: Commit** `feat: navigation state machine`

---

### Task 7: Camera rig (spline travel, dive/map tweens)

**Files:**
- Create: `src/nav/cameraRig.ts`, `src/nav/damp.ts`
- Test: `src/nav/cameraRig.test.ts`, `src/nav/damp.test.ts`

**Interfaces:**
- Consumes: `StationDef[]` from content; `THREE.PerspectiveCamera`.
- Produces:
```ts
// damp.ts
export function damp(current: number, target: number, lambda: number, dt: number): number
// = current + (target-current) * (1 - Math.exp(-lambda*dt))
export class Tween { /* start(from,to,ms,ease,onUpdate,onDone); update(dt); cancel(); easeInOutCubic default */ }

// cameraRig.ts
export const PATH_POINTS: THREE.Vector3[]  // gentle S-curve: (0,0,0)…(±6 lateral, ±1.5 vertical, -z forward, total length ~90)
export class CameraRig {
  constructor(camera: THREE.PerspectiveCamera, stations: StationDef[])
  readonly t: number
  stationAnchor(id: string): THREE.Vector3         // world pos where station group is placed: spline point at station.t, offset +2.2 lateral (alternating sign by index), matching path curvature side
  addTravel(deltaPx: number): void                 // travelTarget += deltaPx * 0.00042, clamp [0,1]
  fling(velocityPxS: number): void                 // inertia: adds velocity, decays exp(-2.2/s); on settle, snap targetT to nearest station within 0.045
  setLook(nx: number, ny: number): void            // lateral/vertical look offset, damped, max ±0.35 rad yaw, ±0.2 pitch
  diveTo(id: string, onDone?: () => void): void    // tween 650 ms to focusPose(station): 3.4 units from anchor, looking at anchor, 12° above horizontal
  exitDive(onDone?: () => void): void
  toMap(onDone?: () => void): void                 // tween 700 ms to map pose: above+behind path midpoint, whole curve in 55° fov
  fromMap(onDone?: () => void): void
  warpTo(id: string, onDone?: () => void): void    // from map: fly to station.t travel pose, 900 ms
  update(dt: number): void
  nearestStation(): StationDef
  onProgress(cb: (t: number) => void): void        // fires when t changes >0.001
}
```
Travel pose at `t`: position = spline point; lookAt = spline point at `t + 0.035` plus look offsets. All continuous values go through `damp` (λ≈6 position, λ≈4 look).

- [ ] **Step 1: Failing tests** (no WebGL needed — CameraRig works on a bare `PerspectiveCamera`): `damp` converges & is frame-rate independent (two half-steps ≈ one full step); `Tween` reaches target and fires onDone; rig: `addTravel` clamps; `fling` then repeated `update(1/60)` settles near a station t (snap); `stationAnchor` returns distinct, finite positions with alternating lateral sign; `diveTo` then updates → camera position within 0.1 of expected focus pose after 1 s of updates; illegal `warpTo('nope')` no-throws.
- [ ] **Step 2: FAIL → Step 3: Implement → Step 4: PASS + typecheck.**
- [ ] **Step 5: Commit** `feat: spline camera rig with inertia, dive, map poses`

---

### Task 8: Environment (void, dust, arrival light cone)

**Files:**
- Create: `src/world/environment.ts`
- Test: smoke in `src/world/environment.test.ts`
- Modify: `src/main.ts`

**Interfaces:**
- Consumes: `Ctx`, `QualityManager`, `PATH_POINTS`.
- Produces:
```ts
export class Environment {
  group: THREE.Group
  constructor(quality: Tier)
  applyTier(tier: Tier): void      // rebuild particle counts
  update(dt: number, elapsed: number, cameraZ: number): void
}
```
Contents: (a) gradient sky sphere (r=100, BackSide, vertex colors `#0B1226`→`#070B14`); (b) **dust**: `THREE.Points`, base 1400 points × `particleScale`, spread in a tube (radius 14) around the full path, size 0.045, additive, opacity 0.5, slow per-axis sine drift in shader-less fashion (CPU offsets on a 4k-max array is fine); brand-blue 20% of points, white rest; (c) **arrival cone**: cone geometry (openEnded, radiusTop 0.4→radiusBottom 5.5, h 14) at path start above logo position, `MeshBasicMaterial` additive, opacity 0.07 white, plus second inner cone 0.10 — faked volumetric; slowly rotates. Fog: `scene.fog = new THREE.Fog('#070B14', 18, 55)`.

- [ ] **Step 1: Smoke test:** constructs without WebGL (pure geometry/material creation works in node), group has ≥3 children, `applyTier(0)` reduces point count, `update` runs without throw.
- [ ] **Step 2–4: FAIL → implement → PASS.** Wire into `main.ts` scene; `pnpm dev`: drifting dust + light cone visible, fog fades distance. 
- [ ] **Step 5: Commit** `feat: void environment — gradient, dust field, volumetric cone`

---

### Task 9: Logo hero (traced SVG → extruded chrome mark)

**Files:**
- Create: `src/world/logoHero.ts`
- Test: `src/world/logoHero.test.ts` (shape parsing only)
- Modify: `src/main.ts`

**Interfaces:**
- Consumes: `src/assets/logo-mark.svg?raw`, PMREM env from renderer setup.
- Produces:
```ts
export function parseLogoShapes(svgText: string): THREE.Shape[]   // SVGLoader.parse → paths → toShapes(true); filters shapes whose bbox area > 60% of viewBox (background rects)
export class LogoHero {
  group: THREE.Group    // extruded mark ~3.2 units tall, centered at path start + (0, 0.2, -2), facing camera start
  constructor(svgText: string)
  update(dt: number, elapsed: number): void   // slow ±6° yaw sway, filament pulse
  setEnvMap(tex: THREE.Texture): void
}
```
Material: `MeshStandardMaterial{ metalness: 1, roughness: 0.18, color: #e8eaee, envMapIntensity: 1.4 }`. Env map: `PMREMGenerator` + `RoomEnvironment` created once in main and passed in (also set as `scene.environment`). Extrude: depth 0.28, bevelEnabled, bevelSize 0.02, bevelSegments 2, curveSegments 24; scale/center from bbox; flip Y (SVG y-down). Filament accent: clone bottom-third shapes? — NO (YAGNI): add a small emissive-blue `MeshBasicMaterial` plane glow sprite behind the bulb bottom (additive, radius ~1.2, pulse opacity 0.25→0.5 sin).

- [ ] **Step 1: Failing test:** `parseLogoShapes(realSvgRaw)` (read file via `fs` in test) returns ≥1 shape, none covering full viewBox, all with ≥8 curves total.
- [ ] **Step 2–4: FAIL → implement → PASS.** Wire hero into main under the cone; `pnpm dev`: chrome mark gleams under the shaft on void — must visibly echo `public/og.jpg` presskit hero.
- [ ] **Step 5: Commit** `feat: chrome extruded logo hero under arrival light`

---

### Task 10: Station framework + first three motifs (orbits, grid, swarm)

**Files:**
- Create: `src/world/stations/station.ts`, `src/world/stations/motifs/orbits.ts`, `motifs/grid.ts`, `motifs/swarm.ts`
- Test: `src/world/stations/station.test.ts`

**Interfaces:**
- Consumes: `StationDef`, `CameraRig.stationAnchor`.
- Produces:
```ts
// station.ts
export interface MotifBuild { group: THREE.Group; update(dt: number, elapsed: number, focus: number): void; core: THREE.Object3D }
export type MotifBuilder = (def: StationDef, tier: Tier) => MotifBuild
export class Station {
  def: StationDef; group: THREE.Group; core: THREE.Object3D   // core = tap target (userData.stationId set)
  constructor(def: StationDef, builder: MotifBuilder, anchor: THREE.Vector3, tier: Tier)
  setActive(a: boolean): void          // toggles group.visible + halts updates
  setFocus(f: number): void            // 0..1, motifs brighten/expand slightly
  update(dt: number, elapsed: number): void
}
export const MOTIFS: Record<Motif, MotifBuilder>   // filled across tasks 10–11
```
Every station shares: a floating `u-label`-style 3D title? — NO: titles live in DOM HUD/panels. 3D side has: core icosahedron (r 0.35, chrome-ish standard material, emissive #3A63C8 0.25) + motif geometry + a soft point light (#3A63C8, intensity 6, distance 9) + faint base ring.
Motifs (all mostly-line/points, brand blue + white):
- `orbits`: 3 tilted `TorusGeometry` rings (r 1.2/1.7/2.2, tube 0.012, basic additive materials op 0.5) rotating at different speeds; 6 small satellites (spheres r 0.06) parented to rings.
- `grid`: 5×3 rounded glass tiles (`RoundedBox`-approx via Box + high roughness transmission is heavy — use `MeshStandardMaterial{transparent, opacity .18, metalness .9, roughness .25}`), arranged as a curved wall (cylindrical arc r 3), slow index-staggered float; edges via `LineSegments` white 12%.
- `swarm`: 700×scale points in a sphere (r 2), each drifts toward one of 5 attractor loci cycling positions every 6 s (simple lerp CPU), plus 40 line segments connecting nearest pairs recomputed every 0.5 s among a 60-point subsample; blue↔white mix.

- [ ] **Step 1: Failing smoke tests:** each motif builder returns group with children>0 and a core; `Station.setActive(false)` hides; `setFocus(1)` doesn't throw; `update` advances without WebGL.
- [ ] **Step 2–4: FAIL → implement → PASS.** Wire stations for first 3 defs in main at their anchors; dev-check: flying (temporary keyboard fallback: wheel) reveals stations glowing at path side.
- [ ] **Step 5: Commit** `feat: station framework + orbits/grid/swarm motifs`

---

### Task 11: Motifs — circuit, satellites (R&D), contact

**Files:**
- Create: `src/world/stations/motifs/circuit.ts`, `motifs/satellites.ts`, `motifs/contact.ts`
- Test: extend `station.test.ts`

**Interfaces:** same `MotifBuilder` contract. 
- `circuit`: wireframe rounded-slab "device" (Box 1.6×2.6×0.12, `EdgesGeometry` lines) + 12 PCB traces: polyline paths (TubeGeometry radius 0.008) running Manhattan-style from device edges outward, with 12 pulse sprites (additive planes, 0.09) traveling trace paths on loop (offset phases); blue.
- `satellites`: central core + 4 orbiters (r 0.16 spheres, standard material, emissive blue), each carrying `userData.satelliteId` (from def.satellites), orbit radii 1.3–2.4, distinct inclinations/speeds; thin orbit line circles; orbiters are tap targets too.
- `contact`: small version of logo silhouette? — reuse is heavy; instead: a bright core (emissive white sphere r 0.3, bloom does the rest) inside a slowly-breathing icosahedron wireframe r 1.6, plus a ring of 80 points converging/diverging — "signal beacon".
- [ ] Steps: failing smoke tests (satellites motif exposes 4 objects with `userData.satelliteId`) → implement → PASS → wire remaining 3 stations in main → dev check → **Commit** `feat: circuit, R&D satellites, contact beacon motifs`

---

### Task 12: Constellation map mode

**Files:**
- Create: `src/world/constellation.ts`
- Test: `src/world/constellation.test.ts` (smoke + node positions match anchors)

**Interfaces:**
- Consumes: stations' anchors, `NavState`, `CameraRig.toMap/fromMap/warpTo`.
- Produces:
```ts
export class Constellation {
  group: THREE.Group                      // hidden except map mode
  constructor(stations: Station[], rigAnchors: Map<string, THREE.Vector3>)
  setVisible(v: boolean, progress01?: number): void   // fade in nodes+links
  nodeAt(raycaster: THREE.Raycaster): string | null   // stationId hit test (nodes get enlarged invisible hit spheres r 1.2)
  update(dt: number, elapsed: number): void
}
```
Visual: at each station anchor a glowing node (sprite + point), linked by a `Line` following the spline (CatmullRom sampled 120 pts, additive, white 25%); current station node ringed. Station motifs stay visible (they ARE the constellation from afar); map adds nodes/links/labels-as-sprites (canvas-texture text of titles, `u-label` style, generated once).

- [ ] Steps: failing tests (nodes count = stations, `nodeAt` returns id for ray through node, null off-path) → implement → PASS → **Commit** `feat: constellation map layer`

---

### Task 13: UI overlay — HUD, glass panels, intro

**Files:**
- Create: `src/ui/hud.ts`, `src/ui/panels.ts`, `src/ui/intro.ts`, append styles to `src/style.css`
- Test: `src/ui/panels.test.ts`, `src/ui/hud.test.ts` (jsdom)

**Interfaces:**
- Consumes: `NavSnapshot`, `StationDef`, `SITE`.
- Produces:
```ts
// hud.ts
export class Hud {
  constructor(root: HTMLElement, stations: StationDef[])
  setProgress(t: number): void            // highlights nearest dot
  setMode(m: Mode): void                  // hides dots in focus/map; orb icon swaps (dots↔✕)
  onOrb(cb: () => void): void             // map toggle / focus close
  onDot(cb: (id: string) => void): void
  onHome(cb: () => void): void
}
// panels.ts
export class PanelLayer {
  constructor(root: HTMLElement)
  show(def: StationDef): void             // glass panel: label(tagline), h2(title), body, capability chips; contact variant renders email button (mailto) + copy button (navigator.clipboard) instead of chips; satellites variant renders 4 tabs
  showSatellite(defId: string, satId: string): void
  hide(): void
  onClose(cb: () => void): void
  onSatellite(cb: (satId: string) => void): void
}
// intro.ts
export class Intro {
  constructor(root: HTMLElement)          // wordmark (SOLUTION MAKERS, .u-label scaled up), hint pill, tilt-permission chip (iOS only, shown post-enter)
  play(onEntered: () => void): void       // fade sequence; first meaningful drag/wheel triggers enter
  requestTilt(): Promise<boolean>         // DeviceOrientationEvent.requestPermission if defined
}
```
Panel CSS: fixed bottom sheet on mobile (max-h 62vh, border-radius 20px 20px 0 0, `backdrop-filter: blur(18px)`, background `rgba(11,18,38,.55)`, hairline border, slide-up 360 ms cubic); centered right-side card ≥768px (width 400px). Chips: hairline pills. Close: ✕ top-right + swipe-down on sheet (reuse GestureController on panel el; drag dy>80 closes). All panel/hud children `pointer-events:auto`.

- [ ] **Step 1: Failing jsdom tests:** `PanelLayer.show(def)` renders title/tagline/4 chips; contact def renders `a[href^="mailto:"]`; satellites def renders 4 tab buttons, clicking one fires `onSatellite`; `hide` empties; Hud renders 6 dots + orb, `setProgress(0.48)` marks 3rd dot active, dot click fires id, `setMode('focus')` swaps orb glyph to ✕.
- [ ] **Step 2–4: FAIL → implement → PASS.**
- [ ] **Step 5: Commit** `feat: hud, glass content panels, arrival intro overlay`

---

### Task 14: Wiring — main orchestration, tap raycast, deep links, tilt

**Files:**
- Modify: `src/main.ts` (assemble everything); Create: `src/nav/deepLink.ts`
- Test: `src/nav/deepLink.test.ts`

**Interfaces:**
- Produces: `deepLink.ts`: `readHash(): string | null` (validated against station ids), `writeHash(id: string | null): void` (`history.replaceState`).
- Behavior contract (the heart of the product — implement exactly):
  - gestures: `dragmove.dy` → `rig.addTravel(-dy)` in travel; `dragmove.dx` → `rig.setLook` (decaying); `dragend` → `rig.fling(-vy)`; `wheel` → `addTravel(delta)`.
  - `tap` in travel: raycast stations' cores (+satellite orbiters when near R&D) → `nav.dive(id)`; rig.diveTo; panels.show; writeHash(id). Tap satellite while focused on R&D → `panels.showSatellite`.
  - `pinchend scale>1.25` in travel → `nav.openMap()` → rig.toMap + constellation.setVisible(true). `pinchend scale<0.8` in map → close. Tap node in map → `nav.warp(id)` → constellation hide + `rig.warpTo` + writeHash.
  - Orb button: travel→openMap, map→closeMap, focus→exitFocus (+panels.hide+writeHash(null)). Hud dots (travel) → warp directly (`rig.warpTo`). Home chip → warp to t=0.
  - `nav.on` drives: hud.setMode, panels hide on leaving focus, station `setFocus` tween (0→1 over dive).
  - Per-frame: `rig.update`, `env.update`, stations `update` (only those with |station.t − rig.t| < 0.22 active — hysteresis 0.03), hero.update, quality.sample, composer render.
  - Post: `EffectComposer` + `RenderPass` + `UnrealBloomPass(strength 0.55, radius 0.7, threshold 0.72)` when tier config bloom, else direct render. Rebuild on tier change + resize.
  - Deep link at boot: if hash valid, after intro enter → warpTo(station).
  - Tilt: after first enter on iOS, intro shows chip; on grant, `deviceorientation` → `rig.setLook(gamma/45, beta-45/45)` merged with drag look (drag dominates while touching).
- [ ] **Step 1: deepLink failing tests** (jsdom: hash read/write/validate) → implement → PASS.
- [ ] **Step 2: Assemble main.ts** per contract. `pnpm dev` — full flow works with mouse (wheel travel, click dive, orb map).
- [ ] **Step 3: typecheck + all tests.** **Step 4: Commit** `feat: full navigation wiring — travel, dive, map, warp, deep links, tilt`

---

### Task 15: A11y mirror, reduced motion, WebGL-loss, no-WebGL fallback

**Files:**
- Create: `src/a11y/mirror.ts`, `src/a11y/reducedMotion.ts`
- Test: `src/a11y/mirror.test.ts` (jsdom)
- Modify: `src/main.ts`

**Interfaces:**
```ts
// mirror.ts
export function buildMirror(root: HTMLElement, stations: StationDef[], site: typeof SITE): void
// h1 SOLUTION MAKERS, manifesto p, one <section id=`s-${id}`> per station with h2/p/ul, contact mailto — real focusable content
export function revealMirrorAsFallback(root: HTMLElement): void  // no-WebGL: unhide with readable styling class 'mirror-visible'
// reducedMotion.ts
export function prefersReducedMotion(): boolean
```
main.ts: try/catch WebGL creation → fallback reveals mirror styled as an elegant static dark page (add `.mirror-visible` styles: centered column, white logo img, sections). `renderer.domElement` listens `webglcontextlost/restored` → overlay div "resuming…" toggle. Reduced motion: rig tween durations ×0.35 and fling disabled (direct snap), dust drift halved.

- [ ] Steps: failing mirror tests (renders 6 sections, mailto link, h1) → implement → PASS → manual dev check → **Commit** `feat: a11y mirror, reduced-motion + webgl fallbacks`

---

### Task 16: End-to-end verification (Playwright) + perf + polish pass

**Files:**
- Create: `e2e/experience.spec.ts`, `playwright.config.ts`

**Interfaces:** none new.

- [ ] **Step 1:** `pnpm add -D @playwright/test && pnpm exec playwright install chromium`
- [ ] **Step 2: Write spec:** viewport iPhone 14 Pro (393×852, hasTouch) + desktop 1440×900: boot → intro visible; wheel/touch-drag → travel (assert hud progress changes); click station core center-screen when snapped (drive via `page.mouse` after warping with hash deep-link for determinism) → panel with correct title appears; orb tap → map; node click → warp (hash updates); `#software` deep link boots to software; reduced-motion emulation still navigable; console error count = 0. Screenshot each state to `e2e/shots/`.
- [ ] **Step 3:** `pnpm exec playwright test` → all green; inspect screenshots — premium dark aesthetic, readable panels, logo hero matches presskit mood.
- [ ] **Step 4: Perf pass:** `pnpm build` → check gz sizes (`ls -la dist/assets`), JS < 500 KB gz; dev fps HUD (temporary `?fps` query param stat) ≥55 on desktop; verify tier drop by CPU-throttled run (manual, note results).
- [ ] **Step 5: Final polish:** tune bloom/opacities/speeds from screenshots; re-run e2e.
- [ ] **Step 6: Commit** `test: e2e experience verification + perf budget check`

---

## Self-Review

- **Spec coverage:** journey (T3 content, T8–T11 stations, T9 hero), gestures (T5), state machine (T6), camera/spline/inertia/snap (T7), map/pinch (T12, T14), HUD/panels/intro/tilt (T13–T14), deep links (T14), a11y/reduced-motion/fallbacks (T15), perf budgets (T4 quality, T16), verification (T16). Deployment intentionally out of scope per spec §7. ✓
- **Placeholder scan:** copy deck fully written in T3; motif geometries specified with numbers; no TBDs. Two intentional design-time decisions delegated with explicit YAGNI notes (logo filament simplification T9, contact motif T11). ✓
- **Type consistency:** `Tier` (core/quality) consumed by Environment/Station builders; `Motif` keys in content match `MOTIFS` record keys (orbits/grid/swarm/circuit/satellites/contact); `GestureEvent` names used in T14 contract match T5; `NavState` methods in T14 match T6. ✓
