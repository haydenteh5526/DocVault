const LIST_FIELDS = ['key_topics', 'specifications', 'safety_warnings', 'quick_facts'] as const

/**
 * The text to show for a summary: the `overview` of a JSON summary, plain text
 * as it is, or null when there is nothing to show.
 */
export function summaryOverview(summary: string | null | undefined): string | null {
  if (!summary) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(summary)
  } catch {
    return summary
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null
  const overview = (parsed as Record<string, unknown>).overview
  return typeof overview === 'string' && overview !== '' ? overview : null
}

/**
 * Tells a summary written by a language model from the placeholder the server
 * stored when no provider key was set: JSON whose four lists are all empty.
 * Anything else, including text that is not JSON, counts as generated.
 */
export function isGeneratedSummary(summary: string | null | undefined): boolean {
  if (!summary) return false
  let parsed: unknown
  try {
    parsed = JSON.parse(summary)
  } catch {
    return true
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return true
  const record = parsed as Record<string, unknown>
  const placeholder = LIST_FIELDS.every(field => Array.isArray(record[field]) && record[field].length === 0)
  return !placeholder
}
