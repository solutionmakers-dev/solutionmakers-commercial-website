/**
 * damp — frame-rate-independent exponential smoothing toward a target.
 *
 *   damp(current, target, lambda, dt) = current + (target-current)·(1 - e^{-λ·dt})
 *
 * The residual (target - result) is (target - current)·e^{-λ·dt}. Because the
 * exponential factors across sub-steps, the result is exactly the same whether
 * you take one step of `dt` or two of `dt/2` — so smoothing feels identical at
 * 30, 60 or 144 fps. `lambda` is the rate (larger = snappier); the effective
 * time constant is ~1/lambda seconds. Never overshoots for lambda,dt ≥ 0.
 */
export function damp(current: number, target: number, lambda: number, dt: number): number {
  return current + (target - current) * (1 - Math.exp(-lambda * dt))
}

export type Easing = (t: number) => number

/** Smooth acceleration in, deceleration out. The default easing for Tween. */
export const easeInOutCubic: Easing = (t) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2

/**
 * Tween — a one-shot scalar interpolation from `from` to `to` over `ms`
 * milliseconds, driven by `update(dt)` where `dt` is in **seconds** (matching
 * the render loop and `damp`). Eased with `easeInOutCubic` by default.
 *
 * The final `update` that reaches the end clamps progress to exactly 1, so the
 * reported value lands **exactly** on `to` — there is no residual to pop when a
 * downstream damper takes over. `onDone` fires once, on completion. `cancel()`
 * stops the tween immediately and suppresses `onDone`. A Tween is reusable:
 * calling `start` again resets it (the CameraRig relies on this — it owns a
 * single Tween and restarting it is how "only one camera tween at a time" is
 * enforced).
 */
export class Tween {
  private from = 0
  private to = 0
  private durationMs = 0
  private elapsedMs = 0
  private ease: Easing = easeInOutCubic
  private onUpdate: (value: number) => void = () => {}
  private onDone: (() => void) | undefined
  private active = false

  get isActive(): boolean {
    return this.active
  }

  start(
    from: number,
    to: number,
    ms: number,
    ease: Easing = easeInOutCubic,
    onUpdate: (value: number) => void = () => {},
    onDone?: () => void,
  ): void {
    this.from = from
    this.to = to
    this.durationMs = ms
    this.elapsedMs = 0
    this.ease = ease
    this.onUpdate = onUpdate
    this.onDone = onDone
    this.active = true
  }

  update(dt: number): void {
    if (!this.active) return
    this.elapsedMs += dt * 1000

    // A non-positive duration means "arrive immediately".
    const raw = this.durationMs > 0 ? Math.min(this.elapsedMs / this.durationMs, 1) : 1
    const eased = this.ease(raw)
    this.onUpdate(this.from + (this.to - this.from) * eased)

    if (raw >= 1) this.finish()
  }

  cancel(): void {
    this.active = false
    this.onDone = undefined
  }

  private finish(): void {
    this.active = false
    const done = this.onDone
    this.onDone = undefined
    done?.()
  }
}
