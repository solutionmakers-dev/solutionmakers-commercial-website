export interface Satellite { id: string; title: string; blurb: string }
export type Motif = 'orbits' | 'grid' | 'swarm' | 'circuit' | 'satellites' | 'contact'
export interface StationDef {
  id: string; title: string; tagline: string; body: string;
  capabilities: string[]; motif: Motif; t: number; satellites?: Satellite[]
}

export const SITE = {
  name: 'SOLUTION MAKERS',
  email: 'contact@solutionmakers.io', // EDIT-ME: replace with the real contact address
  manifesto: {
    line1: 'We make solutions.',
    line2: 'Software, intelligence and hardware — imagined, engineered and shipped end to end.',
  },
  hint: 'slide to enter',
}

export const STATIONS: StationDef[] = [
  {
    id: 'consulting',
    title: 'Consulting',
    tagline: 'Senior minds on hard problems.',
    body: 'We embed with your teams to untangle architecture, rescue delivery and design systems that survive contact with reality. Strategy that ships.',
    capabilities: ['Architecture & audits', 'Delivery rescue & leadership', 'Cloud & platform engineering', 'Security by design'],
    motif: 'orbits',
    t: 0.16,
  },
  {
    id: 'software',
    title: 'Software Products',
    tagline: 'Apps and SaaS, crafted like instruments.',
    body: 'From consumer apps to industrial SaaS, we design, build and operate products people rely on daily — fast, beautiful and maintainable.',
    capabilities: ['Mobile & web apps', 'SaaS platforms', 'Design systems & UX', 'Product operations'],
    motif: 'grid',
    t: 0.32,
  },
  {
    id: 'ai',
    title: 'AI Systems',
    tagline: 'Intelligence, applied with judgment.',
    body: 'We build AI that earns its place in production: agents, copilots, vision and language systems wired into real workflows with real guardrails.',
    capabilities: ['LLM agents & copilots', 'Applied ML & vision', 'RAG & knowledge systems', 'Evaluation & safety'],
    motif: 'swarm',
    t: 0.48,
  },
  {
    id: 'hardware',
    title: 'Hardware Innovation',
    tagline: 'Atoms, meet bits.',
    body: 'Connected devices, embedded platforms and the firmware that makes them feel alive — prototyped in-house and taken to production.',
    capabilities: ['Embedded & IoT', 'Prototyping to production', 'Firmware & connectivity', 'Industrial design partners'],
    motif: 'circuit',
    t: 0.64,
  },
  {
    id: 'rd',
    title: 'R&D Lab',
    tagline: 'Where the next divisions are born.',
    body: 'A standing lab exploring domains where technology can still surprise: ventures we incubate, operate and spin out.',
    capabilities: ['Venture incubation', 'Domain research', 'Rapid pilots', 'Spin-out engineering'],
    motif: 'satellites',
    t: 0.80,
    satellites: [
      {
        id: 'consumer',
        title: 'Consumer Apps',
        blurb: 'Products for daily life, from social to lifestyle — designed for retention, not addiction.',
      },
      {
        id: 'real-estate',
        title: 'Real Estate',
        blurb: 'Property tech that moves markets: listings intelligence, media automation, transaction tooling.',
      },
      {
        id: 'trade',
        title: 'Import / Export',
        blurb: 'Trade tooling for a connected world: sourcing, logistics visibility and cross-border commerce.',
      },
      {
        id: 'health',
        title: 'Medical & Health',
        blurb: 'Careful technology for care: patient experience, clinical workflow and health data done right.',
      },
    ],
  },
  {
    id: 'contact',
    title: 'Make With Us',
    tagline: 'Have a problem worth solving?',
    body: 'Tell us what you are trying to build — or untangle. We answer personally, usually within a day.',
    capabilities: ['Projects & partnerships', 'Product co-development', 'Long-term engineering'],
    motif: 'contact',
    t: 1.0,
  },
]
