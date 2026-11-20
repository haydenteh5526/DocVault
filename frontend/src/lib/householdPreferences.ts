import { useQuery } from '@tanstack/react-query'
import { getHouseholdPreferences } from './api'
import { useAuth } from './auth'

/** The only place the preferences query key is built: it is scoped to the signed-in account. */
export const householdPreferencesKey = (accountId: string | null) => ['household-preferences', accountId] as const

export function useHouseholdPreferences(enabled = true) {
  const { accountId } = useAuth()
  return useQuery({
    queryKey: householdPreferencesKey(accountId),
    queryFn: getHouseholdPreferences,
    enabled: enabled && accountId !== null,
  })
}
