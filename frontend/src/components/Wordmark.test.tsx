// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { VaultMonogram } from './VaultMonogram'
import { Wordmark } from './Wordmark'

afterEach(cleanup)

it('draws the Vault-Page Monogram in currentColor, decorative, at the size asked for', () => {
  const { container } = render(<VaultMonogram size={40} />)
  const svg = container.querySelector('svg')!
  expect(svg.getAttribute('aria-hidden')).toBe('true')
  expect(svg.getAttribute('width')).toBe('40')
  expect(svg.getAttribute('viewBox')).toBe('0 0 64 64')
  const frame = svg.querySelector('rect')!
  expect([frame.getAttribute('x'), frame.getAttribute('y'), frame.getAttribute('width'), frame.getAttribute('rx'), frame.getAttribute('stroke-width')])
    .toEqual(['5', '5', '54', '14', '6'])
  expect(svg.innerHTML).toContain('M30.8 32.5h3.4l1.1 7h-5.6z')
  expect(svg.innerHTML).toContain('M39.5 15v6.5a2.5 2.5 0 0 0 2.5 2.5h6.5z')
  expect(svg.innerHTML).toContain('M21.5 21.5v22')
  expect(svg.querySelector('circle')?.getAttribute('r')).toBe('3.6')
  expect(svg.innerHTML).not.toMatch(/#[0-9a-f]{3,6}/i)
})

it('shows the monogram beside the text DocVault, in the brand ink', () => {
  const { container } = render(<Wordmark />)
  expect(screen.getByRole('img', { name: 'DocVault' })).toBeTruthy()
  expect(container.textContent).toContain('DocVault')
  expect(container.querySelector('svg path[d^="M20.5 15h19"]')).not.toBeNull()
  const root = container.firstElementChild as HTMLElement
  expect(root.style.color).toBe('var(--brand-ink)')
})
