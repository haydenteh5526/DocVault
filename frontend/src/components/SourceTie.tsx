export interface SourceTieProps {
  label: string
  value: string
  lineNumber: number
  quote: string
  corrected?: string
}

export function SourceTie({ label, value, lineNumber, quote, corrected }: SourceTieProps) {
  return <div className="source-tie space-y-1">
    <div className="text-sm text-muted-foreground">{label}</div>
    <strong className="source-value text-xl font-semibold tabular-nums">{value}</strong>
    {corrected && <p className="text-sm text-attention">Corrected from {corrected}</p>}
    <blockquote className="source-citation">
      <span className="source-line text-sm tabular-nums">OCR line {lineNumber}</span>
      <p className="border-l-[3px] border-mark-edge bg-mark px-3 py-2 text-mark-text">{quote}</p>
    </blockquote>
  </div>
}
