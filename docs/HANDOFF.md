# Handoff Report — The Solution Space

_Written 2026-07-05 at project completion, for the next session/model continuing this work. Everything below is verified fact, not aspiration._

## 1. Where things stand

The site is **finished per the v1 spec, merged to `main`, and live** at
https://solutionmakers-dev.github.io/solutionmakers-commercial-website/

- Repo: `solutionmakers-dev/solutionmakers-commercial-website` (public; `gh` CLI on this machine is authenticated as `solutionmakers-dev`).
- Verification at merge: **206/206 unit tests, 22/22 Playwright e2e (iPhone-class touch viewport + desktop), typecheck and production build green**. Bundle ≈ 177 KB gz (budget was 500).
- Auto-deploy: pushes to `main` run test → typecheck → build → GitHub Pages (`.github/workflows/deploy-pages.yml`). The `github-pages` environment allows branches `feature/solution-space` and `main` (this was a 2-second-failure gotcha: GitHub locks the environment to the first deploying branch; fix was a deployment-branch-policy entry).
- The remote `feature/solution-space` branch still exists as history; local copy was deleted after merge.

## 2. Documents that govern the project

- `docs/superpowers/specs/2026-07-02-solution-space-design.md` — the binding design spec (journey, interaction table, aesthetic, budgets).
- `docs/superpowers/plans/2026-07-02-solution-space.md` — the 16-task implementation plan the build followed.
- `.superpowers/sdd/progress.md` — the build ledger (gitignored, local-only): per-task commits, review outcomes, adjudications. If absent, `git log` tells the same story — every task is one `feat:`/`fix:` commit with reviews enforced between.

## 3. Decisions that differ from the plan's literal text (all deliberate, all reviewed)

| Decision | Why |
|---|---|
| Vite 8 (plan said "Vite 6") | npm latest at build time; spec pins no version |
| Bloom `0.05 / 0.25 / 0.99` (plan said 0.55/0.7/0.72) | plan values blow out the ACES (exposure 0.75) display-referred chain — A/B-proven; documented in `src/core/post.ts` |
| Logo mark height 1.0 unit (plan said 3.2) | 3.2 cannot fit a 55° fov at the 2-unit viewing distance |
| DIVE_DISTANCE 4.4 + portrait backoff (plan said 3.4) | full motifs must read in frame during focus |
| Station core material `#99a3ba`, rough 0.2, emissive 0.45, envInt 0.55 | plan's brighter values read as flat plastic on the dark void |
| Logo trace plate-filter = bbox>60% **and** fillRatio>0.9 | plan's plain ">60% bbox" rule would have deleted the mark itself (its bbox is 89.6% of viewBox) |
| `GestureController` takes pointer capture **only after a gesture starts** (10 px drag / pinch), never on pointerdown | capture-on-down swallowed real mouse clicks on panel buttons (reproduced, fixed, regression-tested in e2e with real clicks) |
| Renderer FAR 220 (plan said 120) + map-pose portrait aspect-fit | map pose clipped half the path at 120 |

## 4. Architecture in one paragraph

`GestureController` (Pointer Events → tap/drag/fling/pinch/wheel) feeds the `NavState` machine (`arrival → travel ⇄ focus`, `travel ⇄ map`) — the **single owner of mode transitions**; illegal calls are silent no-ops, which is what makes tap-during-tween/pinch-during-focus/warp-spam safe. `orchestrator.ts` is the composition root's brain: it maps nav events onto the `CameraRig` (Catmull-Rom spline travel with damped inertia + station snapping; dive/map/warp tweens that land exactly on damper targets — no pose pops), drives station activation by path distance (|Δt|<0.22, hysteresis 0.03), projects taps via raycast (station cores + R&D satellite orbiters; constellation nodes only in map mode), and syncs the DOM layer (HUD/panels/intro). All copy lives in `src/content/content.ts` — 3D stations, panels, HUD, deep links, and the a11y mirror are all generated from it. Quality tiers (0/1/2) adapt DPR/particles/bloom from live fps sampling.

## 5. Known sharp edges (read before touching)

- **Scene brightness is a coupled system**: ACES exposure (renderer) × envMapIntensity (materials) × bloom threshold. Touch one, re-check the others against `public/og.jpg` (the brand-mood reference). History: the #1 art-direction failure mode was "premium dark" drifting to "bright silver plastic".
- **The additive arrival cone flooded the frame once** (fixed at opacities 0.035/0.05) — additive DoubleSide cones are ~4 passes; treat opacity changes with care.
- **e2e drives 3D via a dev-only seam** `window.__smE2E` in `orchestrator.ts` — `import.meta.env.DEV`-gated, tree-shaken from prod. Headless SwiftShader runs RAF slowly; helpers await camera state rather than sleeping, and snap off the panel's CSS transition (environment artifact, documented in `e2e/helpers.ts`).
- **vitest is scoped to `src/**`** (vite.config.ts) so it never sweeps up `e2e/*.spec.ts`.
- CI does **not** run e2e (no browser install step) — unit+typecheck+build only.
- The mirror (`#mirror`) uses clip-path hiding (screen-reader-readable); do not switch it to `display:none`.

## 6. Business placeholders (grep `EDIT-ME`)

1. Contact email `contact@solutionmakers.io` — `src/content/content.ts`.
2. LinkedIn company slug — `src/content/content.ts`.
3. `og:image`/`og:url` absolute URLs point at the GitHub Pages address — update on custom domain, together with the `<noscript>` block in `index.html`.

## 7. Prioritized backlog (v2 candidates — none started)

1. **Real values for §6** — minutes, then push (auto-deploys).
2. **Custom domain** — GitHub Pages custom domain, or Cloudflare Worker (no CF auth exists on this machine yet; needs `npx wrangler login` or an API token). Update og tags after.
3. **Real-device feel pass** — tune inertia decay (2.2/s), snap range (0.045), look gains on actual phones; constants live at the top of `cameraRig.ts`/`orchestrator.ts`.
4. **Content depth** — case studies per station / satellite detail pages; extend `StationDef` and `PanelLayer` (both built to extend), keep all copy in content.ts.
5. **French (spec'd as v2)** — copy deck is one file; add a locale switch + `SITE`/`STATIONS` variants.
6. **Housekeeping** — delete remote feature branch; optionally add a CI e2e job (`pnpm exec playwright install chromium --with-deps` on ubuntu); consider disposing `RoomEnvironment` scene post-PMREM (one-time ~negligible leak, noted in review).

## 7b. Post-launch fix — mobile touch (2026-07-06)

**Reported:** "unusable on mobile, merely navigable on desktop." **True.**
Root cause: only `#scene` (canvas) had `touch-action: none`. The DOM overlays
that host GestureControllers — `.sm-intro` (drag-to-enter) and `.sm-panel`
(swipe-to-close) — were `touch-action: auto`, so a mobile browser read the
enter-drag as page-scroll and fired `pointercancel` after the first move; the
24px enter threshold never accumulated and visitors were stuck on the arrival
screen. Desktop uses wheel/click (touch-action-immune), hence "merely
navigable." Fix in `src/style.css`: `touch-action:none` on `.sm-intro` and a
full-width `.sm-panel__handle` grab strip; `pan-y` on `.sm-panel__content` so
it still scrolls.

**Why the e2e suite missed it (the important lesson):** the mobile `enter()`
helper did a single 60px `touchMove` — a teleport that crosses the threshold in
one emit, before any `pointercancel`. Real fingers emit many small moves.
`enter()` now uses an incremental `touchDrag` helper, and a mobile-only test
("real finger drags drive entry and sheet dismissal") guards it. When adding
touch tests, always drive **incremental** moves, never one jump.

## 8. Working conventions used throughout (keep them)

- TDD for logic modules; smoke tests assert real structure (counts, radii, userData), not no-throw.
- Visual work is verified by **looking at screenshots** (Playwright → Read), iterating until it matches the presskit mood — never by assumption.
- Per-frame code allocates nothing (scratch vectors/Float32Arrays); materials are mutated, never recreated.
- Commit trailer: `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>` (adjust to your model).
