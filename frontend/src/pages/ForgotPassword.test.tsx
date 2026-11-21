// @vitest-environment jsdom
import { it, expect, afterEach } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import ForgotPassword from './ForgotPassword'

afterEach(cleanup)

it('shows the vault door closed with a key badge', () => {
  render(<MemoryRouter><ForgotPassword /></MemoryRouter>)
  const door = document.querySelector('.vault-door') as HTMLElement
  expect(door).toHaveClass('vault-closed')
  expect(door.querySelector('[data-part="badge-key"]')).not.toBeNull()
  expect(screen.getByRole('heading', { name: 'Forgot your password?' })).toBeVisible()
  expect(screen.getByLabelText('Email address')).toBeVisible()
})
