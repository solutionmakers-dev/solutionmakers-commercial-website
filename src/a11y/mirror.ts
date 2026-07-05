import type { StationDef } from '../content/content'
import type { SITE } from '../content/content'

/**
 * mirror — the accessible/SEO "mirror" of the 3D experience.
 *
 * `buildMirror` renders the exact same content that lives in the 3D scene
 * (site name, manifesto, one section per station, capabilities, R&D
 * satellites, contact email) as plain, focusable DOM inside `<main
 * id="mirror">`. It is built unconditionally on every boot — screen readers
 * and crawlers get real text regardless of whether WebGL is available — the
 * element itself starts visually hidden via a clip-path rule in style.css.
 *
 * `revealMirrorAsFallback` is the no-WebGL escape hatch: it adds
 * `mirror-visible`, which style.css turns into an elegant static dark page
 * (see the "Task 15" commented section there) covering the whole viewport.
 */

type Site = typeof SITE

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text !== undefined) node.textContent = text
  return node
}

function buildHeader(site: Site): HTMLElement {
  const header = el('header', 'sm-mirror__intro')

  const logo = el('img', 'sm-mirror__logo')
  logo.src = `${import.meta.env.BASE_URL}logo-white.png`
  logo.alt = ''
  logo.setAttribute('aria-hidden', 'true')

  const h1 = el('h1', 'sm-mirror__h1', site.name)
  const manifesto = el('p', 'sm-mirror__manifesto', `${site.manifesto.line1} ${site.manifesto.line2}`)

  header.append(logo, h1, manifesto)
  return header
}

function buildCapabilityList(capabilities: string[]): HTMLUListElement {
  const list = el('ul', 'sm-mirror__list')
  for (const cap of capabilities) list.appendChild(el('li', '', cap))
  return list
}

function buildSatelliteList(station: StationDef): HTMLUListElement | null {
  if (!station.satellites || station.satellites.length === 0) return null
  const list = el('ul', 'sm-mirror__list sm-mirror__satellites')
  for (const sat of station.satellites) {
    const item = el('li', '')
    const strong = el('strong', '', sat.title)
    item.append(strong, document.createTextNode(` — ${sat.blurb}`))
    list.appendChild(item)
  }
  return list
}

function buildSection(station: StationDef, site: Site): HTMLElement {
  const section = el('section', 'sm-mirror__section')
  section.id = `s-${station.id}`

  section.append(
    el('h2', 'sm-mirror__title', station.title),
    el('p', 'sm-mirror__tagline u-label', station.tagline),
    el('p', 'sm-mirror__body', station.body),
    buildCapabilityList(station.capabilities),
  )

  const satellites = buildSatelliteList(station)
  if (satellites) section.appendChild(satellites)

  if (station.motif === 'contact') {
    const link = el('a', 'sm-mirror__email', site.email)
    link.href = `mailto:${site.email}`
    section.appendChild(link)
  }

  return section
}

/** Renders the site + every station as real, focusable DOM inside `root`.
 *  Idempotent — safe to call more than once (clears prior content first). */
export function buildMirror(root: HTMLElement, stations: StationDef[], site: Site): void {
  root.replaceChildren()
  root.appendChild(buildHeader(site))
  for (const station of stations) root.appendChild(buildSection(station, site))
}

/** No-WebGL fallback: unhides `root` and styles it as a static elegant page
 *  (see style.css's `.mirror-visible` rules). */
export function revealMirrorAsFallback(root: HTMLElement): void {
  root.classList.add('mirror-visible')
}
