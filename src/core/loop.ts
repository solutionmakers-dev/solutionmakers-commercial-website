const MAX_DT_S = 1 / 20

/**
 * Drives a requestAnimationFrame loop, calling `cb(dt, elapsed)` every frame.
 * `dt` is the seconds since the previous frame, clamped to 1/20s so a stall
 * (tab switch, GC pause) can't produce a huge simulation step. `elapsed` is
 * the running total of (clamped) dt since the loop started.
 *
 * Returns a stop function that cancels the loop.
 */
export function startLoop(cb: (dt: number, elapsed: number) => void): () => void {
  let rafId = 0
  let stopped = false
  let last: number | undefined
  let elapsed = 0

  const tick = (now: number): void => {
    if (stopped) return

    const dt = last === undefined ? 0 : Math.min((now - last) / 1000, MAX_DT_S)
    last = now
    elapsed += dt

    cb(dt, elapsed)

    if (!stopped) rafId = requestAnimationFrame(tick)
  }

  rafId = requestAnimationFrame(tick)

  return () => {
    stopped = true
    cancelAnimationFrame(rafId)
  }
}
