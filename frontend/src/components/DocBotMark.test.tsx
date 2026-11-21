// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DocBotMark } from './DocBotMark'

function motion(reduce: boolean) {
  vi.stubGlobal('matchMedia', () => ({
    matches: reduce,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }))
}
const parts = (c: HTMLElement) => [...c.querySelectorAll('[data-part]')].map(e => e.getAttribute('data-part'))

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('DocBotMark', () => {
  it.each(['idle', 'working', 'needs-approval', 'done'] as const)('is decorative in the %s state', state => {
    motion(false)
    const { container } = render(<DocBotMark state={state} />)
    const svg = container.querySelector('svg')!
    expect(svg.getAttribute('aria-hidden')).toBe('true')
    expect(svg.getAttribute('data-state')).toBe(state)
    expect(parts(container)).toEqual(expect.arrayContaining(['folder', 'page', 'face']))
  })

  it('draws a different face for each state', () => {
    motion(false)
    const seen = (state: 'idle' | 'working' | 'needs-approval' | 'done') => {
      const { container, unmount } = render(<DocBotMark state={state} />)
      const found = parts(container).filter(p => !['folder', 'page', 'face', 'limbs'].includes(p!))
      unmount()
      return found.join(',')
    }
    expect(seen('idle')).toBe('eyes-open,smile')
    expect(seen('working')).toBe('eyes-up,mouth-flat')
    expect(seen('needs-approval')).toBe('eyes-tall,mouth-open,badge')
    expect(seen('done')).toBe('eyes-happy,smile-open')
  })

  it('adds arms and legs only to the full figure, and waves only when done', () => {
    motion(false)
    const head = render(<DocBotMark variant="head" state="done" />)
    expect(parts(head.container)).not.toContain('limbs')
    head.unmount()
    const idle = render(<DocBotMark variant="full" />)
    expect(parts(idle.container)).toContain('limbs')
    expect(parts(idle.container)).not.toContain('wave')
    idle.unmount()
    const done = render(<DocBotMark variant="full" state="done" />)
    expect(parts(done.container)).toContain('wave')
  })

  it('sizes the drawing', () => {
    motion(false)
    const { container } = render(<DocBotMark size={22} />)
    expect(container.querySelector('svg')?.getAttribute('width')).toBe('22')
  })

  it('blinks, and bobs while working', () => {
    motion(false)
    const { container } = render(<DocBotMark state="working" />)
    expect(container.querySelector('.docbot-blink')).not.toBeNull()
    expect(container.querySelector('.docbot-bob')).not.toBeNull()
  })

  it('does not blink or bob under reduced motion', () => {
    motion(true)
    const { container } = render(<DocBotMark state="working" />)
    expect(container.querySelector('.docbot-blink')).toBeNull()
    expect(container.querySelector('.docbot-bob')).toBeNull()
  })
})
