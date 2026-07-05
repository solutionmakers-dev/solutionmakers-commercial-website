// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { buildMirror, revealMirrorAsFallback } from './mirror'
import { SITE, STATIONS } from '../content/content'

let root: HTMLElement

beforeEach(() => {
  // Deliberately NOT attached to document.body: attaching a fresh `id="mirror"`
  // element every test (without removing the previous one) would leave
  // duplicate ids in the document, and jsdom's ID-selector fast path
  // (`getElementById`, doc-wide) would then resolve to the wrong element
  // instead of the one scoped under this test's `root`. querySelector works
  // fine on a detached tree, so there's no need to attach it at all.
  root = document.createElement('main')
  root.id = 'mirror'
})

describe('buildMirror — structure', () => {
  it('renders the site name as an h1', () => {
    buildMirror(root, STATIONS, SITE)
    const h1 = root.querySelector('h1')
    expect(h1).not.toBeNull()
    expect(h1?.textContent).toContain(SITE.name)
  })

  it('renders the manifesto as real text', () => {
    buildMirror(root, STATIONS, SITE)
    expect(root.textContent).toContain(SITE.manifesto.line1)
    expect(root.textContent).toContain(SITE.manifesto.line2)
  })

  it('renders exactly one <section id="s-{id}"> per station', () => {
    buildMirror(root, STATIONS, SITE)
    const sections = root.querySelectorAll('section')
    expect(sections.length).toBe(STATIONS.length)
    expect(sections.length).toBe(6)
    for (const st of STATIONS) {
      expect(root.querySelector(`#s-${st.id}`)).not.toBeNull()
    }
  })

  it('each section has an h2 title, a body paragraph and a capability list', () => {
    buildMirror(root, STATIONS, SITE)
    for (const st of STATIONS) {
      const section = root.querySelector(`#s-${st.id}`)!
      expect(section.querySelector('h2')?.textContent).toBe(st.title)
      expect(section.textContent).toContain(st.tagline)
      expect(section.textContent).toContain(st.body)
      const items = Array.from(section.querySelectorAll('li')).map((li) => li.textContent)
      for (const cap of st.capabilities) expect(items.some((t) => t?.includes(cap))).toBe(true)
    }
  })

  it('lists the R&D satellites within the rd section', () => {
    buildMirror(root, STATIONS, SITE)
    const rd = STATIONS.find((s) => s.id === 'rd')!
    const section = root.querySelector('#s-rd')!
    for (const sat of rd.satellites ?? []) {
      expect(section.textContent).toContain(sat.title)
      expect(section.textContent).toContain(sat.blurb)
    }
  })

  it('renders a mailto link to the site email', () => {
    buildMirror(root, STATIONS, SITE)
    const link = root.querySelector<HTMLAnchorElement>('a[href^="mailto:"]')
    expect(link).not.toBeNull()
    expect(link?.getAttribute('href')).toBe(`mailto:${SITE.email}`)
    expect(link?.textContent).toContain(SITE.email)
  })

  it('is idempotent — calling it again does not duplicate content', () => {
    buildMirror(root, STATIONS, SITE)
    buildMirror(root, STATIONS, SITE)
    expect(root.querySelectorAll('section').length).toBe(STATIONS.length)
    expect(root.querySelectorAll('h1').length).toBe(1)
  })
})

describe('revealMirrorAsFallback', () => {
  it('adds the mirror-visible class, unhiding it', () => {
    expect(root.classList.contains('mirror-visible')).toBe(false)
    revealMirrorAsFallback(root)
    expect(root.classList.contains('mirror-visible')).toBe(true)
  })
})
