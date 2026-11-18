/**
 * Format a server timestamp as a date in Irish time. The API sends UTC
 * timestamps without an offset, so a value without one is read as UTC.
 * Date-only values (a due date) are calendar dates, not instants: format those
 * with `timeZone: 'UTC'` instead (see formatBillDate).
 */
export function formatTimestamp(value: string): string {
  const utc = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(value) ? value : value + 'Z'
  return new Date(utc).toLocaleDateString('en-IE', {
    day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Dublin',
  })
}
