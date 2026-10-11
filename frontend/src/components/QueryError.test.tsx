// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryError } from './QueryError'

afterEach(cleanup)

describe('QueryError', () => {
  it('shows the default message', () => {
    render(<QueryError />)
    expect(screen.getByText(/couldn't load this data/i)).toBeInTheDocument()
  })

  it('shows a custom message', () => {
    render(<QueryError message="Couldn't load your warranties." />)
    expect(screen.getByText(/couldn't load your warranties/i)).toBeInTheDocument()
  })

  it('renders a retry button only when onRetry is provided', () => {
    const { rerender } = render(<QueryError />)
    expect(screen.queryByRole('button', { name: /retry/i })).not.toBeInTheDocument()
    rerender(<QueryError onRetry={() => {}} />)
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument()
  })

  it('calls onRetry when the retry button is clicked', async () => {
    const onRetry = vi.fn()
    render(<QueryError onRetry={onRetry} />)
    await userEvent.click(screen.getByRole('button', { name: /retry/i }))
    expect(onRetry).toHaveBeenCalledOnce()
  })
})
