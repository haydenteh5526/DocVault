import { FileText, Zap } from 'lucide-react'
import { SourceTie } from './SourceTie'

export function ExampleBill() {
  return <div className="bill-stack">
    {['Tenancy agreement 2026–27','Washer-dryer warranty card','Linkline Broadband, November 2026'].map((name, i) =>
      <div className={'back-sheet sheet-' + i} key={name}><FileText size={15}/>{name}</div>
    )}
    <article className="paper-bill" aria-label="Synthetic Example Energy electricity bill">
      <div className="bill-letterhead"><span><Zap size={23} fill="currentColor"/> Example Energy</span><span>Electricity bill</span></div>
      <div className="bill-period"><span>Billing period</span><strong>1–31 October 2026</strong></div>
      <SourceTie label="Amount due" value="€123.47" lineNumber={15} quote="Total amount due: EUR 123.47" />
      <SourceTie label="Due date" value="23 Nov" lineNumber={17} quote="Payment due date: 23 November 2026" />
    </article>
  </div>
}
