/**
 * deepLink — the URL hash is a shareable pointer to a station.
 *
 * `#software` boots the site focused on that station (main warps there after
 * the intro), and navigation keeps the hash in sync as the visitor dives /
 * warps. Everything is validated against the station ids in content.ts —
 * an unknown hash reads as null and unknown ids are never written.
 *
 * `history.replaceState` (not `location.hash = …`) so hash upkeep never
 * pollutes the back button with one entry per dive.
 */
import { STATIONS } from '../content/content'

const VALID_IDS = new Set(STATIONS.map((s) => s.id))

/** The station id in the current URL hash, or null if absent/not a station. */
export function readHash(): string | null {
  const raw = location.hash.replace(/^#/, '')
  return VALID_IDS.has(raw) ? raw : null
}

/** Write `#id` (validated) or clear the hash entirely with `null`. */
export function writeHash(id: string | null): void {
  if (id !== null && !VALID_IDS.has(id)) return
  const base = location.pathname + location.search
  history.replaceState(null, '', id === null ? base : `${base}#${id}`)
}
