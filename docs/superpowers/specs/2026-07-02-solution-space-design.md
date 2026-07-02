# Solution Makers — "The Solution Space" Design Spec

**Date:** 2026-07-02
**Status:** Approved for implementation (autonomous goal run; user brief is the source of truth)

## 1. Vision

A mobile-first, premium, immersive 3D website for **Solution Makers** — a technology
and innovation group spanning IT consulting, software products (apps & SaaS), AI
systems, hardware innovation, and multi-domain R&D (consumer apps, real estate,
import/export, medical/health).

The site is **not a page with a menu — it is a space**. The visitor flies through a
dark, premium void ("The Solution Space") with their finger. Depth is the navigation
axis. There is no hamburger, no nav bar. The experience should feel like holding a
small universe in your hand.

### Brand foundation (from presskit)

- Mark: calligraphic **"S" forming a lightbulb** — a swoosh that resolves into a
  bulb with wave/wing filament lines.
- Brand blue: royal/cobalt **#3A63C8** (sampled from `logotextbleubig.png`).
- Premium art direction already established by the presskit hero
  (`solutionmakersbg notext centered.jpg`): **chrome/silver mark on near-black
  navy under a soft volumetric light shaft**. The website recreates and extends
  this exact scene in real-time 3D.
- Wordmark: thin, wide-letterspaced uppercase "SOLUTION MAKERS".
- Assets: clean black mark (`logobig.png`, transparent bg) → trace to vector at
  build time for 3D extrusion. White + blue variants available for 2D UI.

## 2. Experience Design

### The metaphor

One continuous camera path through a dark nebula. Content lives at **stations**
(islands of light and geometry) placed along the path. Travel = dolly through
depth. The only "map" is the space itself, seen from afar.

### Journey (depth order)

1. **Arrival** — The chrome S-bulb materializes from drifting particles under a
   volumetric light cone (the presskit hero, live). Letterspaced wordmark fades
   in below. Affordance hint: "slide to enter" with a subtle upward drift cue.
2. **Manifesto** — A short statement floating in the void:
   "We make solutions. Software, intelligence, hardware — built end to end."
3. **Station: Consulting** — motif: orbital rings around a core (advisory orbit).
4. **Station: Software** — motif: crystalline grid of glass tiles (apps/SaaS).
5. **Station: AI Systems** — motif: neural particle swarm with synapse lines.
6. **Station: Hardware** — motif: wireframe device + glowing PCB traces.
7. **Station: R&D Lab** — motif: a core with **4 orbiting satellites**:
   Consumer Apps, Real Estate, Import/Export, Medical & Health. Tapping a
   satellite shows its domain blurb inside the station panel.
8. **Terminus: Contact** — "Have a problem worth solving?" The bulb mark
   reappears small and bright (full circle). Actions: email (mailto + copy),
   LinkedIn placeholder. No backend form (v1).

### Interaction model (3D-native, touch-first)

| Gesture | Effect |
|---|---|
| Vertical drag (or wheel/trackpad) | Dolly along the camera spline with inertia and soft station snapping |
| Horizontal drag | Lateral look/peek (clamped orbit around path tangent) |
| Tap station core | **Dive**: camera tweens into station; glass content panel unfolds |
| Swipe down / tap ✕ orb (in dive) | Return to travel mode |
| **Pinch out** (anywhere) | **Constellation Map**: camera pulls back; whole path visible as a constellation; tap any node to warp there. This replaces the menu |
| Pinch in (in map) | Return to previous position |
| Device tilt (opt-in on iOS) / mouse move | Parallax look-around |

Persistent HUD (DOM overlay, minimal): a thin **progress constellation** (dots
along the right edge showing position in depth) and one **orb button**
(bottom-right) that toggles the map — the accessible alternative to pinch.
Wordmark chip (top-left) warps home. That is the entire chrome.

### Navigation state machine

`arrival → travel ⇄ focus(station)`, `travel ⇄ map`, `map → warp(travel)`.
All transitions are camera moves — no page loads, no route changes except
`history.replaceState` hash updates (`#software`) for deep-linking/sharing.
Deep links open at the corresponding station after arrival intro (skippable).

## 3. Visual & Motion Direction

- **Palette:** void navy `#070B14 → #0B1226` radial gradient; chrome/silver
  metal; brand blue `#3A63C8` for energy (glows, filament, active states);
  white text at 87% opacity; hairline borders white 12%.
- **Light:** one volumetric cone from above at Arrival (shader-faked cone +
  fog, not real volumetrics); each station carries its own small light rig.
  Floating dust particles throughout; density thins between stations.
- **Logo hero:** extruded 3D mark (traced from `logobig.png` via potrace →
  SVGLoader → ExtrudeGeometry), chrome material via PMREM RoomEnvironment;
  filament waves emissive brand blue with slow pulse.
- **Post:** subtle UnrealBloom, vignette; adaptive quality (see §5).
- **Panels:** frosted-glass DOM overlays visually anchored to 3D (projected
  positioning), thin borders, uppercase micro-labels, generous whitespace.
- **Type:** Space Grotesk (display/headings) + Inter (body), self-hosted.
- **Motion grammar:** everything eases with critically-damped springs; travel
  inertia decays smoothly; nothing snaps instantly. 300–700 ms tweens.

## 4. Content (single source of truth: `src/content/content.ts`)

Each station: `id`, `title`, `tagline`, `body` (≤60 words), `capabilities[]`
(3–4 bullets), `motif` key, spline position. R&D includes `satellites[]` with
domain blurbs. Contact holds `email` (placeholder `contact@solutionmakers.io`
until user provides the real one — flagged as EDIT-ME). Copy is written premium
and terse; full copy deck lives in the content file, not this spec.

## 5. Technical Architecture

**Stack:** Vite + TypeScript + three.js (vanilla, no React), zero UI framework.
Post-processing from `three/examples` (EffectComposer, UnrealBloomPass). Dev
pipeline dep: `potrace` (Node) to trace the logo PNG → SVG once (checked into
`src/assets/logo-mark.svg`). pnpm.

### Why this approach (alternatives considered)

- **A. Vanilla three.js + custom camera rig (CHOSEN):** smallest runtime,
  total control of camera choreography and gestures, best mobile perf.
- B. React Three Fiber + drei: faster scaffolding, but React runtime cost and
  abstraction friction for a bespoke single-scene experience.
- C. HTML-dominant scroll site with WebGL garnish: safe but violates the
  "space, not website" vision.

### Modules (isolation & clarity)

```
src/
  core/      renderer.ts (WebGL setup, resize, DPR), loop.ts (RAF, clock),
             quality.ts (adaptive tier: dpr/particles/bloom by fps sampling)
  nav/       gestures.ts (Pointer Events: drag axes, inertia, pinch, tap),
             cameraRig.ts (CatmullRom spline, damped follow, dive/map tweens),
             navState.ts (state machine; single owner of mode transitions)
  world/     environment.ts (void, gradient, dust, light cone),
             logoHero.ts (trace→extrude chrome mark),
             stations/ (one module per station motif, shared Station base),
             constellation.ts (map-mode node view)
  ui/        hud.ts (progress dots, orb button, wordmark chip),
             panels.ts (glass content panels, projected anchoring),
             intro.ts (arrival sequence, tilt permission prompt)
  content/   content.ts (all copy + station definitions)
  a11y/      mirror.ts (semantic hidden DOM of all content for SEO/readers),
             reducedMotion.ts (prefers-reduced-motion: crossfade nav variant)
```

**Data flow:** `gestures → navState → cameraRig + world + ui`. Content
definitions drive station construction, HUD dots, a11y mirror, and deep links.
Each station implements `{build, activate, deactivate, update(dt, focus)}` and
is lazily activated by path proximity (frustum/dist gating).

### Performance budget (mobile-first)

- Target 60 fps on a mid-tier phone; total JS < 500 KB gz; no HDR downloads
  (procedural RoomEnvironment PMREM); DPR clamped ≤ 2; particle budgets per
  quality tier; no shadow maps (gradient fakes); single scene, no loads after
  boot; `powerPreference: "high-performance"`; texture-free materials where
  possible. Quality manager samples fps and steps tiers down/up live.

### Fallbacks, a11y, SEO

- `prefers-reduced-motion`: replaces flight with crossfades between fixed
  camera poses; all gestures still work.
- No WebGL: static branded fallback page from the a11y mirror content.
- Semantic hidden mirror (`<main aria-hidden=false>` under the canvas) with
  h1/sections for every station; canvas is `aria-hidden`. Focus order jumps
  mirror sections when diving.
- Meta: OG image from presskit hero, title/description, theme-color #070B14.

### Error handling

- WebGL context loss → overlay "resuming…" + auto-restore listener.
- Gyro permission denied → silently fall back to drag-only parallax.
- Asset trace failure at dev time fails the build loudly (never ships broken).

## 6. Testing & Verification

- **Vitest:** navState transitions; spline position↔station mapping; gesture
  recognizer classification (drag vs pinch vs tap) with synthetic events.
- **Playwright (dev-time verification):** boot, drive travel via synthetic
  wheel/touch, dive into each station, open map, deep-link, screenshot each
  state at iPhone 14 Pro + desktop viewports.
- **Perf sanity:** fps counter in dev HUD; verify quality tiering triggers.

## 7. Out of Scope (v1)

Contact form backend, CMS, i18n (English only v1; FR later), audio, analytics,
case-study detail pages, deployment (offered after acceptance).
