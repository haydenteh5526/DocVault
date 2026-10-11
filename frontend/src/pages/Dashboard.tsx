import { useEffect, useState, useMemo, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { FileText, Trash2, FolderOpen, FolderPlus, ChevronRight, Home, CheckSquare, Square, Upload, Loader2, Pencil, LayoutGrid, List, ArrowUpDown, Filter, Star, BarChart2, ChevronDown, Eye, CloudOff } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { getDocuments, deleteDocument, bulkDeleteDocuments, getCategories, createCategory, renameCategory, deleteCategory, moveToCategory, toggleFavourite, renameDocument, type Document } from '@/lib/api'
import { useToast } from '@/components/Toast'
import { AnalyticsWidgets } from '@/components/AnalyticsWidgets'
import { DocumentPreviewModal } from '@/components/DocumentPreviewModal'

type SortKey = 'name' | 'date' | 'size' | 'type'
type SortDir = 'asc' | 'desc'
type ViewMode = 'grid' | 'list'
type FileFilter = 'all' | 'pdf' | 'image'

export default function Dashboard() {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [creatingFolder, setCreatingFolder] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [editingFolder, setEditingFolder] = useState<string | null>(null)
  const [editFolderName, setEditFolderName] = useState('')
  const [dragDocId, setDragDocId] = useState<string | null>(null)
  const [dragOverFolder, setDragOverFolder] = useState<string | null>(null)
  const [renamingDoc, setRenamingDoc] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('date')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [viewMode, setViewMode] = useState<ViewMode>(() => (localStorage.getItem('docvault-view') as ViewMode) || 'grid')
  const [fileFilter, setFileFilter] = useState<FileFilter>('all')
  const [typeFilter, setTypeFilter] = useState<string>('all')
  const [showSortMenu, setShowSortMenu] = useState(false)
  const [showFilterMenu, setShowFilterMenu] = useState(false)
  const [showViewMenu, setShowViewMenu] = useState(false)
  const [previewDoc, setPreviewDoc] = useState<Document | null>(null)
  const [showAnalytics, setShowAnalytics] = useState(() => localStorage.getItem('docvault-analytics') !== 'hidden')
  const [searchParams, setSearchParams] = useSearchParams()
  const currentFolder = searchParams.get('folder')
  const navigate = useNavigate()
  const { toast } = useToast()
  const queryClient = useQueryClient()

  const docsQuery = useQuery({
    queryKey: ['documents'],
    queryFn: async () => (await getDocuments()).documents,
    // Poll every 3s while any document is still processing, otherwise stop.
    refetchInterval: (query) =>
      query.state.data?.some(
        d => d.processing_status && d.processing_status !== 'complete' && d.processing_status !== 'failed',
      )
        ? 3000
        : false,
  })
  const { data: categories = [] } = useQuery({
    queryKey: ['categories'],
    queryFn: getCategories,
  })

  const allDocs = useMemo(() => docsQuery.data ?? [], [docsQuery.data])
  const loading = docsQuery.isLoading
  const error = docsQuery.isError

  // Optimistic cache updaters (replace the old setAllDocs/setCategories).
  const setDocs = (updater: (docs: Document[]) => Document[]) =>
    queryClient.setQueryData<Document[]>(['documents'], (old = []) => updater(old))
  const setCats = (updater: (cats: { id: string; name: string }[]) => { id: string; name: string }[]) =>
    queryClient.setQueryData<{ id: string; name: string }[]>(['categories'], (old = []) => updater(old))

  // Toast when a document transitions to complete/failed (replaces the old
  // manual polling loop; refetchInterval above drives the refresh).
  const prevStatusRef = useRef<Record<string, string>>({})
  useEffect(() => {
    const docs = docsQuery.data
    if (!docs) return
    docs.forEach(d => {
      const prev = prevStatusRef.current[d.id]
      if (prev && prev !== 'complete' && d.processing_status === 'complete') {
        toast(`"${d.title}" processed successfully`, 'success')
      }
      if (prev && prev !== 'failed' && d.processing_status === 'failed') {
        toast(`"${d.title}" processing failed`, 'error')
      }
    })
    prevStatusRef.current = Object.fromEntries(docs.map(d => [d.id, d.processing_status || '']))
  }, [docsQuery.data, toast])

  async function handleDelete(e: React.MouseEvent, id: string) {
    e.stopPropagation()
    const doc = allDocs.find(d => d.id === id)
    // Optimistically remove from UI
    setDocs(docs => docs.filter(d => d.id !== id))
    setSelected(prev => { const n = new Set(prev); n.delete(id); return n })
    // Delay actual deletion — allow undo
    let cancelled = false
    const timer = setTimeout(async () => {
      if (!cancelled) await deleteDocument(id)
    }, 5000)
    toast(`"${doc?.title || 'Document'}" deleted`, 'info', {
      label: 'Undo',
      onClick: () => { cancelled = true; clearTimeout(timer); if (doc) setDocs(docs => [...docs, doc]) },
    })
  }

  function toggleSelect(e: React.MouseEvent, id: string) {
    e.stopPropagation()
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function handleBulkDelete() {
    const ids = [...selected]
    await bulkDeleteDocuments(ids)
    setDocs(docs => docs.filter(d => !selected.has(d.id)))
    setSelected(new Set())
    toast(`${ids.length} document${ids.length > 1 ? 's' : ''} deleted`)
  }

  async function handleCreateFolder() {
    const name = newFolderName.trim()
    if (!name) return
    const cat = await createCategory(name)
    setCats(cats => [...cats, cat])
    setCreatingFolder(false)
    setNewFolderName('')
    toast(`Folder "${name}" created`)
  }

  async function handleRenameFolder(id: string) {
    const name = editFolderName.trim()
    if (!name) return
    const updated = await renameCategory(id, name)
    setCats(cats => cats.map(c => c.id === id ? updated : c))
    setEditingFolder(null)
    setEditFolderName('')
  }

  async function handleDeleteFolder(e: React.MouseEvent, id: string) {
    e.stopPropagation()
    await deleteCategory(id)
    setCats(cats => cats.filter(c => c.id !== id))
    // Docs in this folder become uncategorised
    setDocs(docs => docs.map(d => d.category_id === id ? { ...d, category_id: null } : d))
    if (currentFolder === id) setSearchParams({})
  }

  function handleDragStart(docId: string) {
    setDragDocId(docId)
  }

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('asc') }
  }

  function switchView(mode: ViewMode) {
    setViewMode(mode)
    localStorage.setItem('docvault-view', mode)
  }

  async function handleRenameDoc(docId: string) {
    const name = renameValue.trim()
    if (!name) { setRenamingDoc(null); return }
    await renameDocument(docId, name)
    setDocs(docs => docs.map(d => d.id === docId ? { ...d, title: name } : d))
    setRenamingDoc(null)
    toast('Document renamed')
  }

  async function handleToggleFavourite(e: React.MouseEvent, docId: string) {
    e.stopPropagation()
    const result = await toggleFavourite(docId)
    setDocs(docs => docs.map(d => d.id === docId ? { ...d, is_favourite: result.is_favourite } : d))
  }

  function handleDragOverFolder(e: React.DragEvent, folderId: string) {
    e.preventDefault()
    setDragOverFolder(folderId)
  }

  async function handleDropOnFolder(folderId: string) {
    if (dragDocId) {
      const categoryId = folderId === '__root__' ? null : folderId
      await moveToCategory(dragDocId, categoryId)
      setDocs(docs => docs.map(d => d.id === dragDocId ? { ...d, category_id: categoryId } : d))
      const folderName = folderId === '__root__' ? 'All Documents' : categories.find(c => c.id === folderId)?.name || 'folder'
      toast(`Moved to ${folderName}`)
    }
    setDragDocId(null)
    setDragOverFolder(null)
  }

  // Current view
  const currentCategoryName = categories.find(c => c.id === currentFolder)?.name
  const docsInFolder = useMemo(() => {
    let docs = currentFolder
      ? allDocs.filter(d => d.category_id === currentFolder)
      : allDocs.filter(d => !d.category_id)

    // File type filter
    if (fileFilter === 'pdf') docs = docs.filter(d => d.title.toLowerCase().endsWith('.pdf'))
    else if (fileFilter === 'image') docs = docs.filter(d => !d.title.toLowerCase().endsWith('.pdf'))

    // Document-type filter (Manual, Warranty, Receipt, …)
    if (typeFilter !== 'all') docs = docs.filter(d => d.document_type === typeFilter)

    // Sort (favourites always first)
    docs = [...docs].sort((a, b) => {
      if (a.is_favourite && !b.is_favourite) return -1
      if (!a.is_favourite && b.is_favourite) return 1
      let cmp = 0
      switch (sortKey) {
        case 'name': cmp = a.title.localeCompare(b.title); break
        case 'date': cmp = new Date(a.created_at).getTime() - new Date(b.created_at).getTime(); break
        case 'size': cmp = (a.file_size || 0) - (b.file_size || 0); break
        case 'type': cmp = (a.document_type || '').localeCompare(b.document_type || ''); break
      }
      return sortDir === 'desc' ? -cmp : cmp
    })

    return docs
  }, [allDocs, currentFolder, fileFilter, typeFilter, sortKey, sortDir])
  const totalDocs = allDocs.length

  // Distinct document types present in the collection (for the type filter).
  const docTypes = useMemo(() => {
    const set = new Set<string>()
    allDocs.forEach(d => { if (d.document_type) set.add(d.document_type) })
    return Array.from(set).sort()
  }, [allDocs])

  return (
    <div className="p-4 sm:p-8 max-w-6xl mx-auto h-full overflow-y-auto">
      {/* Breadcrumb */}
      {/* Breadcrumb — "All Documents" is a drop target when inside a folder */}
      <div className="flex items-center gap-1.5 text-sm text-muted-foreground mb-6 animate-slide-up bg-card/40 backdrop-blur-md border border-border/50 px-3 py-1.5 rounded-full inline-flex shadow-sm">
        <button
          onClick={() => setSearchParams({})}
          className={`hover:text-foreground transition-all flex items-center gap-1.5 px-2.5 py-1 rounded-full ${currentFolder && dragDocId ? (dragOverFolder === '__root__' ? 'ring-2 ring-primary bg-primary/[0.06] text-primary' : 'border border-dashed border-border') : 'hover:bg-accent/50'}`}
          onDragOver={(e) => { if (currentFolder) { e.preventDefault(); setDragOverFolder('__root__') } }}
          onDragLeave={() => setDragOverFolder(null)}
          onDrop={() => { if (currentFolder) handleDropOnFolder('__root__') }}
        >
          <Home size={14} className={currentFolder ? '' : 'text-primary'} /> 
          <span className={currentFolder ? '' : 'text-foreground font-medium'}>All Documents</span>
        </button>
        {currentCategoryName && (
          <>
            <ChevronRight size={14} className="text-muted-foreground/50" />
            <span className="text-foreground font-medium px-2.5 py-1 bg-accent/30 rounded-full">{currentCategoryName}</span>
          </>
        )}
      </div>

      {/* Analytics widgets — only at root, collapsible */}
      {!loading && !error && !currentFolder && allDocs.length > 0 && (
        <div className="mb-4 animate-slide-up" style={{ animationDelay: '100ms', animationFillMode: 'both' }}>
          <button
            onClick={() => {
              const next = !showAnalytics
              setShowAnalytics(next)
              localStorage.setItem('docvault-analytics', next ? 'shown' : 'hidden')
            }}
            className="flex items-center gap-2 text-xs font-medium text-muted-foreground hover:text-foreground transition-all mb-4 px-3 py-1.5 rounded-full border border-border/60 bg-card/60 backdrop-blur-md shadow-sm hover:shadow-md hover:border-primary/30"
          >
            <BarChart2 size={14} className="text-primary/70" />
            Analytics
            <ChevronDown size={13} className={`transition-transform duration-300 ${showAnalytics ? 'rotate-180' : ''}`} />
          </button>
          {showAnalytics && <div className="animate-scale-in"><AnalyticsWidgets docs={allDocs} categories={categories} /></div>}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-8 animate-slide-up" style={{ animationDelay: '50ms', animationFillMode: 'both' }}>
        <div>
          <h2 className="text-2xl font-semibold tracking-tight text-foreground/90">
            {currentCategoryName || 'Documents'}
          </h2>
          <p className="text-muted-foreground text-sm mt-1.5 font-medium">
            {loading ? 'Loading your files...' : currentFolder
              ? `${docsInFolder.length} document${docsInFolder.length !== 1 ? 's' : ''}`
              : `${totalDocs} document${totalDocs !== 1 ? 's' : ''} · ${categories.length} folder${categories.length !== 1 ? 's' : ''}`
            }
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" className="rounded-full shadow-sm hover:shadow-md transition-all hover:-translate-y-0.5 font-medium px-4" onClick={() => setCreatingFolder(true)}>
            <FolderPlus size={16} className="mr-2 text-primary" /> New Folder
          </Button>
          <div className="relative group">
            <div className="absolute -inset-1 bg-gradient-to-r from-primary to-purple-600 rounded-full blur opacity-40 group-hover:opacity-70 transition duration-500 group-hover:duration-200"></div>
            <Button className="relative rounded-full gradient-bg border-0 text-white shadow-lg px-6 font-medium transition-all hover:-translate-y-0.5" onClick={() => navigate('/app/upload')}>
              <Upload size={16} className="mr-2" /> Upload
            </Button>
          </div>
        </div>
      </div>

      {/* Toolbar: filter, sort, view */}
      {!loading && !error && (
        <div className="flex items-center gap-2 mb-4 animate-fade-in">

          {/* Sort dropdown */}
          <div className="relative">
            <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5" onClick={() => { setShowSortMenu(!showSortMenu); setShowFilterMenu(false); setShowViewMenu(false) }}>
              <ArrowUpDown size={13} /> Sort
              {sortKey !== 'date' && <span className="text-primary">· {sortKey}</span>}
            </Button>
            {showSortMenu && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowSortMenu(false)} />
                <div className="absolute top-full mt-1.5 left-0 z-50 w-44 bg-card/80 backdrop-blur-xl border border-border/60 rounded-xl shadow-2xl shadow-black/5 p-1 animate-scale-in">
                  {(['date', 'name', 'size', 'type'] as SortKey[]).map(key => (
                    <button key={key} onClick={() => { toggleSort(key); setShowSortMenu(false) }} className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-all ${sortKey === key ? 'bg-primary/[0.08] text-primary font-medium' : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'}`}>
                      {key.charAt(0).toUpperCase() + key.slice(1)}
                      {sortKey === key && <span className="text-xs opacity-70">{sortDir === 'asc' ? '↑' : '↓'}</span>}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Filter dropdown */}
          <div className="relative">
            <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5 rounded-full" onClick={() => { setShowFilterMenu(!showFilterMenu); setShowSortMenu(false); setShowViewMenu(false) }}>
              <Filter size={13} /> Filter
              {(fileFilter !== 'all' || typeFilter !== 'all') && <span className="text-primary">· {[fileFilter !== 'all' ? fileFilter : null, typeFilter !== 'all' ? typeFilter : null].filter(Boolean).join(', ')}</span>}
            </Button>
            {showFilterMenu && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowFilterMenu(false)} />
                <div className="absolute top-full mt-1.5 left-0 z-50 w-52 max-h-80 overflow-y-auto bg-card/80 backdrop-blur-xl border border-border/60 rounded-xl shadow-2xl shadow-black/5 p-1 animate-scale-in">
                  {([['all', 'All files'], ['pdf', 'PDFs only'], ['image', 'Images only']] as [FileFilter, string][]).map(([key, label]) => (
                    <button key={key} onClick={() => { setFileFilter(key); setShowFilterMenu(false) }} className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-all ${fileFilter === key ? 'bg-primary/[0.08] text-primary font-medium' : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'}`}>
                      {label}
                    </button>
                  ))}
                  {docTypes.length > 0 && (
                    <>
                      <div className="my-1 border-t border-border/50" />
                      <p className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">Document type</p>
                      <button onClick={() => { setTypeFilter('all'); setShowFilterMenu(false) }} className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-all ${typeFilter === 'all' ? 'bg-primary/[0.08] text-primary font-medium' : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'}`}>
                        All types
                      </button>
                      {docTypes.map(t => (
                        <button key={t} onClick={() => { setTypeFilter(t); setShowFilterMenu(false) }} className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-all ${typeFilter === t ? 'bg-primary/[0.08] text-primary font-medium' : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'}`}>
                          {t}
                        </button>
                      ))}
                    </>
                  )}
                </div>
              </>
            )}
          </div>

          {/* View dropdown */}
          <div className="relative ml-auto">
            <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5 rounded-full" onClick={() => { setShowViewMenu(!showViewMenu); setShowSortMenu(false); setShowFilterMenu(false) }}>
              {viewMode === 'grid' ? <LayoutGrid size={13} /> : <List size={13} />} View
            </Button>
            {showViewMenu && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowViewMenu(false)} />
                <div className="absolute top-full mt-1.5 right-0 z-50 w-36 bg-card/80 backdrop-blur-xl border border-border/60 rounded-xl shadow-2xl shadow-black/5 p-1 animate-scale-in">
                  <button onClick={() => { switchView('grid'); setShowViewMenu(false) }} className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all ${viewMode === 'grid' ? 'bg-primary/[0.08] text-primary font-medium' : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'}`}>
                    <LayoutGrid size={14} /> Grid
                  </button>
                  <button onClick={() => { switchView('list'); setShowViewMenu(false) }} className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all ${viewMode === 'list' ? 'bg-primary/[0.08] text-primary font-medium' : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'}`}>
                    <List size={14} /> List
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* New folder input */}
      {creatingFolder && (
        <div className="flex items-center gap-2 mb-6 animate-slide-up bg-card/50 border border-border/50 p-2 rounded-xl shadow-sm max-w-sm">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <FolderPlus size={16} className="text-primary" />
          </div>
          <Input
            autoFocus
            value={newFolderName}
            onChange={e => setNewFolderName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleCreateFolder(); if (e.key === 'Escape') setCreatingFolder(false) }}
            placeholder="Folder name..."
            className="h-9 border-0 bg-transparent focus-visible:ring-1 focus-visible:ring-primary/50 shadow-none px-2"
          />
          <Button size="sm" onClick={handleCreateFolder} disabled={!newFolderName.trim()} className="rounded-lg px-3">Create</Button>
          <Button variant="ghost" size="sm" onClick={() => setCreatingFolder(false)} className="rounded-lg px-2 text-muted-foreground">Cancel</Button>
        </div>
      )}

      {/* Error */}
      {/* Error */}
      {error && !loading && (
        <Card className="border-0 shadow-none bg-transparent animate-fade-in mt-12 max-w-lg mx-auto">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mb-6">
              <CloudOff className="h-8 w-8 text-destructive" />
            </div>
            <h3 className="text-xl font-bold text-foreground">Connection Lost</h3>
            <p className="text-sm text-muted-foreground mt-2 max-w-sm">We couldn't connect to the secure vault to retrieve your documents. Please check your connection and try again.</p>
            <Button className="mt-8 rounded-full shadow-sm hover:shadow-md transition-all hover:-translate-y-0.5 px-8" onClick={() => docsQuery.refetch()}>
              Try Again
            </Button>
          </CardContent>
        </Card>
      )}

      {/* High-Fidelity Skeletons */}
      {loading && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[...Array(6)].map((_, i) => (
            <Card key={i} className="animate-pulse bg-card/40 border-border/40 overflow-hidden">
              <CardContent className="p-5">
                <div className="flex items-start justify-between">
                  <div className="w-4 h-4 rounded bg-muted/60" />
                </div>
                <div className="w-full h-28 rounded-lg border border-border/30 bg-muted/10 flex flex-col items-center justify-center mt-1 relative overflow-hidden">
                  <div className="absolute inset-x-4 inset-y-6 doc-wireframe opacity-10" />
                </div>
                <div className="h-4 bg-muted/60 rounded mt-4 w-3/4" />
                <div className="h-3 bg-muted/40 rounded mt-2.5 w-1/2" />
                <div className="flex gap-1.5 mt-4">
                  <div className="h-5 bg-muted/50 rounded-md w-14" />
                  <div className="h-5 bg-muted/50 rounded-md w-20" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 animate-slide-up">
          <div className="flex items-center gap-4 px-6 py-3.5 rounded-full border border-primary/30 bg-background/70 backdrop-blur-2xl shadow-2xl shadow-primary/10 transition-all">
            <div className="flex items-center gap-3 border-r border-border/50 pr-4">
              <div className="w-7 h-7 rounded-full gradient-bg flex items-center justify-center text-white text-xs font-bold shadow-inner">
                {selected.size}
              </div>
              <span className="text-sm font-semibold text-foreground">selected</span>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="destructive" size="sm" className="h-8 rounded-full px-4 font-medium" onClick={handleBulkDelete}>
                <Trash2 size={14} className="mr-1.5" /> Delete
              </Button>
              <Button variant="ghost" size="sm" className="h-8 rounded-full text-muted-foreground hover:text-foreground" onClick={() => setSelected(new Set())}>
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Folders (only show at root level) */}
      {!loading && !error && !currentFolder && categories.length > 0 && (
        <>
        {viewMode === 'grid' ? (
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4 mb-6">
          {categories.map((cat, i) => {
            const count = allDocs.filter(d => d.category_id === cat.id).length
            const isDropTarget = dragOverFolder === cat.id
            return (
              <Card
                key={cat.id}
                className={`group cursor-pointer animate-slide-up transition-all duration-300 relative overflow-hidden ${isDropTarget ? 'ring-2 ring-primary bg-primary/[0.04]' : 'bg-card/40 backdrop-blur-sm border-border/60 hover:border-primary/30 hover:bg-card hover:shadow-lg hover:-translate-y-0.5'}`}
                style={{ animationDelay: `${i * 30}ms`, animationFillMode: 'both' }}
                onClick={() => { if (!editingFolder) setSearchParams({ folder: cat.id }) }}
                onDragOver={(e) => handleDragOverFolder(e, cat.id)}
                onDragLeave={() => setDragOverFolder(null)}
                onDrop={() => handleDropOnFolder(cat.id)}
              >
                {/* Glow effect */}
                <div className="absolute -inset-0.5 bg-gradient-to-r from-primary/0 via-primary/10 to-primary/0 opacity-0 group-hover:opacity-100 transition-opacity blur-xl rounded-xl" />
                
                <CardContent className="p-4 flex items-center gap-3 relative bg-transparent z-10">
                  <div className="w-10 h-10 rounded-lg bg-amber-500/10 flex items-center justify-center group-hover:bg-amber-500/15 group-hover:scale-105 transition-all">
                    <FolderOpen size={18} className="text-amber-600" />
                  </div>
                  <div className="min-w-0 flex-1">
                    {editingFolder === cat.id ? (
                      <Input
                        autoFocus
                        value={editFolderName}
                        onChange={e => setEditFolderName(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') handleRenameFolder(cat.id); if (e.key === 'Escape') setEditingFolder(null) }}
                        onBlur={() => handleRenameFolder(cat.id)}
                        onClick={e => e.stopPropagation()}
                        className="h-7 text-sm"
                      />
                    ) : (
                      <>
                        <p className="text-sm font-medium truncate">{cat.name}</p>
                        <p className="text-[11px] text-muted-foreground">{count === 0 ? 'Empty' : `${count} document${count !== 1 ? 's' : ''}`}</p>
                      </>
                    )}
                  </div>
                  <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground hover:bg-accent/50" onClick={(e) => { e.stopPropagation(); setEditingFolder(cat.id); setEditFolderName(cat.name) }} aria-label="Rename folder">
                      <Pencil size={12} />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10" onClick={(e) => handleDeleteFolder(e, cat.id)} aria-label="Delete folder">
                      <Trash2 size={12} />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )
          })}
          </div>
        ) : (
          <div className="border rounded-xl overflow-hidden mb-6">
            {categories.map((cat, i) => {
              const count = allDocs.filter(d => d.category_id === cat.id).length
              const isDropTarget = dragOverFolder === cat.id
              return (
                <div
                  key={cat.id}
                  className={`grid grid-cols-[1fr_100px_100px_120px_80px] gap-2 px-4 py-3 border-b last:border-b-0 items-center cursor-pointer hover:bg-accent/50 transition-colors group animate-slide-up ${isDropTarget ? 'ring-2 ring-primary bg-primary/[0.04]' : ''}`}
                  style={{ animationDelay: `${i * 20}ms`, animationFillMode: 'both' }}
                  onClick={() => { if (!editingFolder) setSearchParams({ folder: cat.id }) }}
                  onDragOver={(e) => handleDragOverFolder(e, cat.id)}
                  onDragLeave={() => setDragOverFolder(null)}
                  onDrop={() => handleDropOnFolder(cat.id)}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <FolderOpen size={16} className="text-amber-600 shrink-0" />
                    {editingFolder === cat.id ? (
                      <div className="relative w-48 animate-in fade-in zoom-in-95 duration-200">
                        <Input
                          autoFocus
                          value={editFolderName}
                          onChange={e => setEditFolderName(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') handleRenameFolder(cat.id); if (e.key === 'Escape') setEditingFolder(null) }}
                          onBlur={() => handleRenameFolder(cat.id)}
                          onClick={e => e.stopPropagation()}
                          className="h-8 text-sm w-full pr-6 border-primary/40 focus-visible:ring-primary/50 shadow-sm rounded-md"
                        />
                        <div className="absolute right-2 top-1/2 -translate-y-1/2 text-[9px] font-medium text-muted-foreground pointer-events-none">↵</div>
                      </div>
                    ) : (
                      <span className="text-sm font-medium truncate">{cat.name}</span>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground">Folder</span>
                  <span className="text-xs text-muted-foreground">{count} item{count !== 1 ? 's' : ''}</span>
                  <span className="text-xs text-muted-foreground">{(() => { const latest = allDocs.filter(d => d.category_id === cat.id).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0]; return latest ? new Date(latest.created_at).toLocaleString('en-IE', { day: 'numeric', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—' })()}</span>
                  <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-foreground" onClick={(e) => { e.stopPropagation(); setEditingFolder(cat.id); setEditFolderName(cat.name) }} aria-label="Rename">
                      <Pencil size={11} />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-destructive" onClick={(e) => handleDeleteFolder(e, cat.id)} aria-label="Delete">
                      <Trash2 size={11} />
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
        </>
      )}

      {/* Section label */}
      {!loading && !error && !currentFolder && docsInFolder.length > 0 && categories.length > 0 && (
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">Uncategorised</p>
      )}

      {/* Empty state */}
      {!loading && !error && docsInFolder.length === 0 && (currentFolder || categories.length === 0) && (
        <div className="relative animate-scale-in max-w-2xl mx-auto mt-12">
          {/* Animated dashed border dropzone */}
          <div className="absolute inset-0 rounded-3xl border-2 border-dashed border-primary/20 bg-primary/[0.02] -z-10 drop-zone-active" />
          
          <Card className="border-0 shadow-none bg-transparent">
            <CardContent className="flex flex-col items-center justify-center py-24 text-center">
              <div className="relative w-40 h-32 mb-8">
                {/* Center glowing circle */}
                <div className="absolute inset-0 m-auto w-24 h-24 rounded-full gradient-bg opacity-10 blur-2xl animate-pulse" />
                <div className="absolute inset-0 m-auto w-20 h-20 rounded-full bg-background border border-primary/10 shadow-xl flex items-center justify-center z-10">
                  <Upload className="h-8 w-8 text-primary" />
                </div>
                {/* Floating decorative elements */}
                <div className="absolute top-0 left-0 w-12 h-16 rounded bg-background border border-border shadow-lg rotate-[-15deg] animate-float z-0 flex flex-col gap-1 p-2">
                  <div className="w-full h-1 bg-muted rounded-full" />
                  <div className="w-3/4 h-1 bg-muted rounded-full" />
                  <div className="w-full h-1 bg-muted rounded-full" />
                </div>
                <div className="absolute bottom-2 right-2 w-10 h-10 rounded-lg bg-background border border-border shadow-lg rotate-[10deg] animate-float-delayed z-0 flex items-center justify-center">
                  <span className="text-primary font-bold text-xs">PDF</span>
                </div>
              </div>
              
              <h3 className="font-bold text-2xl tracking-tight text-foreground">
                {currentFolder ? 'This folder is empty' : 'Drop documents here'}
              </h3>
              <p className="mt-3 text-base text-muted-foreground max-w-md mx-auto leading-relaxed">
                {currentFolder
                  ? 'Drag and drop documents here from the main view, or upload new files directly into this folder.'
                  : 'Upload your first document. AI will instantly extract text, categorise it, and make it fully searchable.'
                }
              </p>
              
              <Button 
                size="lg" 
                className="mt-8 rounded-full gradient-bg border-0 text-white shadow-lg shadow-primary/20 hover:shadow-xl hover:shadow-primary/30 transition-all duration-300 hover:-translate-y-1 px-8" 
                onClick={() => navigate('/app/upload')}
              >
                Upload your first file
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Document grid/list */}
      {!loading && !error && docsInFolder.length > 0 && viewMode === 'grid' && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {docsInFolder.map((doc, i) => {
            const isSelected = selected.has(doc.id)
            return (
              <Card
                key={doc.id}
                className={`group cursor-pointer animate-slide-up transition-all duration-300 relative overflow-hidden ${isSelected ? 'ring-2 ring-primary bg-primary/[0.02]' : 'bg-card hover:bg-card hover:shadow-lg hover:-translate-y-0.5 border-border/60 hover:border-primary/30'}`}
                style={{ animationDelay: `${Math.min(i * 40, 300)}ms`, animationFillMode: 'both' }}
                onClick={() => navigate(`/app/documents/${doc.id}`)}
                draggable
                onDragStart={() => handleDragStart(doc.id)}
                onDragEnd={() => { setDragDocId(null); setDragOverFolder(null) }}
              >
                {/* Glow effect */}
                <div className="absolute -inset-0.5 bg-gradient-to-br from-primary/0 via-primary/5 to-primary/0 opacity-0 group-hover:opacity-100 transition-opacity blur-xl rounded-xl z-0" />
                
                <CardContent className="p-5 relative z-10 bg-transparent">
                  <div className="flex items-start justify-between">
                    <button onClick={(e) => toggleSelect(e, doc.id)} className="text-muted-foreground hover:text-primary transition-colors" aria-label="Select">
                      {isSelected ? <CheckSquare size={18} className="text-primary" /> : <Square size={18} className="opacity-0 group-hover:opacity-100 transition-opacity" />}
                    </button>
                    <div className={`flex items-center gap-1 transition-all ${doc.is_favourite ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                      <button onClick={(e) => handleToggleFavourite(e, doc.id)} className={`p-1.5 rounded-md transition-colors ${doc.is_favourite ? 'text-amber-500 opacity-100' : 'text-muted-foreground hover:text-amber-500 hover:bg-amber-500/10'}`} aria-label="Favourite">
                        <Star size={14} fill={doc.is_favourite ? 'currentColor' : 'none'} />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); setPreviewDoc(doc) }}
                        className="p-1.5 rounded-md text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                        aria-label="Quick preview"
                      >
                        <Eye size={14} />
                      </button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10" onClick={(e) => handleDelete(e, doc.id)} aria-label="Delete document">
                        <Trash2 size={13} />
                      </Button>
                    </div>
                  </div>
                  {doc.image_url && !doc.title.toLowerCase().endsWith('.pdf') ? (
                    <div className="w-full h-28 rounded-lg bg-muted/50 overflow-hidden mt-1 shadow-sm border border-border/50">
                      <img src={doc.image_url} alt="" className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" loading="lazy" />
                    </div>
                  ) : (
                    <div className="w-full h-28 rounded-lg border border-border/60 bg-muted/20 flex flex-col items-center justify-center mt-1 relative overflow-hidden group-hover:border-primary/20 transition-colors">
                      <div className="absolute inset-x-4 inset-y-6 doc-wireframe opacity-30 group-hover:opacity-60 transition-opacity" />
                      <div className="w-10 h-10 rounded-lg bg-background shadow-sm border border-border/50 flex items-center justify-center z-10 group-hover:scale-110 transition-transform duration-300">
                        <FileText size={18} className="text-primary/70" />
                      </div>
                    </div>
                  )}
                  {renamingDoc === doc.id ? (
                    <div className="relative mt-3 animate-in fade-in zoom-in-95 duration-200">
                      <Input
                        autoFocus
                        value={renameValue}
                        onChange={e => setRenameValue(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') handleRenameDoc(doc.id); if (e.key === 'Escape') setRenamingDoc(null) }}
                        onBlur={() => handleRenameDoc(doc.id)}
                        onClick={e => e.stopPropagation()}
                        className="h-8 text-sm w-full pr-6 border-primary/40 focus-visible:ring-primary/50 shadow-sm rounded-md"
                      />
                      <div className="absolute right-2 top-1/2 -translate-y-1/2 text-[9px] font-medium text-muted-foreground pointer-events-none">↵</div>
                    </div>
                  ) : (
                    <h3
                      className="font-medium text-sm mt-3.5 leading-snug line-clamp-2"
                      title={doc.raw_text ? doc.raw_text.slice(0, 200) + '...' : undefined}
                      onDoubleClick={(e) => { e.stopPropagation(); setRenamingDoc(doc.id); setRenameValue(doc.title) }}
                    >{doc.title}</h3>
                  )}
                  {doc.summary && (
                    <p className="text-[11px] text-muted-foreground mt-1.5 line-clamp-2 leading-relaxed">{doc.summary}</p>
                  )}
                  <div className="flex flex-wrap gap-1.5 mt-3">
                    {doc.processing_status && doc.processing_status !== 'complete' && (
                      doc.processing_status === 'failed'
                        ? <Badge variant="secondary"><span className="text-destructive">Failed</span></Badge>
                        : <Badge variant="secondary"><Loader2 size={11} className="mr-1 animate-spin" /> Processing</Badge>
                    )}
                    {doc.brand && <Badge>{doc.brand}</Badge>}
                    {doc.document_type && <Badge variant="secondary">{doc.document_type}</Badge>}
                  </div>
                  <p className="text-[11px] text-muted-foreground/70 mt-3">
                    {new Date(doc.created_at).toLocaleDateString('en-IE', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </p>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* List/table view */}
      {!loading && !error && docsInFolder.length > 0 && viewMode === 'list' && (
        <div className="border rounded-xl overflow-hidden animate-fade-in">
          {/* Table header */}
          <div className="grid grid-cols-[1fr_100px_100px_120px_80px_100px] gap-2 px-4 py-3 bg-muted/50 border-b text-xs font-medium text-muted-foreground uppercase tracking-wider">
            <span>Name</span>
            <span>Type</span>
            <span>Brand</span>
            <span>Date</span>
            <span>Size</span>
            <span className="text-right">Actions</span>
          </div>
          {/* Rows */}
          {docsInFolder.map((doc, i) => {
            const isSelected = selected.has(doc.id)
            return (
              <div
                key={doc.id}
                className={`grid grid-cols-[1fr_100px_100px_120px_80px_100px] gap-2 px-4 py-3 border-b last:border-b-0 items-center cursor-pointer hover:bg-accent/50 transition-colors group animate-slide-up relative ${isSelected ? 'bg-primary/[0.04]' : ''}`}
                style={{ animationDelay: `${Math.min(i * 20, 200)}ms`, animationFillMode: 'both' }}
                onClick={() => navigate(`/app/documents/${doc.id}`)}
                draggable
                onDragStart={() => handleDragStart(doc.id)}
                onDragEnd={() => { setDragDocId(null); setDragOverFolder(null) }}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <button onClick={(e) => toggleSelect(e, doc.id)} className="text-muted-foreground hover:text-primary transition-colors shrink-0" aria-label="Select">
                    {isSelected ? <CheckSquare size={16} className="text-primary" /> : <Square size={16} className="opacity-0 group-hover:opacity-100 transition-opacity" />}
                  </button>
                  <FileText size={16} className="text-primary/60 shrink-0" />
                  <span className="text-sm font-medium truncate">{doc.title}</span>
                  {doc.processing_status && doc.processing_status !== 'complete' && (
                    <Loader2 size={12} className="animate-spin text-primary shrink-0" />
                  )}
                </div>
                <span className="text-xs text-muted-foreground truncate">{doc.document_type || '—'}</span>
                <span className="text-xs text-muted-foreground truncate">{doc.brand || '—'}</span>
                <span className="text-xs text-muted-foreground">{new Date(doc.created_at).toLocaleString('en-IE', { day: 'numeric', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                <span className="text-xs text-muted-foreground">{doc.file_size ? `${(doc.file_size / 1024).toFixed(0)} KB` : '—'}</span>
                
                <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={(e) => handleToggleFavourite(e, doc.id)} className={`p-1.5 rounded-md transition-colors ${doc.is_favourite ? 'text-amber-500 opacity-100' : 'text-muted-foreground hover:text-amber-500 hover:bg-amber-500/10'}`} aria-label="Favourite">
                    <Star size={14} fill={doc.is_favourite ? 'currentColor' : 'none'} />
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); setPreviewDoc(doc) }} className="p-1.5 rounded-md text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors" aria-label="Preview">
                    <Eye size={14} />
                  </button>
                  <button onClick={(e) => handleDelete(e, doc.id)} className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors" aria-label="Delete">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Document preview modal */}
      {previewDoc && <DocumentPreviewModal doc={previewDoc} onClose={() => setPreviewDoc(null)} />}

    </div>
  )
}

function Badge({ children, variant = 'primary' }: { children: React.ReactNode; variant?: 'primary' | 'secondary' }) {
  const styles = variant === 'primary' ? 'bg-primary/[0.08] text-primary' : 'bg-secondary text-secondary-foreground'
  return <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-medium ${styles}`}>{children}</span>
}
