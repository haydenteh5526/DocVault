import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, MessageSquare, Trash2 } from 'lucide-react'
import { listConversations, deleteConversation, type Conversation } from '@/lib/api'

export default function SearchChats() {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [filtered, setFiltered] = useState<Conversation[]>([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  useEffect(() => {
    listConversations().then(data => {
      const chats = data.filter(c => !c.title.startsWith('['))
      setConversations(chats)
      setFiltered(chats)
      setLoading(false)
    })
  }, [])

  useEffect(() => {
    if (!query.trim()) {
      setFiltered(conversations)
    } else {
      setFiltered(conversations.filter(c => c.title.toLowerCase().includes(query.toLowerCase())))
    }
  }, [query, conversations])

  async function handleDelete(id: string) {
    await deleteConversation(id)
    setConversations(prev => prev.filter(c => c.id !== id))
  }

  function formatDate(dateStr: string): string {
    const date = new Date(dateStr.endsWith('Z') || dateStr.includes('+') ? dateStr : dateStr + 'Z')
    const now = new Date()
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24))
    
    if (diffDays === 0) return 'Today'
    if (diffDays === 1) return 'Yesterday'
    if (diffDays < 7) return date.toLocaleDateString(undefined, { weekday: 'long' })
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      {/* Search bar */}
      <div className="max-w-2xl mx-auto w-full px-6 pt-12 pb-6">
        <div className="relative">
          <Search size={20} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground/50" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search chats"
            autoFocus
            className="w-full h-12 pl-12 pr-4 text-base bg-muted/30 border border-border/50 rounded-xl focus:outline-none focus:border-primary/30 focus:bg-muted/50 placeholder:text-muted-foreground/40 transition-all"
          />
        </div>
      </div>

      {/* Conversations list */}
      <div className="flex-1 overflow-auto">
        <div className="max-w-2xl mx-auto w-full px-6 pb-8">
          {loading ? (
            <div className="space-y-4 animate-pulse">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-12 bg-muted/30 rounded-lg" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <MessageSquare size={32} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm font-medium">{query ? 'No chats match your search' : 'No conversations yet'}</p>
              <p className="text-xs mt-1 text-muted-foreground/60">{query ? 'Try different keywords' : 'Start a new chat to get going'}</p>
            </div>
          ) : (
            <>
              <p className="text-xs font-medium text-muted-foreground/60 uppercase tracking-wider mb-3">
                {query ? `${filtered.length} result${filtered.length !== 1 ? 's' : ''}` : 'Recent'}
              </p>
              <div className="space-y-0.5">
                {filtered.map(conv => (
                  <div
                    key={conv.id}
                    className="group flex items-center justify-between px-4 py-3 rounded-lg hover:bg-accent/50 cursor-pointer transition-colors"
                    onClick={() => navigate(`/app/ask/${conv.id}`)}
                  >
                    <p className="text-sm font-medium truncate flex-1 text-foreground/90">{conv.title}</p>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-xs text-muted-foreground/50">{formatDate(conv.updated_at || conv.created_at)}</span>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDelete(conv.id) }}
                        className="p-1 rounded-md text-muted-foreground/30 hover:text-destructive hover:bg-destructive/10 transition-colors opacity-0 group-hover:opacity-100"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
