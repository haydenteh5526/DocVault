import { useTransitionNavigate } from '@/lib/useTransitionNavigate'
import { useState, useRef, useEffect } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { Send, Plus, History, FileText, MoreVertical, Pin, Pencil, Trash2 } from 'lucide-react'
import { useAuth } from '@/lib/auth'
import { PipMark } from '@/components/PipMark'
import { PipActivity } from '@/components/PipActivity'
import { ASSISTANT_NAME } from '@/lib/assistant'
import { usePipActivity } from '@/lib/usePipActivity'
import { Dialog, DialogContent, DialogTitle, DialogClose, DialogPortal, DialogOverlay } from '@/components/ui/dialog'
import { useMediaQuery } from '@/lib/useMediaQuery'
import Markdown from 'react-markdown'
import { Button } from '@/components/ui/button'
import { AssistantActionCard } from '@/components/AssistantAction'
import { ApiError, askQuestion, type AskResponse, type AssistantAction, getConversation, createConversation, sendMessage as sendConversationMessage, deleteConversation, renameConversation, togglePinConversation } from '@/lib/api'

interface Message {
  role: 'user' | 'assistant'
  content: string
  sources?: AskResponse['sources']
  action?: AssistantAction | null
}

export default function AskAI({home = false}: {home?: boolean}) {
  const {accountId} = useAuth()
  const homeKey = home && accountId ? 'pip-thread:'+accountId : null
  const { conversationId } = useParams<{ conversationId?: string }>()
  const activity = usePipActivity()
  const wide = useMediaQuery('(min-width: 1280px)')
  const [activityOpen, setActivityOpen] = useState(false)
  const [hideRail, setHideRail] = useState(false)
  const hasActivity = Boolean(activity.pending.length || activity.upcoming.length || activity.warranties.length || activity.people.length)
  const [restoreAttempt, setRestoreAttempt] = useState(0)
  const [historyStatus, setHistoryStatus] = useState<'ready' | 'loading' | 'failed'>(() =>
    conversationId || (homeKey && sessionStorage.getItem(homeKey)) ? 'loading' : 'ready')
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(false)
  const [activeConversationId, setActiveConversationId] = useState<string | null>(conversationId || null)
  const [chatMenuOpen, setChatMenuOpen] = useState(false)
  const [conversationTitle, setConversationTitle] = useState('')
  const [isPinned, setIsPinned] = useState(false)
  const skipReloadRef = useRef(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const navigate = useNavigate()
  const goTo = useTransitionNavigate()
  const queryClient = useQueryClient()

  // Load conversation messages when conversationId changes
  useEffect(() => {
    let current = true
    const id = conversationId ?? (homeKey ? sessionStorage.getItem(homeKey) : null)
    if (id) {
      setActiveConversationId(id)
      // Skip reload if we just created this conversation locally
      if (skipReloadRef.current) {
        skipReloadRef.current = false
        setHistoryStatus('ready')
        return
      }
      setHistoryStatus('loading')
      getConversation(id)
        .then(data => {
          if (!current) return
          setHistoryStatus('ready')
          setIsPinned(data.is_pinned)
          setConversationTitle(data.title || '')
          setMessages(
            data.messages.map(m => ({
              role: m.role as 'user' | 'assistant',
              content: m.content,
              sources: m.sources || undefined,
              action: m.action ?? null,
            }))
          )
        })
        .catch((error: unknown) => {
          if (!current) return
          if (!(error instanceof ApiError && [403, 404].includes(error.status))) {
            setHistoryStatus('failed')
            return
          }
          if (homeKey) sessionStorage.removeItem(homeKey)
          // Conversation not found, redirect to fresh ask
          navigate('/app/ask', { replace: true })
        })
    } else {
      setHistoryStatus('ready')
      // New chat — reset state
      setActiveConversationId(null)
      setMessages([])
    }
    return () => { current = false }
  }, [conversationId, homeKey, navigate, restoreAttempt])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' })
  }, [messages, loading])

  // Auto-expand textarea
  useEffect(() => {
    const ta = textareaRef.current
    if (ta) {
      ta.style.height = 'auto'
      ta.style.height = `${Math.min(ta.scrollHeight, 160)}px`
    }
  }, [input])

  async function handleSubmit(e?: React.FormEvent) {
    e?.preventDefault()
    if (!input.trim() || loading || historyStatus !== 'ready') return
    const question = input
    setInput('')
    setMessages(prev => [...prev, { role: 'user', content: question }])
    setLoading(true)

    try {
      let convId = activeConversationId

      // If no active conversation, create one first
      if (!convId) {
        const conv = await createConversation()
        convId = conv.id
        setActiveConversationId(convId)
        if (homeKey) sessionStorage.setItem(homeKey, convId)
        else {
          skipReloadRef.current = true
          navigate(`/app/ask/${convId}`, { replace: true })
        }
      }

      // Send message via conversation API
      const data = await sendConversationMessage(convId, question)
      // A reminder proposal is a write on the bill: drop the cached bill so its panel shows the proposal.
      const made = data.assistant_message.action
      if (made?.kind === 'reminder_proposal' && made.document_id) {
        void queryClient.invalidateQueries({ queryKey: ['document', made.document_id] })
        // Documents shows "Reminder awaiting approval" from the same record, and keeps it for 30 s otherwise.
        void queryClient.invalidateQueries({ queryKey: ['document-list-status'] })
      }
      setMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          content: data.assistant_message.content,
          sources: data.assistant_message.sources || undefined,
          action: data.assistant_message.action ?? null,
        },
      ])
    } catch {
      // Fallback: try the standalone ask endpoint
      try {
        const history = messages.map(m => ({ role: m.role, content: m.content }))
        const data = await askQuestion(question, undefined, history)
        setMessages(prev => [...prev, { role: 'assistant', content: data.answer, sources: data.sources }])
      } catch {
        setMessages(prev => [...prev, { role: 'assistant', content: 'Sorry, something went wrong.' }])
      }
    } finally {
      setLoading(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  return (
    <div className="flex h-full min-w-0">
    <div className="flex min-w-0 flex-1 flex-col h-full overflow-hidden relative">
      <div className="flex shrink-0 flex-wrap items-center gap-x-3 border-b px-4 py-2 pr-12 sm:px-8 sm:pr-14">
        <PipMark state={loading ? 'working' : activity.pending.length ? 'needs-you' : 'idle'}/>
        <div className="mr-auto"><h1 className="font-semibold">{ASSISTANT_NAME}</h1><small className="text-muted-foreground">{loading ? 'Working' : activity.status}</small></div>
        <button className="rounded-full border px-3 py-1.5 text-sm" onClick={() => wide && hasActivity ? setHideRail(!hideRail) : setActivityOpen(true)}>Activity</button>
        <Link to="/app/chats" className="inline-flex min-h-11 items-center text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"><History size={18} aria-hidden className="sm:hidden"/><span className="max-sm:sr-only">Recent chats</span></Link>
      </div>
      {/* Top-right 3-dot menu for active conversation */}
      {activeConversationId && messages.length > 0 && (
        <div className="absolute top-3 right-4 z-20">
          <button
            aria-label="Conversation options" onClick={() => setChatMenuOpen(!chatMenuOpen)}
            className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
          >
            <MoreVertical size={18} />
          </button>
          {chatMenuOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setChatMenuOpen(false)} />
              <div className="absolute right-0 top-full mt-1 w-44 bg-card border border-border rounded-lg shadow-md z-50 overflow-hidden">
                <button
                  onClick={async () => {
                    if (!activeConversationId) return
                    const newPinned = !isPinned
                    await togglePinConversation(activeConversationId, newPinned)
                    setIsPinned(newPinned)
                    setChatMenuOpen(false)
                  }}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-foreground/80 hover:bg-accent/50 transition-colors"
                >
                  <Pin size={14} className="text-muted-foreground" />
                  {isPinned ? 'Unpin' : 'Pin conversation'}
                </button>
                <button
                  onClick={async () => {
                    if (!activeConversationId) return
                    const newTitle = prompt('Rename conversation:', conversationTitle)
                    if (newTitle && newTitle.trim()) {
                      await renameConversation(activeConversationId, newTitle.trim())
                      setConversationTitle(newTitle.trim())
                    }
                    setChatMenuOpen(false)
                  }}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-foreground/80 hover:bg-accent/50 transition-colors"
                >
                  <Pencil size={14} className="text-muted-foreground" />
                  Rename
                </button>
                <div className="border-t border-border/30" />
                <button
                  onClick={async () => {
                    if (!activeConversationId) return
                    await deleteConversation(activeConversationId)
                    if (homeKey) sessionStorage.removeItem(homeKey)
                    navigate('/app/ask')
                    setChatMenuOpen(false)
                  }}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-destructive hover:bg-destructive/10 transition-colors"
                >
                  <Trash2 size={14} />
                  Delete
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Messages area */}
      <div className={`flex-1 min-h-0 py-6 relative ${messages.length > 0 ? 'overflow-y-auto' : 'overflow-hidden'}`}>
        {/* Top fade vignette */}
        <div className={`max-w-3xl mx-auto px-4 sm:px-8 space-y-6 ${messages.length === 0 ? 'h-full' : ''}`}>
        {historyStatus === 'failed' && <p role="alert">Could not load this conversation. <button className="underline" onClick={() => setRestoreAttempt(n => n + 1)}>Try again</button></p>}
        {historyStatus === 'loading' && <p role="status">Loading conversation…</p>}
        {/* Empty state */}
        {messages.length === 0 && historyStatus === 'ready' && (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="mb-5 grid size-12 place-items-center rounded-lg border bg-card text-muted-foreground">
              <PipMark size={44}/>
            </div>

            <h2 className="font-semibold text-xl tracking-tight text-foreground">Ask anything about your documents</h2>
            <p className="text-sm text-muted-foreground mt-2 max-w-sm leading-relaxed">
              Ask when a bill is due, check a source or propose a reminder.
            </p>
          </div>
        )}

        {/* Message bubbles */}
        {messages.map((msg, i) => (
          // Keyed by conversation as well as position, so a card's edits never carry into another conversation.
          <div key={`${conversationId ?? 'new'}:${i}`} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : ''}`}>
            {msg.role === 'assistant' && <PipMark size={27}/>}
            <div className="min-w-0 max-w-[85%] break-words">
              <div className={`rounded-lg px-4 py-3 text-sm leading-relaxed ${
                msg.role === 'user'
                  ? 'bg-muted text-foreground'
                  : 'bg-card border border-border text-foreground'
              }`}>
                {msg.role === 'assistant' ? (
                  <Markdown className="prose prose-sm dark:prose-invert max-w-none prose-p:my-1.5 prose-li:my-0.5 prose-ul:my-1.5 prose-ol:my-1.5 prose-headings:my-2 prose-strong:text-foreground">{msg.content}</Markdown>
                ) : (
                  msg.content
                )}
              </div>
              {msg.role === 'assistant' && msg.action && (
                <>{msg.action.kind === 'reminder_proposal' && msg.action.proposal && <p className="mx-auto my-3 w-fit rounded-full border px-3 py-1 text-xs text-muted-foreground">Reminder proposed</p>}
                <AssistantActionCard action={msg.action} onOpenDocument={id => goTo(`/app/documents/${id}`)} /></>
              )}
              {/* Citation pills */}
              {msg.sources && msg.sources.length > 0 && (
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  <span className="text-[10px] text-muted-foreground mr-0.5 self-center">Sources:</span>
                  {msg.sources.map((s, j) => (
                    <button
                      key={j}
                      onClick={() => navigate(`/app/documents/${s.document_id}`)}
                      className="inline-flex items-center gap-1.5 text-[11px] text-foreground bg-muted hover:bg-accent border border-border rounded-md pl-2 pr-2.5 py-1 transition-colors duration-150"
                    >
                      <span className="text-left"><span className="block"><FileText size={11} className="inline"/> {s.document_title}{s.line_start && <span className="font-mono"> · line {s.line_start}{s.line_end && s.line_end !== s.line_start ? '–'+s.line_end : ''}</span>}</span>{s.chunk_text && <mark className="bg-mark text-mark-text">{s.chunk_text}</mark>}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}

        {/* Typing indicator */}
        {loading && (
          <div className="flex gap-3">
            <div className="bg-card border border-border rounded-lg px-5 py-3.5">
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

      {/* Floating input bar */}
      <div className="shrink-0 px-4 sm:px-8 py-4">
        <form onSubmit={handleSubmit} className="max-w-3xl mx-auto">
          <div className="relative group">
            <div className="pip-composer relative flex items-end gap-2 bg-card border border-input rounded-3xl p-2 transition-colors">
              <Link to="/app/upload" aria-label="Upload a document" className="grid size-10 shrink-0 place-items-center rounded-full"><Plus size={19}/></Link>
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                aria-label={`Message ${ASSISTANT_NAME}`} placeholder={`Message ${ASSISTANT_NAME}`}
                disabled={loading || historyStatus !== 'ready'}
                rows={1}
                className="min-w-0 flex-1 resize-none bg-transparent px-3 py-2 text-sm focus:outline-none max-h-40 leading-relaxed placeholder:text-muted-foreground"
              />
              <div className="relative group/btn shrink-0">
                <Button
                  type="submit"
                  size="icon"
                  aria-label="Send message"
                  className="relative h-10 w-10 rounded-full transition-colors duration-150 disabled:opacity-40"
                  disabled={loading || historyStatus !== 'ready' || !input.trim()}
                >
                  <Send size={15} />
                </Button>
              </div>
            </div>
          </div>
        </form>
      </div>
    </div>
    {wide && hasActivity && !hideRail && <aside aria-label="Activity" className="w-72 overflow-auto border-l p-5"><PipActivity activity={activity}/></aside>}
    <Dialog open={activityOpen} onOpenChange={setActivityOpen}><DialogPortal><DialogOverlay className="fixed inset-0 z-40 bg-black/60"/><DialogContent aria-describedby={undefined} className="fixed inset-x-3 top-[12%] z-50 mx-auto max-h-[75dvh] max-w-md overflow-auto rounded-2xl border bg-card p-5">
      <div className="mb-4 flex justify-between"><DialogTitle>Activity</DialogTitle><DialogClose>Close</DialogClose></div>
      {hasActivity ? <PipActivity activity={activity}/> : <p>{activity.status}</p>}
    </DialogContent></DialogPortal></Dialog>
    </div>
  )
}
