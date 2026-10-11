import { useCallback, useEffect, useState, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, FileText, Info, Eye, MessageSquare, Send, Bot, Check, Share2, X, Plus, Tag as TagIcon, Loader2, FolderOpen, Download, Star, Trash2, User, Sparkles, AlertTriangle, BookOpen, Zap, Hash, ChevronLeft, ChevronRight } from 'lucide-react'
import Markdown from 'react-markdown'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { getDocument, askQuestion, shareDocument, findSimilarDocuments, getTags, createTag, addTagToDocument, removeTagFromDocument, deleteDocument, toggleFavourite, listConversations, createConversation, getConversation, sendMessage as sendConversationMessage, type Document, type Tag, type SimilarDocument } from '@/lib/api'
import { useToast } from '@/components/Toast'

/**
 * Wraps occurrences of meaningful query words (≥4 chars) in <mark> so a document
 * opened from Search shows where the query matched. Case-insensitive.
 */
function highlightMatches(text: string, term: string | null) {
  const tokens = (term || '').split(/\s+/).map(t => t.trim()).filter(t => t.length >= 4)
  if (tokens.length === 0) return text
  const escaped = tokens.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  const re = new RegExp(`(${escaped.join('|')})`, 'gi')
  const lower = tokens.map(t => t.toLowerCase())
  return text.split(re).map((part, i) =>
    lower.includes(part.toLowerCase())
      ? <mark key={i} className="bg-amber-200 dark:bg-amber-500/40 text-foreground rounded px-0.5">{part}</mark>
      : part,
  )
}

export default function DocumentDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const docQuery = useQuery({
    queryKey: ['document', id],
    enabled: !!id,
    queryFn: async () => {
      const data = await getDocument(id!)
      if (!data || !data.id) throw new Error('Document not found')
      return data
    },
    // Poll while the document is still being processed, then stop.
    refetchInterval: (query) => {
      const s = query.state.data?.processing_status
      return s && s !== 'complete' && s !== 'failed' ? 3000 : false
    },
  })
  const doc = docQuery.data ?? null
  const notFound = docQuery.isError
  // Cache-backed setter so existing optimistic `setDoc({...doc, ...})` calls
  // keep working unchanged.
  const setDoc = (updated: Document) => queryClient.setQueryData(['document', id], updated)
  const [searchParams] = useState(() => new URLSearchParams(window.location.search))
  const highlightTerm = searchParams.get('q')
  const initialTab = (['preview', 'info', 'ask'].includes(searchParams.get('tab') || '') ? searchParams.get('tab') : 'info') as 'preview' | 'info' | 'ask'
  const [tab, setTabState] = useState<'preview' | 'info' | 'ask'>(initialTab)
  const [pendingQuestion, setPendingQuestion] = useState<string | undefined>()
  const stableImageUrl = useRef<string | null>(null)
  const { toast } = useToast()

  function setTab(newTab: 'preview' | 'info' | 'ask') {
    setTabState(newTab)
    const params = new URLSearchParams(window.location.search)
    params.set('tab', newTab)
    window.history.replaceState({}, '', `${window.location.pathname}?${params.toString()}`)
  }

  // Keep the first image_url we get stable so preview doesn't re-load on polls
  if (doc?.image_url && !stableImageUrl.current) {
    stableImageUrl.current = doc.image_url
  }

  if (notFound) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-8">
        <FileText size={48} className="text-muted-foreground/20 mb-4" />
        <h3 className="text-lg font-semibold text-foreground/80">Document not found</h3>
        <p className="text-sm text-muted-foreground mt-1">This document may have been deleted or you don't have access.</p>
        <button onClick={() => navigate(-1)} className="mt-6 px-5 py-2.5 rounded-lg gradient-bg text-white text-sm font-medium shadow-md transition-all hover:-translate-y-0.5">
          Go back
        </button>
      </div>
    )
  }

  if (!doc) {
    return (
      <div className="p-8 max-w-5xl mx-auto animate-fade-in">
        <div className="h-8 w-64 bg-muted rounded animate-pulse mb-6" />
        <div className="h-10 w-80 bg-muted rounded animate-pulse mb-6" />
        <div className="h-[70vh] bg-muted rounded-xl animate-pulse" />
      </div>
    )
  }

  const isProcessing = doc.processing_status && doc.processing_status !== 'complete' && doc.processing_status !== 'failed'
  const isPdf = doc.image_url?.includes('.pdf')

  async function handleDelete() {
    if (!doc || !window.confirm('Are you sure you want to delete this document?')) return
    try {
      await deleteDocument(doc.id)
      toast('Document deleted', 'success')
      navigate('/app')
    } catch {
      toast('Failed to delete document', 'error')
    }
  }

  async function handleToggleFavourite() {
    if (!doc) return
    const nextState = !doc.is_favourite
    setDoc({ ...doc, is_favourite: nextState })
    try {
      await toggleFavourite(doc.id)
      toast(nextState ? 'Added to favourites' : 'Removed from favourites', 'success')
    } catch {
      setDoc({ ...doc, is_favourite: !nextState }) // revert on error
    }
  }

  return (
    <div className="flex flex-col h-full overflow-hidden bg-muted/10">
      {/* Hero Section */}
      <div className="relative border-b border-border/40 bg-background/80 backdrop-blur-xl overflow-hidden shrink-0 z-10">
        <div className="absolute inset-0 bg-gradient-to-r from-primary/[0.05] via-purple-500/[0.05] to-transparent pointer-events-none" />
        
        <div className="relative px-4 sm:px-8 pt-6 pb-4">
          <div className="flex items-start gap-5">
            <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="shrink-0 rounded-full hover:bg-background/80 hover:shadow-sm" aria-label="Go back">
              <ArrowLeft size={18} className="text-muted-foreground" />
            </Button>
            
            <div className="flex-1 min-w-0 pt-0.5">
              {/* Breadcrumbs */}
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                <button onClick={() => navigate('/app/documents')} className="hover:text-foreground transition-colors">All Documents</button>
                <span>/</span>
                {doc.document_type && <><button onClick={() => navigate(`/app/documents?type=${encodeURIComponent(doc.document_type!)}`)} className="hover:text-foreground transition-colors">{doc.document_type}</button><span>/</span></>}
                <span className="text-foreground/70 truncate">{doc.title}</span>
              </div>
              <div className="flex items-center gap-3">
                <h2 className="text-2xl font-semibold tracking-tight truncate text-foreground/90">{doc.title}</h2>
                {doc.is_favourite && <Star className="h-5 w-5 text-amber-500 fill-amber-500 shrink-0 drop-shadow-sm" />}
              </div>
              
              <div className="flex flex-wrap items-center gap-2 mt-2">
                {doc.brand && <Badge variant="secondary">{doc.brand}</Badge>}
                {doc.document_type && <Badge variant="outline">{doc.document_type}</Badge>}
                {doc.category_id && <Badge variant="outline" className="bg-primary/[0.03] text-primary border-primary/20">Categorised</Badge>}
                <span className="text-xs text-muted-foreground font-medium pl-1">
                  {formatFileSize(doc.file_size)} • Uploaded {new Date(doc.created_at).toLocaleDateString()}
                </span>
              </div>
            </div>

            {/* Top right actions */}
            <div className="flex items-center gap-2 shrink-0">
              <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full hover:bg-amber-500/10" onClick={handleToggleFavourite} aria-label={doc.is_favourite ? 'Remove from favourites' : 'Add to favourites'}>
                <Star size={16} className={doc.is_favourite ? 'fill-amber-500 text-amber-500' : 'text-muted-foreground'} />
              </Button>
              {stableImageUrl.current && (
                <Button variant="outline" size="sm" className="h-9 rounded-full bg-background/50 hover:bg-background shadow-sm hover:shadow transition-all" asChild>
                  <a href={stableImageUrl.current} download={doc.title} target="_blank" rel="noopener noreferrer">
                    <Download size={14} className="mr-1.5" /> Download
                  </a>
                </Button>
              )}
              <ShareButton documentId={doc.id} />
              <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full hover:bg-destructive/10" onClick={handleDelete}>
                <Trash2 size={16} className="text-muted-foreground hover:text-destructive" />
              </Button>
            </div>
          </div>

          {/* Processing banner inline */}
          {isProcessing && (
            <div className="mt-5 rounded-xl border border-primary/20 bg-primary/[0.04] p-4 flex items-center gap-4 animate-fade-in shadow-inner">
              <div className="w-8 h-8 rounded-lg gradient-bg flex items-center justify-center shrink-0">
                <Loader2 size={16} className="text-white animate-spin" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-primary">Processing document...</p>
                <div className="mt-1.5 h-1.5 bg-primary/10 rounded-full overflow-hidden">
                  <div className="h-full gradient-bg rounded-full animate-[progress_2s_ease-in-out_infinite]" style={{ width: '60%' }} />
                </div>
              </div>
            </div>
          )}

          {/* Folder suggestion inline */}
          {!isProcessing && doc.document_type && !doc.category_id && (
            <div className="mt-5 flex items-center gap-3 rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 animate-fade-in">
              <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center shrink-0">
                <FolderOpen size={16} className="text-amber-600" />
              </div>
              <p className="text-sm flex-1 text-amber-900/80 dark:text-amber-200/80">AI suggests moving this to <span className="font-semibold text-amber-900 dark:text-amber-200">{doc.document_type}</span></p>
              <Button size="sm" className="shrink-0 h-8 text-xs bg-amber-500 hover:bg-amber-600 text-white border-0 shadow-sm" onClick={async () => {
                const { createCategory, moveToCategory, getCategories } = await import('@/lib/api')
                const cats = await getCategories()
                let cat = cats.find((c: { name: string }) => c.name === doc.document_type)
                if (!cat) cat = await createCategory(doc.document_type!)
                await moveToCategory(doc.id, cat.id)
                setDoc({ ...doc, category_id: cat.id })
              }}>Move</Button>
              <Button size="sm" variant="ghost" className="shrink-0 h-8 text-xs text-amber-700/60 hover:text-amber-700 hover:bg-amber-500/10" onClick={() => setDoc({ ...doc, document_type: null })}>Dismiss</Button>
            </div>
          )}

          {/* Tabs */}
          <div className="flex gap-1 mt-6 -mb-4">
            <TabButton active={tab === 'info'} onClick={() => setTab('info')} icon={<FileText size={14} />} label="Summary" />
            <TabButton active={tab === 'preview'} onClick={() => setTab('preview')} icon={<Eye size={14} />} label="Preview" />
            <TabButton active={tab === 'ask'} onClick={() => setTab('ask')} icon={<MessageSquare size={14} />} label="Ask AI" />
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      {tab === 'ask' ? (
        <div className="flex-1 flex flex-col overflow-hidden">
          <DocumentChat documentId={doc.id} documentTitle={doc.title} initialQuestion={pendingQuestion} />
        </div>
      ) : (
      <div className="flex-1 overflow-auto p-4 sm:p-8 relative">
        <div className="max-w-5xl mx-auto space-y-6 pb-20">

      {tab === 'preview' && (
        <div className="animate-fade-in">
        <Card className="border-border/50 shadow-sm animate-slide-up overflow-hidden">
          <CardContent className="p-0 bg-background/50">
            {stableImageUrl.current ? (
              isPdf ? (
                <PdfViewer url={stableImageUrl.current} title={doc.title} />
              ) : (
                <div className="flex items-center justify-center p-8 bg-black/5">
                  <img src={stableImageUrl.current} alt={doc.title} className="max-w-full max-h-[75vh] rounded-lg shadow-xl" />
                </div>
              )
            ) : (
              <div className="h-[60vh] flex flex-col items-center justify-center text-muted-foreground bg-muted/10">
                <FileText size={48} className="mb-4 opacity-20" />
                <p className="text-sm font-medium">No preview available</p>
              </div>
            )}
          </CardContent>
        </Card>
        </div>
      )}

      

      {tab === 'info' && (
        <div className="animate-fade-in">
        <div className="animate-slide-up space-y-6">
          {isProcessing ? (
            <Card className="border-border/50 shadow-sm">
              <CardContent className="p-8">
                <div className="flex flex-col items-center justify-center py-16 text-center animate-fade-in">
                  <Loader2 size={28} className="animate-spin text-primary mb-4" />
                  <p className="text-sm font-medium">Analysing document...</p>
                  <p className="text-xs text-muted-foreground mt-1">Extracting text, detecting brand, model, and document type.</p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <>
              {/* AI Summary */}
              {doc.summary && (
                <RichSummary summary={doc.summary} onTopicClick={(topic) => { setPendingQuestion(`Tell me about ${topic} in this document`); setTab('ask') }} />
              )}

              {/* Key Information */}
              <Card className="border-border/50 shadow-sm">
                <CardContent className="p-6">
                  <h3 className="text-sm font-semibold mb-4 text-foreground/80 flex items-center gap-2">
                    <Info size={15} className="text-primary" /> Key Information
                  </h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="rounded-lg bg-muted/30 p-3">
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground/60 mb-1">Brand</p>
                      <p className="text-sm font-semibold">{doc.brand || '—'}</p>
                    </div>
                    <div className="rounded-lg bg-muted/30 p-3">
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground/60 mb-1">Model</p>
                      <p className="text-sm font-semibold">{doc.model || '—'}</p>
                    </div>
                    <div className="rounded-lg bg-muted/30 p-3">
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground/60 mb-1">Type</p>
                      <p className="text-sm font-semibold">{doc.document_type || '—'}</p>
                    </div>
                    <div className="rounded-lg bg-muted/30 p-3">
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground/60 mb-1">File size</p>
                      <p className="text-sm font-semibold">{formatFileSize(doc.file_size)}</p>
                    </div>
                  </div>
                  <div className="mt-4">
                    <TagEditor doc={doc} onChange={setDoc} />
                  </div>
                </CardContent>
              </Card>

              {/* Extracted Text (expandable) */}
              {doc.raw_text && (
                <Card className="border-border/50 shadow-sm">
                  <CardContent className="p-6">
                    <details open={!!highlightTerm}>
                      <summary className="text-sm font-semibold text-foreground/80 cursor-pointer flex items-center gap-2 select-none">
                        <FileText size={15} className="text-primary" /> Extracted Text
                        <span className="text-xs text-muted-foreground font-normal ml-2">({doc.raw_text.split(/\s+/).length.toLocaleString()} words)</span>
                      </summary>
                      <div className="mt-4 max-h-[50vh] overflow-auto rounded-lg bg-muted/20 p-4">
                        <pre className="text-sm leading-7 font-[system-ui] whitespace-pre-wrap">{highlightMatches(doc.raw_text, highlightTerm)}</pre>
                      </div>
                    </details>
                  </CardContent>
                </Card>
              )}

              {/* Related Documents */}
              {doc.raw_text && (
                <RelatedDocuments documentId={doc.id} />
              )}
            </>
          )}
        </div>
        </div>
      )}

        </div>
      </div>
      )}

    </div>
  )
}

function formatFileSize(bytes: number | null): string {
  if (!bytes) return '—'
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / 1024).toFixed(1)} KB`
}

function TabButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button onClick={onClick} className="relative px-5 py-2.5 text-sm font-semibold transition-colors duration-200 group flex items-center gap-2">
      <span className={`relative z-10 flex items-center gap-2 ${active ? 'text-foreground' : 'text-muted-foreground group-hover:text-foreground/80'}`}>
        <span className={active ? 'text-primary' : ''}>{icon}</span>
        {label}
      </span>
      {active && (
        <div className="absolute inset-0 bg-background rounded-t-lg border-t border-l border-r border-border/50 z-0" />
      )}
      {!active && (
        <div className="absolute inset-0 bg-accent/0 group-hover:bg-accent/50 rounded-t-lg z-0 transition-colors" />
      )}
    </button>
  )
}

function Badge({ children, variant = 'secondary', className = '' }: { children: React.ReactNode, variant?: 'secondary' | 'outline', className?: string }) {
  const base = "inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold transition-colors"
  const variants = {
    secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80 border border-transparent",
    outline: "border border-border/60 text-foreground"
  }
  return <span className={`${base} ${variants[variant]} ${className}`}>{children}</span>
}

function TagEditor({ doc, onChange }: { doc: Document; onChange: (d: Document) => void }) {
  const [allTags, setAllTags] = useState<Tag[]>([])
  const [input, setInput] = useState('')
  const [adding, setAdding] = useState(false)
  const docTags = doc.tags || []

  useEffect(() => { getTags().then(setAllTags) }, [])

  async function attach(tag: Tag) {
    await addTagToDocument(doc.id, tag.id)
    onChange({ ...doc, tags: [...docTags, tag] })
  }

  async function detach(tag: Tag) {
    await removeTagFromDocument(doc.id, tag.id)
    onChange({ ...doc, tags: docTags.filter(t => t.id !== tag.id) })
  }

  async function createAndAttach() {
    const name = input.trim()
    if (!name) return
    const tag = await createTag(name)
    setAllTags(prev => (prev.some(t => t.id === tag.id) ? prev : [...prev, tag]))
    if (!docTags.some(t => t.id === tag.id)) {
      await addTagToDocument(doc.id, tag.id)
      onChange({ ...doc, tags: [...docTags, tag] })
    }
    setInput('')
    setAdding(false)
  }

  const available = allTags.filter(t => !docTags.some(dt => dt.id === t.id))

  return (
    <div className="mt-6 pt-5 border-t">
      <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground mb-2.5">
        <TagIcon size={13} /> Tags
      </div>
      <div className="flex flex-wrap gap-1.5 items-center">
        {docTags.map(tag => (
          <span key={tag.id} className="inline-flex items-center gap-1 rounded-full bg-primary/[0.08] px-2.5 py-1 text-xs font-medium text-primary">
            {tag.name}
            <button onClick={() => detach(tag)} className="hover:text-destructive" aria-label={`Remove ${tag.name}`}><X size={12} /></button>
          </span>
        ))}
        {adding ? (
          <Input
            autoFocus
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') createAndAttach(); if (e.key === 'Escape') { setAdding(false); setInput('') } }}
            onBlur={() => { if (!input.trim()) setAdding(false) }}
            placeholder="Tag name…"
            className="h-7 w-32 text-xs"
          />
        ) : (
          <button onClick={() => setAdding(true)} className="inline-flex items-center gap-1 rounded-full border border-dashed border-border px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground hover:border-foreground/40 transition-colors">
            <Plus size={12} /> Add tag
          </button>
        )}
      </div>
      {adding && available.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {available.map(tag => (
            <button key={tag.id} onClick={() => attach(tag)} className="rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground hover:bg-primary/[0.08] hover:text-primary transition-colors">
              {tag.name}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function ShareButton({ documentId }: { documentId: string }) {
  const [copied, setCopied] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleShare() {
    setLoading(true)
    try {
      const { share_url } = await shareDocument(documentId, 24)
      await navigator.clipboard.writeText(share_url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Button variant="outline" size="sm" onClick={handleShare} disabled={loading} className="h-9 rounded-full bg-background/50 hover:bg-background shadow-sm hover:shadow transition-all w-24">
      {copied ? <><Check size={14} className="mr-1.5 text-green-600" /> Copied</> : <><Share2 size={14} className="mr-1.5" /> Share</>}
    </Button>
  )
}

function RelatedDocuments({ documentId }: { documentId: string }) {
  const [similar, setSimilar] = useState<SimilarDocument[]>([])
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  useEffect(() => {
    findSimilarDocuments(documentId).then(data => {
      setSimilar(data.similar || [])
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [documentId])

  if (loading) return (
    <Card className="mt-4 animate-fade-in">
      <CardContent className="p-5">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 size={14} className="animate-spin" /> Finding related documents...
        </div>
      </CardContent>
    </Card>
  )

  if (similar.length === 0) return null

  return (
    <Card className="mt-4 animate-fade-in">
      <CardContent className="p-5">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">Related Documents</p>
        <div className="space-y-2">
          {similar.map(doc => (
            <button
              key={doc.id}
              onClick={() => navigate(`/app/documents/${doc.id}`)}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-accent/50 transition-colors text-left"
            >
              <FileText size={15} className="text-primary/60 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{doc.title}</p>
                <p className="text-[11px] text-muted-foreground">
                  {doc.brand && `${doc.brand} · `}{doc.document_type || 'Document'} · {Math.round(doc.similarity * 100)}% similar
                </p>
              </div>
            </button>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}


function PdfViewer({ url, title }: { url: string; title: string }) {
  const [page, setPage] = useState(1)
  const iframeRef = useRef<HTMLIFrameElement>(null)

  function goToPage(p: number) {
    if (p < 1) return
    setPage(p)
  }

  const pdfUrl = `${url}#page=${page}&toolbar=1&navpanes=0`

  return (
    <div className="flex flex-col">
      {/* Navigation bar */}
      <div className="flex items-center justify-center gap-3 py-3 px-4 bg-muted/30 border-b border-border/30">
        <button
          onClick={() => goToPage(page - 1)}
          disabled={page <= 1}
          className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent/50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronLeft size={16} />
        </button>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Page</span>
          <input
            type="number"
            min={1}
            value={page}
            onChange={(e) => { const v = parseInt(e.target.value); if (v > 0) setPage(v) }}
            className="w-12 h-7 text-center text-xs rounded-md border border-border/50 bg-background focus:outline-none focus:ring-1 focus:ring-primary/50"
          />
        </div>
        <button
          onClick={() => goToPage(page + 1)}
          className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
        >
          <ChevronRight size={16} />
        </button>
      </div>
      {/* PDF iframe */}
      <iframe
        ref={iframeRef}
        src={pdfUrl}
        className="w-full h-[70vh] border-0"
        title={title}
      />
    </div>
  )
}

function RichSummary({ summary, onTopicClick }: { summary: string; onTopicClick?: (topic: string) => void }) {
  // Try to parse as structured JSON; fall back to plain text display
  let parsed: {
    overview?: string
    key_topics?: string[]
    specifications?: { label: string; value: string }[]
    safety_warnings?: string[]
    quick_facts?: { label: string; value: string }[]
  } | null = null

  try {
    parsed = JSON.parse(summary)
  } catch {
    // Not JSON — show as plain text (backward compat with old summaries)
  }

  if (!parsed) {
    return (
      <Card className="border-border/50 shadow-sm">
        <CardContent className="p-6">
          <h3 className="text-sm font-semibold mb-3 text-foreground/80 flex items-center gap-2">
            <Sparkles size={15} className="text-primary" /> AI Summary
          </h3>
          <p className="text-sm text-foreground/80 leading-relaxed">{summary}</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4 animate-slide-up">
      {/* Overview */}
      {parsed.overview && (
        <Card className="border-border/50 shadow-sm">
          <CardContent className="p-6">
            <h3 className="text-sm font-semibold mb-3 text-foreground/80 flex items-center gap-2">
              <Sparkles size={15} className="text-primary" /> AI Summary
            </h3>
            <p className="text-sm text-foreground/80 leading-relaxed">{parsed.overview}</p>
          </CardContent>
        </Card>
      )}

      {/* Key Topics + Quick Facts side by side */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Key Topics */}
        {parsed.key_topics && parsed.key_topics.length > 0 && (
          <Card className="border-border/50 shadow-sm">
            <CardContent className="p-5">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
                <BookOpen size={13} className="text-primary/70" /> Key Topics
              </h4>
              <div className="flex flex-wrap gap-2">
                {parsed.key_topics.map((topic, i) => (
                  <button
                    key={i}
                    onClick={() => onTopicClick?.(topic)}
                    className="inline-flex items-center gap-1.5 rounded-full bg-primary/[0.06] border border-primary/10 px-3 py-1.5 text-xs font-medium text-primary/90 hover:bg-primary/[0.12] hover:border-primary/25 transition-colors cursor-pointer"
                  >
                    <Hash size={10} className="opacity-50" />
                    {topic}
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Quick Facts */}
        {parsed.quick_facts && parsed.quick_facts.length > 0 && (
          <Card className="border-border/50 shadow-sm">
            <CardContent className="p-5">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
                <Zap size={13} className="text-amber-500" /> Quick Facts
              </h4>
              <div className="space-y-2">
                {parsed.quick_facts.map((fact, i) => (
                  <div key={i} className="flex items-center justify-between py-1.5 border-b border-border/30 last:border-0">
                    <span className="text-xs text-muted-foreground">{fact.label}</span>
                    <span className="text-xs font-semibold text-foreground/90">{fact.value}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Specifications */}
      {parsed.specifications && parsed.specifications.length > 0 && (
        <Card className="border-border/50 shadow-sm">
          <CardContent className="p-5">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
              <Info size={13} className="text-blue-500" /> Specifications
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {parsed.specifications.map((spec, i) => (
                <div key={i} className="rounded-lg bg-blue-500/[0.04] border border-blue-500/10 px-3 py-2.5">
                  <p className="text-[10px] uppercase tracking-wider text-blue-600/60 dark:text-blue-400/60 mb-0.5">{spec.label}</p>
                  <p className="text-sm font-semibold text-foreground/90">{spec.value}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Safety Warnings */}
      {parsed.safety_warnings && parsed.safety_warnings.length > 0 && (
        <Card className="border-amber-500/20 bg-amber-500/[0.02] shadow-sm">
          <CardContent className="p-5">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-400 mb-3 flex items-center gap-2">
              <AlertTriangle size={13} className="text-amber-500" /> Safety Warnings
            </h4>
            <div className="space-y-2">
              {parsed.safety_warnings.map((warning, i) => (
                <div key={i} className="flex items-start gap-2.5 rounded-lg bg-amber-500/[0.06] border border-amber-500/10 px-3 py-2.5">
                  <AlertTriangle size={12} className="text-amber-500 shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-900/80 dark:text-amber-200/80 leading-relaxed">{warning}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}


function DocumentChat({ documentId, documentTitle, initialQuestion }: { documentId: string; documentTitle: string; initialQuestion?: string }) {
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState<{ role: 'user' | 'assistant'; content: string }[]>([])
  const [loading, setLoading] = useState(false)
  const [, setConversationId] = useState<string | null>(null)
  const convIdRef = useRef<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const hasAutoSubmitted = useRef(false)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  const doSubmit = useCallback(async (question: string) => {
    if (!question.trim()) return
    setInput('')
    setMessages(prev => [...prev, { role: 'user', content: question }])
    setLoading(true)
    try {
      let convId = convIdRef.current
      if (!convId) {
        const conv = await createConversation(`[${documentTitle}] Chat`)
        convId = conv.id
        setConversationId(convId)
        convIdRef.current = convId
      }
      const data = await sendConversationMessage(convId, question, documentId)
      setMessages(prev => [...prev, { role: 'assistant', content: data.assistant_message.content }])
    } catch {
      try {
        const data = await askQuestion(question, documentId)
        setMessages(prev => [...prev, { role: 'assistant', content: data.answer }])
      } catch {
        setMessages(prev => [...prev, { role: 'assistant', content: 'Sorry, something went wrong.' }])
      }
    } finally {
      setLoading(false)
    }
  }, [documentId, documentTitle])

  // Load existing document-scoped conversation on mount
  useEffect(() => {
    listConversations().then(convs => {
      // Find most recent conversation for this document (title starts with doc title)
      const docConv = convs.find(c => c.title.startsWith(`[${documentTitle}]`))
      if (docConv) {
        setConversationId(docConv.id)
        convIdRef.current = docConv.id
        getConversation(docConv.id).then(data => {
          setMessages(data.messages.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })))
          // Auto-submit after loading existing messages
          if (initialQuestion && !hasAutoSubmitted.current) {
            hasAutoSubmitted.current = true
            setTimeout(() => doSubmit(initialQuestion), 100)
          }
        })
      } else {
        // No existing conversation — auto-submit will create one
        if (initialQuestion && !hasAutoSubmitted.current) {
          hasAutoSubmitted.current = true
          setTimeout(() => doSubmit(initialQuestion), 100)
        }
      }
    })
  }, [documentId, documentTitle, initialQuestion, doSubmit])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    await doSubmit(input)
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Messages — scrollable area */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 space-y-6 min-h-full flex flex-col">
          {messages.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center">
              <div className="relative w-20 h-20 mb-4">
                <div className="absolute inset-0 m-auto w-16 h-16 rounded-full gradient-bg opacity-10 blur-xl animate-pulse" />
                <div className="absolute inset-0 m-auto w-12 h-12 rounded-xl bg-background border border-border/50 shadow-lg flex items-center justify-center z-10">
                  <Bot className="h-5 w-5 text-primary/70" />
                </div>
              </div>
              <h3 className="font-semibold text-foreground">Ask about {documentTitle}</h3>
              <p className="text-xs text-muted-foreground mt-1 max-w-[250px]">Get answers specifically from this document's contents.</p>
            </div>
          ) : (
            messages.map((msg, i) => (
              <div key={i} className={`flex gap-3 animate-slide-up ${msg.role === 'user' ? 'justify-end' : ''}`}>
                {msg.role === 'assistant' && (
                  <div className="flex-shrink-0 w-8 h-8 rounded-full gradient-bg flex items-center justify-center shadow-sm shadow-primary/20">
                    <Bot size={14} className="text-white" />
                  </div>
                )}
                <div className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                  msg.role === 'user' 
                    ? 'gradient-bg text-white rounded-br-md shadow-sm shadow-primary/15' 
                    : 'bg-card/60 backdrop-blur-md border border-border/40 text-foreground rounded-bl-md shadow-sm'
                }`}>
                  {msg.role === 'assistant' ? (
                    <Markdown className="prose prose-sm dark:prose-invert max-w-none prose-p:my-1.5 prose-li:my-0.5 prose-ul:my-1.5 prose-ol:my-1.5 prose-headings:my-2 prose-strong:text-foreground">{msg.content}</Markdown>
                  ) : (
                    msg.content
                  )}
                </div>
                {msg.role === 'user' && (
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-secondary flex items-center justify-center shadow-sm">
                    <User size={14} className="text-secondary-foreground" />
                  </div>
                )}
              </div>
            ))
          )}
          {loading && (
            <div className="flex gap-3 animate-fade-in">
              <div className="w-8 h-8 rounded-full gradient-bg flex items-center justify-center shadow-sm shadow-primary/20">
                <Bot size={14} className="text-white" />
              </div>
              <div className="bg-card/60 backdrop-blur-md border border-border/40 rounded-2xl rounded-bl-md px-5 py-3.5 shadow-sm">
                <div className="flex gap-1.5 items-center">
                  <div className="w-2 h-2 bg-primary/40 rounded-full animate-bounce" />
                  <div className="w-2 h-2 bg-primary/40 rounded-full animate-bounce [animation-delay:0.15s]" />
                  <div className="w-2 h-2 bg-primary/40 rounded-full animate-bounce [animation-delay:0.3s]" />
                </div>
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>
        </div>
        
        {/* Input bar — always visible at bottom */}
        <div className="shrink-0 border-t border-border/40 bg-background/80 backdrop-blur-md p-4">
          <form onSubmit={handleSubmit} className="max-w-3xl mx-auto relative group flex items-end gap-2 bg-card border border-border/60 rounded-xl p-1.5 shadow-sm focus-within:border-primary/30 transition-all duration-300">
            <Input 
              value={input} 
              onChange={(e) => setInput(e.target.value)} 
              placeholder="Ask a question about this document..." 
              disabled={loading} 
              className="border-0 shadow-none focus-visible:ring-0 h-10 px-3" 
            />
            <Button 
              type="submit" 
              size="icon" 
              className="h-10 w-10 rounded-lg gradient-bg border-0 text-white shrink-0 shadow-md shadow-primary/20 transition-all hover:-translate-y-0.5 disabled:opacity-40 disabled:shadow-none" 
              disabled={loading || !input.trim()}
            >
              <Send size={15} />
            </Button>
          </form>
          <p className="text-center text-[10px] text-muted-foreground/40 mt-2">Answers are grounded in this document only</p>
        </div>
    </div>
  )
}
