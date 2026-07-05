export type Tier = 0 | 1 | 2

export interface TierConfig {
  dprScale: number
  particleScale: number
  bloom: boolean
}

export const TIERS: Record<Tier, TierConfig> = {
  0: { dprScale: 0.6, particleScale: 0.35, bloom: false },
  1: { dprScale: 0.8, particleScale: 0.7, bloom: true },
  2: { dprScale: 1, particleScale: 1, bloom: true },
}

const ROLLING_WINDOW = 60
const SLOW_FPS = 45
const FAST_FPS = 55
const SLOW_FRAMES_TO_STEP_DOWN = 90
const FAST_FRAMES_TO_STEP_UP = 300
const COOLDOWN_S = 3

/** Isolated so the UA/DPR sniffing stays in one readable place. */
function isMobileUA(ua: string): boolean {
  return /Android|iPhone|iPad|iPod|Mobile/i.test(ua)
}

/** Starting tier: 2, unless it's a high-DPR mobile device, then 1. */
export function detectInitialTier(): Tier {
  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio : undefined
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : ''
  if (dpr !== undefined && dpr > 2.5 && isMobileUA(ua)) return 1
  return 2
}

function defaultNow(): number {
  return (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000
}

export class QualityManager {
  tier: Tier

  private readonly nowFn: () => number
  private buffer: number[] = []
  private consecutiveSlow = 0
  private consecutiveFast = 0
  private lastChangeAt: number
  private readonly listeners: Array<(t: Tier) => void> = []

  constructor(nowFn?: () => number) {
    this.nowFn = nowFn ?? defaultNow
    this.tier = detectInitialTier()
    // Seed in the past so the cooldown never gates the very first tier transition —
    // cooldown only applies BETWEEN changes, per spec.
    this.lastChangeAt = this.nowFn() - COOLDOWN_S
  }

  sample(dt: number): void {
    this.buffer.push(dt)
    if (this.buffer.length > ROLLING_WINDOW) this.buffer.shift()

    const avgDt = this.buffer.reduce((sum, v) => sum + v, 0) / this.buffer.length
    const fps = 1 / Math.max(avgDt, 1e-6)

    if (fps < SLOW_FPS) {
      this.consecutiveSlow++
      this.consecutiveFast = 0
    } else if (fps > FAST_FPS) {
      this.consecutiveFast++
      this.consecutiveSlow = 0
    } else {
      this.consecutiveSlow = 0
      this.consecutiveFast = 0
    }

    const now = this.nowFn()
    // Tiny epsilon guards against float-accumulation drift landing a hair under the boundary.
    const cooldownElapsed = now - this.lastChangeAt >= COOLDOWN_S - 1e-6

    if (this.consecutiveSlow >= SLOW_FRAMES_TO_STEP_DOWN && this.tier > 0 && cooldownElapsed) {
      this.applyTier((this.tier - 1) as Tier, now)
    } else if (this.consecutiveFast >= FAST_FRAMES_TO_STEP_UP && this.tier < 2 && cooldownElapsed) {
      this.applyTier((this.tier + 1) as Tier, now)
    }
  }

  onChange(cb: (t: Tier) => void): void {
    this.listeners.push(cb)
  }

  private applyTier(next: Tier, now: number): void {
    this.tier = next
    this.lastChangeAt = now
    this.buffer = []
    this.consecutiveSlow = 0
    this.consecutiveFast = 0
    for (const cb of this.listeners) cb(next)
  }
}
