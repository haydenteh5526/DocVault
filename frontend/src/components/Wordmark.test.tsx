// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { VaultMonogram } from './VaultMonogram'
import { Wordmark } from './Wordmark'

afterEach(cleanup)

it('draws the metallic mark, decorative, at the size asked for: an obsidian tile with a rim, a silver page, a dark keyhole', () => {
  const { container } = render(<VaultMonogram size={40} />)
  const svg = container.querySelector('svg')!
  expect(svg.getAttribute('aria-hidden')).toBe('true')
  expect(svg.getAttribute('width')).toBe('40')
  expect(svg.getAttribute('viewBox')).toBe('0 0 64 64')
  const stops = (name: string) =>
    [...svg.querySelectorAll(`[id^="dv-${name}-"] stop`)].map(s => s.getAttribute('stop-color'))
  expect(stops('tile')).toEqual(['#141417', '#09090B'])
  expect(stops('page')).toEqual(['#FFFFFF', '#D4D4D8', '#A1A1AA'])
  expect(stops('rim')[0]).toBe('#FFFFFF')
  const tile = svg.querySelector('rect')!
  expect(tile.getAttribute('rx')).toBe('14')
  expect(tile.getAttribute('fill')).toMatch(/^url\(#dv-tile-/)
  expect(tile.getAttribute('stroke')).toMatch(/^url\(#dv-rim-/)
  const page = svg.querySelector(`path[d="M18.5 9H35V18.5A3.5 3.5 0 0 0 38.5 22H50V50.5A4.5 4.5 0 0 1 45.5 55H18.5A4.5 4.5 0 0 1 14 50.5V13.5A4.5 4.5 0 0 1 18.5 9Z"]`)!
  expect(page.getAttribute('fill')).toMatch(/^url\(#dv-page-/)
  expect(svg.querySelector('circle')!.getAttribute('fill')).toBe('#09090B')
  expect(svg.querySelectorAll('filter, image')).toHaveLength(0)
})

it('gives each mark its own gradient ids, so two on one page never share them', () => {
  const { container } = render(<><VaultMonogram /><VaultMonogram /></>)
  const ids = [...container.querySelectorAll('linearGradient')].map(g => g.id)
  expect(ids).toHaveLength(8)
  expect(new Set(ids).size).toBe(8)
  for (const el of container.querySelectorAll('[fill^="url(#"]')) {
    const ref = el.getAttribute('fill')!.slice(5, -1)
    expect(el.closest('svg')!.querySelector(`[id="${ref}"]`)).not.toBeNull()
  }
})

it('shows the monogram beside the text DocVault, in the brand ink', () => {
  const { container } = render(<Wordmark />)
  expect(screen.getByRole('img', { name: 'DocVault' })).toBeTruthy()
  expect(container.textContent).toContain('DocVault')
  expect(container.querySelector('svg path[d^="M18.5 9H35"]')).not.toBeNull()
  const root = container.firstElementChild as HTMLElement
  expect(root.style.color).toBe('var(--brand-ink)')
})
