import { useState, useRef, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Send, Bot, User, FileText, Sparkles, MoreVertical, Pin, Pencil, Trash2 } from 'lucide-react'
import Markdown from 'react-markdown'
import { Button } from '@/components/ui/button'
import { askQuestion, type AskResponse, getConversation, createConversation, sendMessage as sendConversationMessage, deleteConversation, renameConversation, togglePinConversation } from '@/lib/api'

interface Message {
  role: 'user' | 'assistant'
  content: string
  sources?: AskResponse['sources']
}

export default function AskAI() {
  const { conversationId } = useParams<{ conversationId?: string }>()
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

  // Load conversation messages when conversationId changes
  useEffect(() => {
    if (conversationId) {
      setActiveConversationId(conversationId)
      // Skip reload if we just created this conversation locally
      if (skipReloadRef.current) {
        skipReloadRef.current = false
        return
      }
      getConversation(conversationId)
        .then(data => {
          setConversationTitle(data.title || '')
          setMessages(
            data.messages.map(m => ({
              role: m.role as 'user' | 'assistant',
              content: m.content,
              sources: m.sources || undefined,
            }))
          )
        })
        .catch(() => {
          // Conversation not found, redirect to fresh ask
          navigate('/app/ask', { replace: true })
        })
    } else {
      // New chat — reset state
      setActiveConversationId(null)
      setMessages([])
    }
  }, [conversationId, navigate])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
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
    if (!input.trim() || loading) return
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
        skipReloadRef.current = true
        navigate(`/app/ask/${convId}`, { replace: true })
      }

      // Send message via conversation API
      const data = await sendConversationMessage(convId, question)
      setMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          content: data.assistant_message.content,
          sources: data.assistant_message.sources || undefined,
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

  // Dedupe sources by document
  function uniqueSources(sources?: AskResponse['sources']) {
    if (!sources) return []
    const seen = new Set<string>()
    return sources.filter(s => {
      if (seen.has(s.document_id)) return false
      seen.add(s.document_id)
      return true
    })
  }

  return (
    <div className="flex flex-col h-full overflow-hidden relative">
      {/* Top-right 3-dot menu for active conversation */}
      {activeConversationId && messages.length > 0 && (
        <div className="absolute top-3 right-4 z-20">
          <button
            onClick={() => setChatMenuOpen(!chatMenuOpen)}
            className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
          >
            <MoreVertical size={18} />
          </button>
          {chatMenuOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setChatMenuOpen(false)} />
              <div className="absolute right-0 top-full mt-1 w-44 bg-card border border-border/50 rounded-xl shadow-xl z-50 animate-scale-in overflow-hidden">
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
        {messages.length > 0 && (
          <div className="sticky top-0 left-0 right-0 h-8 bg-gradient-to-b from-background/50 to-transparent pointer-events-none z-10" />
        )}
        <div className={`max-w-3xl mx-auto px-4 sm:px-8 space-y-6 ${messages.length === 0 ? 'h-full' : ''}`}>
        {/* Empty state */}
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center animate-slide-up">
            <div className="relative w-20 h-20 mb-6">
              <div className="absolute inset-0 m-auto w-20 h-20 rounded-full gradient-bg opacity-10 blur-2xl animate-pulse" />
              <div className="absolute inset-0 m-auto w-14 h-14 rounded-2xl bg-background border border-border/50 shadow-xl flex items-center justify-center z-10">
                <Sparkles className="h-6 w-6 text-primary/60" />
              </div>
            </div>

            <h3 className="font-semibold text-xl tracking-tight text-foreground">Ask anything about your documents</h3>
            <p className="text-sm text-muted-foreground mt-2 max-w-sm leading-relaxed">
              Get instant answers backed by your uploaded files. AI will cite the exact source documents.
            </p>
          </div>
        )}

        {/* Message bubbles */}
        {messages.map((msg, i) => (
          <div key={i} className={`flex gap-3 animate-slide-up ${msg.role === 'user' ? 'justify-end' : ''}`}>
            {msg.role === 'assistant' && (
              <div className="flex-shrink-0 w-8 h-8 rounded-full gradient-bg flex items-center justify-center shadow-md shadow-primary/20">
                <Bot size={14} className="text-white" />
              </div>
            )}
            <div className="max-w-[85%]">
              <div className={`rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                msg.role === 'user'
                  ? 'gradient-bg text-white rounded-br-md shadow-md shadow-primary/15'
                  : 'bg-card/60 backdrop-blur-md border border-border/40 text-foreground rounded-bl-md shadow-sm'
              }`}>
                {msg.role === 'assistant' ? (
                  <Markdown className="prose prose-sm dark:prose-invert max-w-none prose-p:my-1.5 prose-li:my-0.5 prose-ul:my-1.5 prose-ol:my-1.5 prose-headings:my-2 prose-strong:text-foreground">{msg.content}</Markdown>
                ) : (
                  msg.content
                )}
              </div>
              {/* Citation pills */}
              {uniqueSources(msg.sources).length > 0 && (
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  <span className="text-[10px] text-muted-foreground/50 mr-0.5 self-center">Sources:</span>
                  {uniqueSources(msg.sources).map((s, j) => (
                    <button
                      key={j}
                      onClick={() => navigate(`/app/documents/${s.document_id}`)}
                      className="inline-flex items-center gap-1.5 text-[11px] text-primary bg-primary/[0.06] hover:bg-primary/[0.12] border border-primary/10 rounded-full pl-2 pr-2.5 py-1 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-sm"
                    >
                      <FileText size={11} /> {s.document_title}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {msg.role === 'user' && (
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-secondary flex items-center justify-center shadow-sm">
                <User size={14} className="text-secondary-foreground" />
              </div>
            )}
          </div>
        ))}

        {/* Typing indicator */}
        {loading && (
          <div className="flex gap-3 animate-fade-in">
            <div className="w-8 h-8 rounded-full gradient-bg flex items-center justify-center shadow-md shadow-primary/20">
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

      {/* Floating input bar */}
      <div className="shrink-0 px-4 sm:px-8 py-4">
        <form onSubmit={handleSubmit} className="max-w-3xl mx-auto">
          <div className="relative group">
            <div className="absolute -inset-0.5 bg-gradient-to-r from-primary/20 via-purple-500/10 to-primary/20 rounded-2xl blur opacity-0 group-focus-within:opacity-100 transition-opacity duration-500" />
            <div className="relative flex items-end gap-2 bg-card/60 backdrop-blur-md border border-border/50 rounded-xl p-2 shadow-sm group-focus-within:shadow-lg group-focus-within:border-primary/30 transition-all duration-300">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask a question... (Shift+Enter for new line)"
                disabled={loading}
                rows={1}
                className="flex-1 resize-none bg-transparent px-3 py-2 text-sm focus:outline-none max-h-40 leading-relaxed placeholder:text-muted-foreground/40"
              />
              <div className="relative group/btn shrink-0">
                {input.trim() && (
                  <div className="absolute -inset-1 bg-gradient-to-r from-primary to-purple-600 rounded-xl blur opacity-40 group-hover/btn:opacity-70 transition duration-300" />
                )}
                <Button
                  type="submit"
                  size="icon"
                  aria-label="Send message"
                  className="relative h-10 w-10 rounded-xl gradient-bg border-0 text-white shadow-md shadow-primary/20 transition-all duration-200 hover:-translate-y-0.5 disabled:opacity-40 disabled:shadow-none"
                  disabled={loading || !input.trim()}
                >
                  <Send size={15} />
                </Button>
              </div>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}
