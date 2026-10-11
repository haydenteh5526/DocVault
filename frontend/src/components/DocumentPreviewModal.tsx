import { X, FileText, ExternalLink, Loader2 } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import type { Document } from '@/lib/api'

interface Props {
  doc: Document | null
  onClose: () => void
}

export function DocumentPreviewModal({ doc, onClose }: Props) {
  const navigate = useNavigate()
  const overlayRef = useRef<HTMLDivElement>(null)

  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  // Lock scroll
  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  if (!doc) return null

  const isPdf = doc.image_url?.toLowerCase().includes('.pdf')
  const isProcessing = doc.processing_status && doc.processing_status !== 'complete' && doc.processing_status !== 'failed'

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-6"
      onClick={(e) => { if (e.target === overlayRef.current) onClose() }}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in" />

      {/* Modal */}
      <div className="relative w-full sm:max-w-2xl bg-card rounded-t-3xl sm:rounded-2xl shadow-2xl border border-border/40 overflow-hidden animate-slide-up sm:animate-scale-in max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-border/40 shrink-0">
          <div className="w-9 h-9 rounded-xl bg-red-500/10 flex items-center justify-center shrink-0">
            <FileText size={17} className="text-red-600" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold truncate">{doc.title}</h3>
            <div className="flex gap-2 mt-0.5">
              {doc.brand && <span className="text-[11px] text-primary/70 font-medium">{doc.brand}</span>}
              {doc.document_type && <span className="text-[11px] text-muted-foreground">· {doc.document_type}</span>}
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            aria-label="Close preview"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto">
          {isProcessing ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <Loader2 size={28} className="animate-spin text-primary mb-3" />
              <p className="text-sm font-medium">Processing document…</p>
              <p className="text-xs text-muted-foreground mt-1">AI is extracting text. Check back shortly.</p>
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-border/40">
              {/* Preview pane */}
              <div className="p-4">
                {doc.image_url ? (
                  isPdf ? (
                    <div className="h-56 rounded-lg bg-muted/50 flex items-center justify-center text-sm text-muted-foreground">
                      <FileText size={32} className="mr-2 opacity-40" />
                      PDF document
                    </div>
                  ) : (
                    <img
                      src={doc.image_url}
                      alt={doc.title}
                      className="w-full rounded-lg object-contain max-h-56 bg-muted/30"
                      loading="lazy"
                    />
                  )
                ) : (
                  <div className="h-40 rounded-lg bg-muted/50 flex items-center justify-center">
                    <FileText size={32} className="text-muted-foreground/30" />
                  </div>
                )}
              </div>

              {/* Text/metadata pane */}
              <div className="p-4 space-y-4">
                <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                  <dt className="text-muted-foreground text-xs">Brand</dt>
                  <dd className="text-xs font-medium truncate">{doc.brand || '—'}</dd>
                  <dt className="text-muted-foreground text-xs">Type</dt>
                  <dd className="text-xs font-medium truncate">{doc.document_type || '—'}</dd>
                  <dt className="text-muted-foreground text-xs">Size</dt>
                  <dd className="text-xs font-medium">{doc.file_size ? `${(doc.file_size / 1024).toFixed(0)} KB` : '—'}</dd>
                  <dt className="text-muted-foreground text-xs">Uploaded</dt>
                  <dd className="text-xs font-medium">{new Date(doc.created_at).toLocaleDateString('en-IE', { day: 'numeric', month: 'short', year: 'numeric' })}</dd>
                </dl>

                {doc.summary && (
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium mb-1.5">Summary</p>
                    <p className="text-[12px] text-foreground/80 leading-relaxed line-clamp-4">{doc.summary}</p>
                  </div>
                )}

                {!doc.summary && doc.raw_text && (
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium mb-1.5">Extracted text</p>
                    <p className="text-[12px] text-foreground/70 leading-relaxed line-clamp-5 font-mono">{doc.raw_text.slice(0, 300)}{doc.raw_text.length > 300 ? '…' : ''}</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-border/40 flex gap-2 justify-end shrink-0 bg-muted/10">
          <Button variant="ghost" size="sm" onClick={onClose}>Close</Button>
          <Button
            size="sm"
            className="gradient-bg border-0 text-white shadow-sm"
            onClick={() => { onClose(); navigate(`/app/documents/${doc.id}`) }}
          >
            <ExternalLink size={13} className="mr-1.5" /> Open full view
          </Button>
        </div>
      </div>
    </div>
  )
}
