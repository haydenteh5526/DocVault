/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const favicon = readFileSync('public/favicon.svg', 'utf8')

describe('the tab icon is the Vault-Page Monogram', () => {
  it('is the metallic mark: an obsidian gradient tile with a top rim, a white-to-silver page and a dark keyhole, titled DocVault', () => {
    expect(favicon).toContain('<title>DocVault</title>')
    expect(favicon).toContain('<rect x="0.5" y="0.5" width="63" height="63" rx="14" fill="url(#dv-tile)" stroke="url(#dv-rim)" stroke-width="1"/>')
    expect(favicon).toMatch(/id="dv-tile"[\s\S]*?#141417[\s\S]*?#09090B/)
    expect(favicon).toMatch(/id="dv-page"[\s\S]*?#FFFFFF[\s\S]*?#D4D4D8[\s\S]*?#A1A1AA/)
    expect(favicon).toMatch(/id="dv-rim"[\s\S]*?stop-color="#FFFFFF" stop-opacity="0.6"/)
    expect(favicon).toContain('<path d="M18.5 9H35V18.5A3.5 3.5 0 0 0 38.5 22H50V50.5A4.5 4.5 0 0 1 45.5 55H18.5A4.5 4.5 0 0 1 14 50.5V13.5A4.5 4.5 0 0 1 18.5 9Z" fill="url(#dv-page)"/>')
    expect(favicon).toContain('<circle cx="32" cy="28.5" r="5.5" fill="#09090B"/>')
    expect(favicon).not.toMatch(/<filter|<image|feGaussianBlur/)
  })

  it('fills about 72% of the tile height with the page', () => {
    expect((55 - 9) / 64).toBeCloseTo(0.72, 2)
    expect(favicon).toContain('M18.5 9H35')
  })

  it('matches the VaultMonogram component the navbar draws', () => {
    const component = readFileSync('src/components/VaultMonogram.tsx', 'utf8')
    for (const d of favicon.match(/ d="[^"]+"/g)!) expect(component).toContain(d)
  })

  it('ships a PNG-based favicon.ico and a 180 px apple-touch-icon, all linked from index.html', () => {
    const ico = readFileSync('public/favicon.ico')
    expect([ico.readUInt16LE(0), ico.readUInt16LE(2), ico.readUInt16LE(4)]).toEqual([0, 1, 3])
    const png = readFileSync('public/apple-touch-icon.png')
    expect(png.subarray(1, 4).toString()).toBe('PNG')
    expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([180, 180])
    const html = readFileSync('index.html', 'utf8')
    expect(html).toContain('<link rel="icon" href="/favicon.ico" sizes="32x32" />')
    expect(html).toContain('<link rel="icon" type="image/svg+xml" href="/favicon.svg" />')
    expect(html).toContain('<link rel="apple-touch-icon" href="/apple-touch-icon.png" />')
  })

  it('no longer has the FileText paths, the old layers path or the old purple gradient', () => {
    expect(favicon).not.toContain('M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8')
    expect(favicon).not.toContain('M12.83 2.18')
    expect(favicon).not.toMatch(/#7d36d9|#2948c8|Lucide/i)
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
