// Minimal RFC 5545 (.ics) generation for warranty expiry reminders — all client
// side, no backend needed. Produces an all-day event on the expiry date with a
// 7-day-before display alarm.

export interface WarrantyEvent {
  id: string
  title: string
  expiry: string // ISO date string
  notes?: string | null
}

function toICSDate(iso: string): string {
  const d = new Date(iso)
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${y}${m}${day}`
}

function addDay(iso: string): string {
  return toICSDate(new Date(new Date(iso).getTime() + 86_400_000).toISOString())
}

function escapeICS(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n')
}

function stamp(): string {
  return new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z'
}

function buildEvent(e: WarrantyEvent): string {
  return [
    'BEGIN:VEVENT',
    `UID:warranty-${e.id}@docvault`,
    `DTSTAMP:${stamp()}`,
    `DTSTART;VALUE=DATE:${toICSDate(e.expiry)}`,
    `DTEND;VALUE=DATE:${addDay(e.expiry)}`,
    `SUMMARY:${escapeICS('Warranty expires: ' + e.title)}`,
    `DESCRIPTION:${escapeICS(e.notes || 'Warranty expiry reminder from DocVault')}`,
    'BEGIN:VALARM',
    'TRIGGER:-P7D',
    'ACTION:DISPLAY',
    `DESCRIPTION:${escapeICS('Warranty for ' + e.title + ' expires in 7 days')}`,
    'END:VALARM',
    'END:VEVENT',
  ].join('\r\n')
}

export function buildICS(events: WarrantyEvent[]): string {
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//DocVault//Warranty Reminders//EN',
    'CALSCALE:GREGORIAN',
    ...events.map(buildEvent),
    'END:VCALENDAR',
  ].join('\r\n')
}

export function downloadICS(filename: string, events: WarrantyEvent[]): void {
  const blob = new Blob([buildICS(events)], { type: 'text/calendar;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename.endsWith('.ics') ? filename : `${filename}.ics`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
