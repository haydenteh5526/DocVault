/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const index = readFileSync('src/index.css', 'utf8')
const landing = readFileSync('src/pages/landing.css', 'utf8')

describe('landing display face (N2)', () => {
  it('defines --font-display with Archivo and the page loads Archivo', () => {
    expect(index).toMatch(/--font-display:\s*'Archivo'/)
    expect(readFileSync('index.html', 'utf8')).toContain('family=Archivo')
  })
})

describe('page transitions (N3)', () => {
  it('cross-fades the root over 180 ms with an 8 px rise on the new page', () => {
    expect(index).toMatch(/::view-transition-old\(root\)\s*\{[^}]*180ms/)
    expect(index).toMatch(/::view-transition-new\(root\)\s*\{[^}]*180ms/)
    expect(index).toMatch(/@keyframes vtIn\s*\{[^}]*translateY\(8px\)/)
  })

  it('turns every view-transition animation off under reduced motion', () => {
    expect(index).toMatch(/prefers-reduced-motion: reduce\)\s*\{[^}]*::view-transition-group\(\*\)[^}]*animation:\s*none/)
  })
})

describe('the hero load animation (N5)', () => {
  it('is scoped to the landing page, so the account pages do not play it', () => {
    const rules = landing.split(/\r?\n/).filter(line => line.includes('html.motion-ok') && /\.(h1-line|hero-lead)/.test(line))
    expect(rules.length).toBeGreaterThan(0)
    for (const rule of rules) expect(rule.match(/html\.motion-ok\s+\S+/g)!.every(part => /\.poster/.test(rule.slice(rule.indexOf(part)).split('{')[0]))).toBe(true)
  })
})

describe('the sticky landing header', () => {
  it('sticks to the top with a 75% tint, no blur, and a border only when scrolled', () => {
    expect(landing).toMatch(/\.poster-nav \{[^}]*position: sticky;[^}]*top: 0;[^}]*color-mix\(in srgb, var\(--background\) 75%, transparent\)/)
    expect(landing).toMatch(/\.poster-nav\[data-scrolled='true'\] \{\s*border-bottom-color: var\(--border\);\s*\}/)
    expect(landing).not.toMatch(/backdrop-filter/)
  })

  it('goes opaque under reduced transparency and drops the fade under reduced motion', () => {
    expect(landing).toMatch(/@media \(prefers-reduced-transparency: reduce\) \{\s*\.docbot-site \.poster-nav \{\s*background-color: var\(--background\);/)
    expect(landing).toMatch(/@media \(prefers-reduced-motion: reduce\) \{\s*\.docbot-site \.poster-nav \{\s*transition: none;/)
  })
})
