import { describe, it, expect } from 'vitest'
import { buildICS } from './ics'

describe('buildICS', () => {
  const events = [
    { id: 'abc', title: 'Dishwasher', expiry: '2027-03-15T00:00:00Z', notes: 'Bosch, 2yr' },
  ]

  it('wraps events in a VCALENDAR', () => {
    const ics = buildICS(events)
    expect(ics.startsWith('BEGIN:VCALENDAR')).toBe(true)
    expect(ics.trimEnd().endsWith('END:VCALENDAR')).toBe(true)
    expect(ics).toContain('VERSION:2.0')
  })

  it('emits an all-day VEVENT on the expiry date with a stable UID', () => {
    const ics = buildICS(events)
    expect(ics).toContain('BEGIN:VEVENT')
    expect(ics).toContain('UID:warranty-abc@docvault')
    expect(ics).toContain('DTSTART;VALUE=DATE:20270315')
    expect(ics).toContain('DTEND;VALUE=DATE:20270316')
    expect(ics).toContain('SUMMARY:Warranty expires: Dishwasher')
  })

  it('includes a 7-day-before reminder alarm', () => {
    const ics = buildICS(events)
    expect(ics).toContain('BEGIN:VALARM')
    expect(ics).toContain('TRIGGER:-P7D')
  })

  it('escapes commas and semicolons in text', () => {
    const ics = buildICS(events)
    expect(ics).toContain('Bosch\\, 2yr')
  })

  it('supports multiple events', () => {
    const ics = buildICS([
      events[0],
      { id: 'def', title: 'Drill', expiry: '2028-01-01T00:00:00Z' },
    ])
    expect((ics.match(/BEGIN:VEVENT/g) || []).length).toBe(2)
  })
})
