/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const favicon = readFileSync('public/favicon.svg', 'utf8')

describe('the tab icon is the DocVault glyph (R-E)', () => {
  it('is a #171717 rounded square with the Lucide FileText paths', () => {
    expect(favicon).toContain('<title>DocVault</title>')
    expect(favicon).toContain('#171717')
    expect(favicon).toContain('M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z')
    expect(favicon).toContain('M14 2v5a1 1 0 0 0 1 1h5')
    expect(favicon).toContain('M10 9H8')
    expect(favicon).toContain('M16 13H8')
    expect(favicon).toContain('M16 17H8')
  })

  it('no longer has the old layers path, gradient or purple', () => {
    expect(favicon).not.toContain('M12.83 2.18')
    expect(favicon).not.toMatch(/linearGradient|#7d36d9|#2948c8/i)
  })

  it('keeps the Lucide licence comment', () => {
    expect(favicon).toContain('ISC License')
    expect(favicon).toContain('Lucide Icons and Contributors')
  })
})

describe('the theme colour is white (R-D, R-E)', () => {
  it('is #FFFFFF in index.html', () => {
    expect(readFileSync('index.html', 'utf8')).toMatch(/<meta name="theme-color" content="#FFFFFF"\s*\/?>/)
  })

  it('is #FFFFFF in the manifest, which still points at /favicon.svg', () => {
    const manifest = JSON.parse(readFileSync('public/manifest.json', 'utf8'))
    expect(manifest.theme_color).toBe('#FFFFFF')
    expect(manifest.icons[0].src).toBe('/favicon.svg')
  })
})

describe('typefaces', () => {
  it('loads Geist Mono in the same Google Fonts link as Geist and Archivo, which the landing preview names', () => {
    const html = readFileSync('index.html', 'utf8')
    const links = html.match(/<link href="https:\/\/fonts\.googleapis\.com\/css2[^>]*>/g) ?? []
    expect(links).toHaveLength(1)
    for (const family of ['family=Archivo', 'family=Geist:', 'family=Geist+Mono']) expect(links[0]).toContain(family)
    expect(readFileSync('src/pages/landing.css', 'utf8')).toContain("'Geist Mono'")
  })
})
