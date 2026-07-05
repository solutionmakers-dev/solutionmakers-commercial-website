# Solution Makers — The Solution Space

Mobile-first, immersive 3D commercial website for **Solution Makers** (IT consulting, software products, AI systems, hardware innovation, multi-domain R&D). The site is a navigable space, not pages: you fly through a dark nebula with your finger; divisions are 3D stations along the path; the only "menu" is a pinch-out constellation map.

**Live:** https://solutionmakers-dev.github.io/solutionmakers-commercial-website/

## Stack

Vite 8 · TypeScript (strict) · three.js (vanilla, no framework) · vitest · Playwright. Static build, no backend. ~177 KB gz JS total.

## Commands

```bash
pnpm dev        # dev server (host-exposed)
pnpm test       # unit suite (vitest, src/**)
pnpm e2e        # Playwright e2e (mobile + desktop projects; needs chromium installed)
pnpm typecheck  # tsc --noEmit
pnpm build      # production build to dist/
pnpm trace      # regenerate src/assets/logo-mark.svg from logo-src.png (potrace)
```

## How it's organized

```
src/
  core/      renderer (WebGL, DPR, resize), loop, adaptive quality tiers, bloom post
  nav/       gestures (Pointer Events), navState (mode machine), cameraRig (spline,
             inertia, dive/map/warp tweens), deepLink, orchestrator (wires everything)
  world/     environment (void, dust, light cone), logoHero (extruded chrome mark),
             stations/ (6 division motifs), constellation (map mode)
  ui/        hud (dots, orb, wordmark), panels (glass sheets), intro (arrival)
  content/   content.ts — single source of truth for ALL copy
  a11y/      semantic mirror (SEO/screen readers), reduced-motion
e2e/         committed Playwright suite (11 scenarios × 2 viewports)
docs/        design spec, implementation plan, HANDOFF.md
```

**Interaction model:** drag/wheel = travel along the path · tap station = dive (glass panel) · pinch-out = constellation map, tap node = warp · orb button = map/close · deep links `#consulting … #contact` · tilt/mouse parallax.

Deploys automatically to GitHub Pages on every push to `main` (`.github/workflows/deploy-pages.yml`).

Search `EDIT-ME` for business values pending real data (contact email, LinkedIn URL, final domain og tags).

See **docs/HANDOFF.md** for architecture decisions, verification status, and the forward backlog.
