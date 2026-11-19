// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { SourceTie } from './SourceTie'
import { StatusTag } from './StatusTag'
import { Wordmark } from './Wordmark'
import { Button } from './ui/button'

afterEach(cleanup)

it('ties a checked value and its correction to the original OCR text', () => {
  render(<SourceTie label="Total" value="€125.00" lineNumber={15} quote="Total amount due: EUR 123.47" corrected="€123.47" />)
  for (const text of ['Total', '€125.00', 'OCR line 15', 'Corrected from €123.47']) expect(screen.getByText(text)).toBeVisible()
  expect(screen.getByRole('blockquote')).toHaveTextContent('Total amount due: EUR 123.47')
})

it('names every status and the brand', () => {
  const tones = ['neutral', 'attention', 'positive', 'caution', 'danger'] as const
  render(<><Wordmark />{tones.map(t => <StatusTag key={t} tone={t}>{t}</StatusTag>)}</>)
  expect(screen.getByRole('img', { name: 'DocVault' })).toBeVisible()
  for (const tone of tones) expect(screen.getByText(tone)).toBeVisible()
})

it('offers neutral, outlined, danger and text button variants', () => {
  const variants = ['default', 'secondary', 'outline', 'ghost', 'destructive', 'link'] as const
  render(<>{variants.map(v => <Button key={v} variant={v}>{v}</Button>)}</>)
  for (const v of variants) expect(screen.getByRole('button', {name: v}).className).not.toContain('gradient')
})

describe('button press (N9)', () => {
  it('eases the scale in 120 ms', () => {
    const { getByRole } = render(<Button>Press</Button>)
    const button = getByRole('button', { name: 'Press' })
    expect(button.className).toMatch(/transition-\[[^\]]*scale[^\]]*\]/)
    expect(button.className).not.toMatch(/transition-\[[^\]]*transform/)
    expect(button).toHaveClass('duration-120', 'ease-out', 'active:scale-[0.98]')
  })
})
