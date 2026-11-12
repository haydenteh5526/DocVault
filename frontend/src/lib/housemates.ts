import { useQuery } from '@tanstack/react-query'
import { getHousemates } from './api'
import { useAuth } from './auth'

/** The only place a housemates query key is built: it is scoped to the signed-in account. */
export const housematesKey = (accountId: string | null) => ['housemates', accountId] as const

export function useHousemates(enabled: boolean) {
  const { accountId } = useAuth()
  return useQuery({
    queryKey: housematesKey(accountId),
    queryFn: getHousemates,
    enabled: enabled && accountId !== null,
  })
}
