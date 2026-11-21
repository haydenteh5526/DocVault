import { Link } from 'react-router-dom'
import type { useDocBotActivity } from '@/lib/useDocBotActivity'
import { formatBillDate } from '@/components/BillReview'

export function DocBotActivity({ activity }: { activity: ReturnType<typeof useDocBotActivity> }) {
  const { pending, upcoming, warranties, people, householdBill } = activity
  return (
    <div className="docbot-activity">
      {pending.length > 0 && (
        <section>
          <h2>Requires approval</h2>
          {pending.map(({ doc, proposal }) => {
            const details = proposal.details
            const url = '/app/documents/' + doc.id
            return (
              <article key={proposal.id}>
                <strong>{doc.title}</strong>
                <p>Remind on {formatBillDate(details.remind_on)}</p>
                <p>
                  €{details.amount_due} · Due {formatBillDate(details.due_date)}
                </p>
                <p>
                  Revision {details.bill_revision} ·{' '}
                  {details.split ? 'Split ' + details.split.split_number : 'No split'}
                </p>
                {details.split?.shares.map((share) => (
                  <p key={share.housemate_id}>
                    {share.label} · €{share.amount}
                  </p>
                ))}
                <Link to={url}>Open bill to see its status</Link>
                <Link to={url + '#bill-reminder-heading'}>Review in bill</Link>
              </article>
            )
          })}
        </section>
      )}
      {(upcoming.length > 0 || warranties.length > 0) && (
        <section>
          <h2>Coming up</h2>
          {upcoming.map((doc) => (
            <p key={doc.id}>
              <Link to={'/app/documents/' + doc.id}>{doc.title}</Link>
              <br />
              {formatBillDate(doc.confirmed_bill!.due_date)}
            </p>
          ))}
          {warranties.map((w) => (
            <p key={w.warranty_id}>
              <Link to="/app/warranties">{w.document_title}</Link>
              <br />
              {formatBillDate(w.expiry_date)}
            </p>
          ))}
        </section>
      )}
      {people.length > 0 && (
        <section>
          <h2>Household</h2>
          <p>{people.map((p) => p.label).join(', ')}</p>
          {householdBill && (
            <Link to={'/app/documents/' + householdBill.id + '#bill-split-heading'}>
              Manage housemates in bill split
            </Link>
          )}
        </section>
      )}
    </div>
  )
}
