import { SourceTie } from '@/components/SourceTie'

/** A still picture of the product answering a question, with the line the answer came from. Not a working form. */
export function HeroPreview() {
  return (
    <figure
      role="img"
      aria-label="DocVault answering “When is my electricity bill due?” with 23 November 2026, from the October electricity bill, line 17."
      className="hero-preview"
    >
      <div className="hp-bar" aria-hidden="true"><i /><i /><i /></div>
      <div className="hp-panes">
        <div className="hp-ask">
          <p className="hp-question">When is my electricity bill due?</p>
          <div className="hp-answer">
            <strong>23 November 2026</strong>
            <span>October electricity bill · line 17</span>
            <span className="hp-chip">Open bill</span>
          </div>
        </div>
        <div className="hp-bill">
          <div className="hp-line hp-extra"><span>9</span><span>Billing period: 1–31 Oct 2026</span></div>
          <div className="hp-line"><span>15</span><span>Total amount due: EUR 123.47</span></div>
          <div className="hp-line hp-blank hp-extra" aria-hidden="true"><span>16</span><i /></div>
          <SourceTie label="Due date" value="23 November 2026" lineNumber={17} quote="Payment due date: 23 November 2026" />
        </div>
      </div>
    </figure>
  )
}
