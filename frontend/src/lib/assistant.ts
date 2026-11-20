/** The assistant's name. Used only in text people read, never in code identifiers or storage keys. */
export const ASSISTANT_NAME = 'Pip'

/** Who proposed a reminder, as the history of the bill panel says it. Anything unknown counts as the owner. */
export function proposedByText(source: string): string {
  if (source === 'assistant') return `Proposed by ${ASSISTANT_NAME}`
  if (source === 'routine') return `Proposed by ${ASSISTANT_NAME}'s daily check`
  return 'Proposed by you'
}
