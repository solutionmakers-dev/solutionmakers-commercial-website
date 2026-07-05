/**
 * reducedMotion — a single guarded read of the user's OS-level motion
 * preference. `window`/`matchMedia` may not exist (node/SSR/test) so the
 * check degrades to "false" (full motion) rather than throwing — callers
 * never need to feature-detect this themselves.
 */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}
