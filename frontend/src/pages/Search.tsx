import { useState, useEffect, useRef, useCallback } from 'react'
import { Search, FileText, SearchX, Clock, ArrowRight } from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { searchDocuments, type SearchResult } from '@/lib/api'

export default function SearchPage() {
  const [searchParams] = useSearchParams()
  const [query, setQuery] = useState(searchParams.get('q') || '')
  const [results, setResults] = useState<SearchResult[]>([])
  const [searched, setSearched] = useState(false)
  const [loading, setLoading] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const inputRef = useRef<HTMLInputElement>(null)

  // Recent searches from localStorage
  const [recentSearches, setRecentSearches] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem('docvault-recent-searches') || '[]') } catch { return [] }
  })

  const addToRecent = useCallback((q: string) => {
    const trimmed = q.trim()
    if (!trimmed) return
    setRecentSearches(current => {
      const updated = [trimmed, ...current.filter(s => s !== trimmed)].slice(0, 5)
      localStorage.setItem('docvault-recent-searches', JSON.stringify(updated))
      return updated
    })
  }, [])

  useEffect(() => {
    if (!query.trim()) {
      setResults([])
      setSearched(false)
      return
    }
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      setLoading(true)
      try {
        const data = await searchDocuments(query)
        setResults(data.results)
        setSearched(true)
        addToRecent(query)
      } catch {
        setResults([])
        setSearched(true)
      }
      setLoading(false)
    }, 400)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [query, addToRecent])

  return (
    <div className="p-4 sm:p-8 max-w-3xl mx-auto h-full overflow-y-auto">
      {/* Header */}
      <div className="mb-8">
        <h2 className="text-2xl font-semibold tracking-tight text-foreground/90">Search</h2>
        <p className="text-muted-foreground text-sm mt-1.5 font-medium">Find information across all your documents with AI-powered semantic search</p>
      </div>

      {/* Search bar */}
      <div className="" style={{ animationDelay: '50ms', animationFillMode: 'both' }}>
        <div className="relative group">

          <div className="relative bg-card border border-border/50 rounded-xl shadow-sm group-focus-within:shadow-lg group-focus-within:border-primary/30 transition-all duration-300">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground group-focus-within:text-primary transition-colors duration-300" />
            <Input
              aria-label="Search documents"
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by keyword, meaning, or ask a question..."
              className="pl-12 pr-12 h-13 bg-transparent border-0 shadow-none text-base focus-visible:ring-0 placeholder:text-muted-foreground"
              autoFocus
            />
            {loading && <div className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />}
            {!loading && query && (
              <button onClick={() => setQuery('')} className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors text-xs font-medium">
                Clear
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Empty state — no query */}
      {!searched && !query && (
        <div className="" style={{ animationDelay: '100ms', animationFillMode: 'both' }}>
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <h3 className="font-bold text-xl tracking-tight text-foreground">Semantic search</h3>
            <p className="mt-2 text-sm text-muted-foreground max-w-sm leading-relaxed">
              Search by meaning, not just keywords. AI understands the context of your documents and finds the most relevant results.
            </p>

            <div className="flex items-center gap-2 mt-5 text-[11px] text-muted-foreground">
              <kbd className="px-2 py-1 rounded-md bg-muted/40 border border-border/50 text-[13px] font-medium">⌘K</kbd>
              <span>to search from anywhere</span>
            </div>
          </div>

          {/* Recent searches */}
          {recentSearches.length > 0 && (
            <div className="mt-2 max-w-md mx-auto">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2.5">Recent</p>
              <div className="space-y-1">
                {recentSearches.map((s, i) => (
                  <button
                    key={i}
                    onClick={() => setQuery(s)}
                    className="flex items-center gap-2.5 w-full px-3 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors group"
                  >
                    <Clock size={14} className="text-muted-foreground shrink-0" />
                    <span className="truncate text-left flex-1">{s}</span>
                    <ArrowRight size={12} className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Results */}
      {searched && (
        <div className="mt-8" style={{ animationDelay: '50ms', animationFillMode: 'both' }}>
          {results.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="w-16 h-16 rounded-full bg-muted/30 flex items-center justify-center mb-5">
                <SearchX size={24} className="text-muted-foreground" />
              </div>
              <h3 className="font-semibold text-foreground">No results found</h3>
              <p className="text-sm text-muted-foreground mt-1.5 max-w-sm">
                No documents match "<span className="font-medium text-foreground">{query}</span>". Try different keywords or a broader search.
              </p>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between mb-4">
                <p className="text-xs font-medium text-muted-foreground">
                  {results.length} result{results.length !== 1 ? 's' : ''} for "<span className="text-foreground">{query}</span>"
                </p>
              </div>
              <div className="space-y-3">
                {results.map((r, i) => (
                  <Card
                    key={i}
                    className="rounded-none border-0 border-b shadow-none"
                    style={{ animationDelay: `${i * 50}ms`, animationFillMode: 'both' }}
                  >


                    <CardContent className="p-5 relative z-10">
                      <div className="flex items-start gap-3.5">
                        <div className="w-10 h-10 rounded-lg bg-primary/[0.06] flex items-center justify-center flex-shrink-0 mt-0.5 group-hover:bg-primary/10 transition-colors">
                          <FileText size={16} className="text-foreground group-hover:text-primary/80 transition-colors" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <h3 className="text-sm font-semibold"><Link className="hover:underline" to={'/app/documents/' + r.document_id + '?q=' + encodeURIComponent(query)}>{r.document_title}</Link></h3>
                            {r.similarity !== undefined && (
                              <span className="text-[13px] font-medium text-foreground px-1.5 py-0.5 rounded-full bg-primary/[0.06] shrink-0">
                                {Math.round(r.similarity * 100)}% match
                              </span>
                            )}
                          </div>
                          <p className="mt-1.5 line-clamp-3 text-sm leading-relaxed text-muted-foreground">
                            {r.chunk_text.split(/(<b>.*?<\/b>)/gis).map((part, j) => part.toLowerCase().startsWith('<b>') && part.toLowerCase().endsWith('</b>')
                              ? <mark key={j} className="bg-mark text-mark-text">{part.slice(3,-4)}</mark> : part)}
                          </p>
                        </div>
                        <ArrowRight size={16} className="text-muted-foreground group-hover:text-foreground transition-all shrink-0 mt-1 group-hover:translate-x-0.5" />
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

