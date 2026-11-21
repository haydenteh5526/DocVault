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

describe('the landing header links and tiles', () => {
  it('brightens the header links on hover with no pill, as on t3.codes', () => {
    expect(landing).toMatch(/\.poster-nav-link \{[^}]*color: #c4c4ca;[^}]*transition: color 180ms;/)
    expect(landing).toMatch(/\.poster-nav-link:hover,\s*\.poster-nav-link:focus-visible \{\s*color: var\(--foreground\);\s*\}/)
    expect(landing).not.toMatch(/\.poster-nav-link[^{]*\{[^}]*background/)
  })

  it('shifts each tile by the cursor times its depth, and not under reduced motion', () => {
    expect(landing).toMatch(/\.float-mark \{[^}]*translate: calc\(var\(--px\) \* var\(--depth, 1\)\) calc\(var\(--py\) \* var\(--depth, 1\)\);[^}]*transition: translate 700ms/)
    expect(landing).toMatch(/prefers-reduced-motion: reduce\) \{[^@]*\.float-mark \{\s*translate: none;\s*transition: none;/)
  })

  it('keeps only the large tiles up to 1100 px and none below 900 px', () => {
    expect(landing).toMatch(/@media \(max-width: 1100px\) \{\s*\.float-mark-docbot,\s*\.float-mark-shopping,\s*\.float-mark-file,\s*\.float-mark-warranty \{\s*display: none;/)
    expect(landing).toMatch(/@media \(max-width: 899px\) \{\s*\.floating-tiles \{\s*display: none;/)
  })

  it('plays the t3-style load-in only under html.motion-ok, with staggered delays', () => {
    for (const [selector, delay] of [['.h1-line', 'var(--d, 0ms)'], ['.hero-lead', '300ms'], ['.hero-links', '400ms'], ['.product-picture', '520ms']])
      expect(landing).toContain(`html.motion-ok .poster ${selector} { animation: landingRise 700ms cubic-bezier(0.2, 0.7, 0.2, 1) ${delay} both; }`)
    expect(landing).toMatch(/html\.motion-ok \.poster \.float-tile \{ animation: tileIn 1s/)
    expect(landing).toMatch(/@keyframes tileIn \{\s*from \{\s*opacity: 0;\s*transform: translate\(var\(--fx\), var\(--fy\)\) rotate\(calc\(var\(--rot\) \+ 24deg\)\) scale\(0\.6\);/)
  })

  it('sets the landing page in the t3.codes font stack at weight 600', () => {
    expect(landing).toContain("font-family: -apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', system-ui, sans-serif;")
    expect(landing).not.toContain('font-weight: 800;')
    expect(readFileSync('index.html', 'utf8')).toContain('family=Inter:wght@100..900')
  })
})
