import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useReducedMotion } from './useReducedMotion'

/**
 * The class for a short entrance on the app shell when the person has just come through the vault door
 * (sign-in navigates with `state: { fromVault: true }`). Under reduced motion there is no entrance.
 * The flag is removed from history once read, so a reload or Back does not play it again.
 */
export function useVaultEntrance(): string {
  const location = useLocation()
  const navigate = useNavigate()
  const reducedMotion = useReducedMotion()
  const fromVault = (location.state as { fromVault?: boolean } | null)?.fromVault === true
  // Decided once, on the first render, so clearing the flag below does not cut the entrance short.
  const [entering] = useState(() => fromVault && !reducedMotion)

  useEffect(() => {
    if (fromVault) navigate({ pathname: location.pathname, search: location.search, hash: location.hash }, { replace: true, state: null })
  }, [fromVault, navigate, location.pathname, location.search, location.hash])

  return entering ? 'vault-entrance' : ''
}
