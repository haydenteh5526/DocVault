import { useState, useEffect, useCallback } from 'react'
import { Command } from 'cmdk'
import {
  FileText, Upload, Search, MessageSquare, ShieldCheck,
  Settings, Sun, Moon, Home, ArrowRight, Loader2
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { searchDocuments } from '@/lib/api'
import { useTheme } from '@/lib/theme'

interface Props {
  open: boolean
  onClose: () => void
}

const NAV_ITEMS = [
  { label: 'Documents', icon: <Home size={15} />, to: '/app' },
  { label: 'Upload a document', icon: <Upload size={15} />, to: '/app/upload' },
  { label: 'Search documents', icon: <Search size={15} />, to: '/app/search' },
  { label: 'Ask AI', icon: <MessageSquare size={15} />, to: '/app/ask' },
  { label: 'Warranties', icon: <ShieldCheck size={15} />, to: '/app/warranties' },
  { label: 'Settings', icon: <Settings size={15} />, to: '/app/settings' },
]

export function CommandPalette({ open, onClose }: Props) {
  const [query, setQuery] = useState('')
  const [docResults, setDocResults] = useState<{ document_id: string; document_title: string; chunk_text: string }[]>([])
  const [searching, setSearching] = useState(false)
  const navigate = useNavigate()
  const { theme, toggle } = useTheme()

  // Debounced document search
  useEffect(() => {
    if (!query.trim() || query.length < 2) { setDocResults([]); return }
    setSearching(true)
    const t = setTimeout(async () => {
      try {
        const data = await searchDocuments(query)
        setDocResults(data.results.slice(0, 4))
      } catch { /* ignore */ } finally { setSearching(false) }
    }, 300)
    return () => clearTimeout(t)
  }, [query])

  // Reset on close
  useEffect(() => { if (!open) { setQuery(''); setDocResults([]) } }, [open])

  const go = useCallback((path: string) => {
    onClose()
    navigate(path)
  }, [navigate, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[150] flex items-start justify-center pt-[10vh] px-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-fade-in" onClick={onClose} />

      {/* Palette */}
      <div className="relative w-full max-w-lg animate-scale-in">
        <Command
          className="rounded-2xl border border-border/50 bg-card shadow-2xl shadow-black/20 overflow-hidden"
          shouldFilter={false}
        >
          {/* Input */}
          <div className="flex items-center gap-3 px-4 py-3.5 border-b border-border/40">
            <Search size={16} className="text-muted-foreground shrink-0" />
            <Command.Input
              value={query}
              onValueChange={setQuery}
              placeholder="Search documents or type a command…"
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              autoFocus
            />
            {searching && <Loader2 size={14} className="animate-spin text-muted-foreground shrink-0" />}
            <kbd className="hidden sm:inline-flex items-center px-1.5 py-0.5 rounded border border-border/50 text-[10px] text-muted-foreground font-medium bg-muted/60 shrink-0">ESC</kbd>
          </div>

          <Command.List className="max-h-[380px] overflow-auto py-2 px-1">
            <Command.Empty className="py-10 text-center text-sm text-muted-foreground">
              No results found
            </Command.Empty>

            {/* Document results */}
            {docResults.length > 0 && (
              <Command.Group heading={<GroupLabel>Documents</GroupLabel>}>
                {docResults.map(r => (
                  <Command.Item
                    key={r.document_id}
                    value={r.document_title}
                    onSelect={() => go(`/app/documents/${r.document_id}`)}
                    className="flex items-start gap-3 px-3 py-2.5 rounded-lg text-sm cursor-pointer hover:bg-accent/60 aria-selected:bg-accent/60 transition-colors mx-1"
                  >
                    <div className="w-7 h-7 rounded-lg bg-primary/[0.08] flex items-center justify-center shrink-0 mt-0.5">
                      <FileText size={13} className="text-primary/70" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium truncate">{r.document_title}</p>
                      <p className="text-[11px] text-muted-foreground line-clamp-1 mt-0.5" dangerouslySetInnerHTML={{ __html: r.chunk_text }} />
                    </div>
                    <ArrowRight size={13} className="text-muted-foreground/50 shrink-0 mt-1" />
                  </Command.Item>
                ))}
              </Command.Group>
            )}

            {/* Navigation */}
            <Command.Group heading={<GroupLabel>Navigate</GroupLabel>}>
              {NAV_ITEMS.filter(item =>
                !query || item.label.toLowerCase().includes(query.toLowerCase())
              ).map(item => (
                <Command.Item
                  key={item.to}
                  value={item.label}
                  onSelect={() => go(item.to)}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm cursor-pointer hover:bg-accent/60 aria-selected:bg-accent/60 transition-colors mx-1"
                >
                  <div className="w-7 h-7 rounded-lg bg-muted flex items-center justify-center shrink-0 text-muted-foreground">
                    {item.icon}
                  </div>
                  {item.label}
                </Command.Item>
              ))}
            </Command.Group>

            {/* Actions */}
            <Command.Group heading={<GroupLabel>Actions</GroupLabel>}>
              <Command.Item
                value="toggle theme dark light mode"
                onSelect={() => { toggle(); onClose() }}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm cursor-pointer hover:bg-accent/60 aria-selected:bg-accent/60 transition-colors mx-1"
              >
                <div className="w-7 h-7 rounded-lg bg-muted flex items-center justify-center shrink-0 text-muted-foreground">
                  {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
                </div>
                Switch to {theme === 'dark' ? 'light' : 'dark'} mode
              </Command.Item>
            </Command.Group>
          </Command.List>

          {/* Footer */}
          <div className="border-t border-border/40 px-4 py-2 flex items-center gap-4 text-[10px] text-muted-foreground/60">
            <span><kbd className="px-1 py-0.5 rounded bg-muted border border-border/50 text-[10px]">↑↓</kbd> navigate</span>
            <span><kbd className="px-1 py-0.5 rounded bg-muted border border-border/50 text-[10px]">↵</kbd> select</span>
            <span><kbd className="px-1 py-0.5 rounded bg-muted border border-border/50 text-[10px]">ESC</kbd> close</span>
          </div>
        </Command>
      </div>
    </div>
  )
}

function GroupLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-3 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
      {children}
    </p>
  )
}
