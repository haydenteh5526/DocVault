import { useReducedMotion } from '@/lib/useReducedMotion'

export const QUESTIONS = [
  'What does E21 mean on the dishwasher?',
  'How much notice do I give the landlord?',
  'Is the kettle still under warranty?',
  'When does the tenancy end?',
  'When is the electricity bill due?',
  'How much was the October bill?',
  'Split the gas bill by days at home',
  'Remind me two days before the bill is due',
]

function Row({ items, reverse, moving }: { items: string[]; reverse: boolean; moving: boolean }) {
  const copies = moving ? [0, 1] : [0]
  return (
    <div className="question-row" aria-hidden="true">
      <div className={moving ? `marquee-track${reverse ? ' marquee-reverse' : ''}` : 'marquee-still'}>
        {copies.flatMap(copy => items.map(question => <span key={`${copy}-${question}`}>{question}</span>))}
      </div>
    </div>
  )
}

/**
 * Two rows of example questions, moving in opposite directions. The moving copies are hidden from assistive
 * technology; the questions appear once in a visually hidden list. Pauses on hover and focus.
 */
export function QuestionMarquee() {
  const reduced = useReducedMotion()
  return (
    <div className="question-marquee" role="group" aria-label="Questions DocBot can answer" tabIndex={0}>
      <div className="sr-only">
        <ul>
          {QUESTIONS.map(question => (
            <li key={question}>{question}</li>
          ))}
        </ul>
      </div>
      <Row items={QUESTIONS} reverse={false} moving={!reduced} />
      <Row items={[...QUESTIONS].reverse()} reverse moving={!reduced} />
    </div>
  )
}
