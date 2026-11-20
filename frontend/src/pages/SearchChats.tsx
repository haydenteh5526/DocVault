import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { Search, MessageSquare, MoreHorizontal } from 'lucide-react'
import { listConversations, deleteConversation, renameConversation, togglePinConversation, type Conversation } from '@/lib/api'
import { useToast } from '@/components/Toast'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'

export default function SearchChats() {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [filtered, setFiltered] = useState<Conversation[]>([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState('')
  const [name, setName] = useState('')
  const { toast } = useToast()
  // Rename moves focus into the title field, and the menu would take it back to its button while it closes.
  const renaming = useRef<string | null>(null)

  async function load() {
    const data = await listConversations()
    setConversations(data.filter(c => !c.title.startsWith('[')))
  }

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

  async function change(chat: Conversation, action: 'rename' | 'pin' | 'delete') {
    try {
      if (action === 'rename') await renameConversation(chat.id, name.trim())
      else if (action === 'pin') await togglePinConversation(chat.id, !chat.is_pinned)
      else await deleteConversation(chat.id)
      await load()
      setEditing('')
    } catch {
      toast('Could not update the conversation.', 'error')
    }
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
      <div className="max-w-2xl mx-auto w-full px-6 pt-10 pb-6">
        <h1 className="mb-4 text-3xl font-semibold tracking-tight">Recent chats</h1>
        <div className="relative">
          <Search size={20} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search chats"
            aria-label="Search chats"
            autoFocus
            className="w-full h-12 pl-12 pr-4 text-base bg-muted/30 border border-border rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-ring placeholder:text-muted-foreground"
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
              <p className="text-xs mt-1 text-muted-foreground">{query ? 'Try different keywords' : 'Start a new chat to get going'}</p>
            </div>
          ) : (
            <>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
                {query ? `${filtered.length} result${filtered.length !== 1 ? 's' : ''}` : 'Recent'}
              </p>
              <ul className="divide-y border-y">
                {filtered.map(conv => (
                  <li key={conv.id} className="flex min-h-12 items-center justify-between gap-3 px-2 py-1 transition-colors hover:bg-accent/50">
                    {editing === conv.id ? (
                      <form className="flex-1" onSubmit={e => { e.preventDefault(); if (name.trim()) void change(conv, 'rename') }}>
                        <input
                          id={'rename-' + conv.id}
                          className="w-full rounded-md border border-input bg-background px-2 py-1 text-sm"
                          aria-label="Conversation title"
                          autoFocus
                          value={name}
                          onChange={e => setName(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Escape') setEditing('') }}
                        />
                      </form>
                    ) : (
                      <Link to={`/app/ask/${conv.id}`} className="min-w-0 flex-1 truncate py-2 text-sm font-medium hover:underline">
                        {conv.is_pinned && <span aria-label="Pinned">★ </span>}{conv.title || 'New conversation'}
                      </Link>
                    )}
                    <div className="flex shrink-0 items-center gap-1">
                      <span className="text-xs text-muted-foreground">{formatDate(conv.updated_at || conv.created_at)}</span>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="pointer-coarse:size-11" aria-label={'Conversation options for ' + conv.title}>
                            <MoreHorizontal size={17} aria-hidden="true" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent
                          align="end"
                          onCloseAutoFocus={event => {
                            const id = renaming.current
                            if (!id) return
                            renaming.current = null
                            event.preventDefault()
                            requestAnimationFrame(() => document.getElementById('rename-' + id)?.focus())
                          }}
                        >
                          <DropdownMenuItem onSelect={() => void change(conv, 'pin')}>{conv.is_pinned ? 'Unpin' : 'Pin conversation'}</DropdownMenuItem>
                          <DropdownMenuItem onSelect={() => { renaming.current = conv.id; setEditing(conv.id); setName(conv.title) }}>Rename</DropdownMenuItem>
                          <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => void change(conv, 'delete')}>Delete</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
