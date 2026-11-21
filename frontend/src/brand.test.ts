/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const favicon = readFileSync('public/favicon.svg', 'utf8')

describe('the tab icon is the Vault-Page Monogram', () => {
  it('is the monogram in #171717 on a transparent background, titled DocVault', () => {
    expect(favicon).toContain('<title>DocVault</title>')
    expect(favicon).toContain('#171717')
    expect(favicon).toContain('M30.8 32.5h3.4l1.1 7h-5.6z')
    expect(favicon).toContain('M20.5 15h19l9 9v21.5a4.5 4.5 0 0 1-4.5 4.5h-23.5a4.5 4.5 0 0 1-4.5-4.5v-26a4.5 4.5 0 0 1 4.5-4.5z')
    expect(favicon).not.toMatch(/<rect[^>]*width="(80|64)"[^>]*fill="#171717"/)
  })

  it('no longer has the FileText paths, the old layers path, a gradient or purple', () => {
    expect(favicon).not.toContain('M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8')
    expect(favicon).not.toContain('M12.83 2.18')
    expect(favicon).not.toMatch(/linearGradient|#7d36d9|#2948c8|Lucide/i)
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
