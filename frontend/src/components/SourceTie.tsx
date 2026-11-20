export interface SourceLine {
  line: number
  text: string
}

export type SourceTieProps = {
  label: string
  value: string
  documentTitle?: string | null
  corrected?: string
  /** Shown when `sources` is empty. */
  emptyEvidence?: string
} & ({ lineNumber: number; quote: string } | { sources: SourceLine[] })

/** One quoted source line on the highlighter, with its OCR line number. */
export function SourceQuote({ source, documentTitle }: { source: SourceLine; documentTitle?: string | null }) {
  return <blockquote className="source-citation">
    <span className="source-line font-mono text-sm tabular-nums">{documentTitle ? documentTitle + ' · line ' : 'OCR line '}{source.line}</span>
    <p className="border-l-[3px] border-mark-edge bg-mark px-3 py-2 text-mark-text">{source.text}</p>
  </blockquote>
}

/** A value tied to the line it was read from. Several lines show every competing reading. */
export function SourceTie(props: SourceTieProps) {
  const { label, value, corrected, emptyEvidence } = props
  const lines = 'sources' in props ? props.sources : [{ line: props.lineNumber, text: props.quote }]
  return <div className="source-tie space-y-1">
    <div className="text-sm text-muted-foreground">{label}</div>
    <strong className="source-value text-xl font-semibold tabular-nums">{value}</strong>
    {corrected && <p className="text-sm text-attention">Corrected from {corrected}</p>}
    {lines.length === 0 && emptyEvidence && <p className="text-sm text-muted-foreground">{emptyEvidence}</p>}
    {lines.map(source => <SourceQuote key={`${source.line}:${source.text}`} source={source} documentTitle={props.documentTitle} />)}
  </div>
}
