import { useQuery } from '@tanstack/react-query'
import { getDocuments, getExpiringWarranties } from './api'
import { useAuth } from './auth'
import { useBillRecords } from './useBillRecords'
import { useHousemates } from './housemates'
import { daysUntil } from './format'

export function useDocBotActivity(fetchActivity = true) {
  const { accountId } = useAuth()
  const enabled = Boolean(accountId) && fetchActivity
  const documents = useQuery({
    queryKey: ['documents'],
    queryFn: async () => (await getDocuments()).documents,
    enabled,
  })
  const details = useBillRecords(documents.data ?? [], enabled)
  const warranties = useQuery({
    queryKey: ['docbot-warranties', accountId],
    queryFn: () => getExpiringWarranties(30),
    enabled,
  })
  const people = useHousemates(enabled)
  const bills = Object.values(details.data ?? {}).filter((d) => d.confirmed_bill)
  const pending = bills.flatMap((doc) =>
    (doc.reminder_proposals ?? [])
      .filter((p) => p.status === 'pending' && !p.inputs_changed)
      .map((proposal) => ({ doc, proposal })),
  )
  const upcoming = bills.filter((doc) => {
    const days = daysUntil(doc.confirmed_bill!.due_date)
    return days !== null && days >= 0 && days <= 30
  })
  const status = pending.length
    ? pending.length + (pending.length === 1 ? ' needs approval' : ' need approval')
    : documents.isError || details.isError
      ? 'Bill status unavailable'
      : !fetchActivity && (!documents.data || (documents.data.some(d => d.processing_status === 'complete') && !details.data))
        ? 'Ready'
      : documents.isPending || details.isFetching
        ? 'Checking bills'
        : 'All caught up'
  return {
    pending,
    upcoming,
    warranties: (warranties.data ?? []).filter((w) => w.days_remaining >= 0 && w.days_remaining <= 30),
    people: people.data ?? [],
    householdBill: bills.length ? bills[0] : undefined,
    status,
  }
}
