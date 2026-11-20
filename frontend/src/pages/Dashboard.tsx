import { useTransitionNavigate } from '@/lib/useTransitionNavigate'
import { lazy, Suspense, useEffect, useState, useMemo, useRef } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Trash2, FolderOpen, FolderPlus, Upload, Pencil, Star, Search } from 'lucide-react'
import { attentionReason, DocumentStatus, statusLabel } from '@/components/DocumentStatus'
import { DocumentRowMenu } from '@/components/DocumentRowMenu'
import { FacetFilter } from '@/components/FacetFilter'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useMediaQuery } from '@/lib/useMediaQuery'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { retryDocumentProcessing, getDocument, getDocuments, searchDocuments, deleteDocument, bulkDeleteDocuments, getCategories, createCategory, renameCategory, deleteCategory, moveToCategory, toggleFavourite, renameDocument, type Document } from '@/lib/api'
import { useToast } from '@/components/Toast'
const AnalyticsWidgets = lazy(() => import('@/components/AnalyticsWidgets').then(({ AnalyticsWidgets }) => ({ default: AnalyticsWidgets })))
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
  const [viewMode, setViewMode] = useState<ViewMode>(() => (localStorage.getItem('docvault-view') as ViewMode) || 'list')
  const [fileFilter, setFileFilter] = useState<FileFilter>('all')
  const [statusFacet, setStatusFacet] = useState<Set<string>>(new Set())
  const [typeFacet, setTypeFacet] = useState<Set<string>>(new Set())
  const wide = useMediaQuery('(min-width: 768px)')
  const [previewDoc, setPreviewDoc] = useState<Document | null>(null)
  const [showAnalytics, setShowAnalytics] = useState(() => localStorage.getItem('docvault-analytics') === 'shown')
  const [searchParams, setSearchParams] = useSearchParams()
  const currentFolder = searchParams.get('folder')
  const navigate = useNavigate()
  const goTo = useTransitionNavigate()
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
  const query = (searchParams.get('q') ?? '').trim()
  const [typedQuery, setTypedQuery] = useState(query)
  const searchRef = useRef<HTMLInputElement>(null)
  const titleClick = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => () => clearTimeout(titleClick.current), [])
  const [announcement, setAnnouncement] = useState('')
  // Follow the address, but never replace what is being typed with its trimmed copy (that would drop a typed space).
  useEffect(() => { setTypedQuery(typed => typed.trim() === query ? typed : query) }, [query])
  useEffect(() => {
    const focus = (event: KeyboardEvent) => {
      if (event.key === '/' && !(event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || (event.target as HTMLElement)?.isContentEditable)) {
        event.preventDefault()
        searchRef.current?.focus()
      }
    }
    window.addEventListener('keydown', focus)
    return () => window.removeEventListener('keydown', focus)
  }, [])
  useEffect(() => {
    if (typedQuery.trim() === query) return
    const timer = setTimeout(() => setSearchParams(params => {
      if (typedQuery.trim()) params.set('q',typedQuery.trim())
      else params.delete('q')
      return params
    }, { replace: true }), 200)
    return () => clearTimeout(timer)
  }, [typedQuery, query, setSearchParams])

  const search = useQuery({queryKey:['document-search', query], queryFn:() => searchDocuments(query), enabled:!!query})
  const excerpts = useMemo(() => new Map((search.data?.results ?? []).filter(r => r.similarity === 1 || r.chunk_text.toLocaleLowerCase().includes(query.toLocaleLowerCase())).map(r => [r.document_id, r.chunk_text.replace(/<\/?b>/gi,'')])), [search.data,query])
  // Every complete document is checked: the type the categoriser gives does not say whether a bill review exists. The result is kept for 30 s and refreshed when a document's own page changes it (lib/documentStatusSync).
  const completeIds = allDocs.filter(d => d.processing_status === 'complete').map(d => d.id)
  const details = useQuery({
    queryKey:['document-list-status',completeIds],
    enabled:completeIds.length > 0,
    staleTime:30_000,
    queryFn: async ({signal}) => {
      const records: Record<string, Document> = {}
      for (let start = 0; start < completeIds.length; start += 6) {
        if (signal.aborted) break
        const batch = await Promise.all(completeIds.slice(start, start + 6).map(async id => [id, await getDocument(id)] as const))
        for (const [id,record] of batch) if (record.id) records[id] = record
      }
      return records
    },
  })
  const stateOf = (doc: Document) => details.data?.[doc.id] ?? (doc.bill_review !== undefined ? doc : undefined)
  const attention = allDocs.map(doc => ({doc,reason:attentionReason(stateOf(doc))})).filter(row => row.reason).slice(0,3)
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
        setAnnouncement(d.title + " is ready to review.")
      }
      if (prev && prev !== 'failed' && d.processing_status === 'failed') {
        setAnnouncement(d.title + ": Could not read this file")
      }
    })
    prevStatusRef.current = Object.fromEntries(docs.map(d => [d.id, d.processing_status || '']))
  }, [docsQuery.data, toast])

  async function handleDelete(id: string) {
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

  function toggleSelect(id: string) {
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
    if (!name) {
      setRenamingDoc(null)
      toast('Title cannot be blank.', 'error')
      return
    }
    try {
      await renameDocument(docId, name)
      setDocs(docs => docs.map(d => d.id === docId ? { ...d, title: name } : d))
      setRenamingDoc(null)
      toast('Document renamed')
    } catch (err) {
      setRenamingDoc(null)
      toast(err instanceof Error ? err.message : 'Could not rename the document. Try again.', 'error')
    }
  }

  async function handleToggleFavourite(docId: string) {
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
  // What the folder, the search and the file filter leave. The two facets narrow this further, and their counts come from it.
  const baseDocs = useMemo(() => {
    let docs = currentFolder
      ? allDocs.filter(d => d.category_id === currentFolder)
      : allDocs

    if (query) {
      const needle = query.toLocaleLowerCase()
      docs = docs.filter(d => d.title.toLocaleLowerCase().includes(needle) || (d.raw_text ?? '').toLocaleLowerCase().includes(needle) || excerpts.has(d.id))
    }
    // File type filter
    if (fileFilter === 'pdf') docs = docs.filter(d => d.title.toLowerCase().endsWith('.pdf'))
    else if (fileFilter === 'image') docs = docs.filter(d => !d.title.toLowerCase().endsWith('.pdf'))
    return docs
  }, [allDocs, currentFolder, fileFilter, query, excerpts])

  // The text of a document's status, as a filter value: "Confirmed · revision 2" counts as "Confirmed", and a document still being checked has none.
  const statusFacetOf = (doc: Document): string | null => {
    const label = statusLabel(doc, stateOf(doc))
    return label === 'Checking status' ? null : label.startsWith('Confirmed') ? 'Confirmed' : label
  }
  const statusCounts = new Map<string, number>()
  const typeCounts = new Map<string, number>()
  for (const d of baseDocs) {
    const status = statusFacetOf(d)
    if (status) statusCounts.set(status, (statusCounts.get(status) ?? 0) + 1)
    if (d.document_type) typeCounts.set(d.document_type, (typeCounts.get(d.document_type) ?? 0) + 1)
  }
  const statusOptions = ['Needs confirming', 'Reminder awaiting approval', 'Split out of date', 'Confirmed', 'Ready', 'Reading the text', 'Could not read this file']
    .map(value => ({ value, label: value, count: statusCounts.get(value) ?? 0 }))

  const docsInFolder = useMemo(() => {
    let docs = baseDocs
    // Within a facet the options combine with OR; the facets combine with AND.
    if (statusFacet.size) docs = docs.filter(d => { const status = statusFacetOf(d); return status !== null && statusFacet.has(status) })
    if (typeFacet.size) docs = docs.filter(d => d.document_type !== null && d.document_type !== undefined && typeFacet.has(d.document_type))

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseDocs, statusFacet, typeFacet, sortKey, sortDir, details.data])
  const totalDocs = allDocs.length

  // Distinct document types present in the collection, capitalised as the old select did, in alphabetical order.
  const typeOptions = useMemo(() => {
    const set = new Set<string>()
    allDocs.forEach(d => { if (d.document_type) set.add(d.document_type) })
    return Array.from(set).sort().map(value => ({ value, label: value.charAt(0).toUpperCase() + value.slice(1), count: typeCounts.get(value) ?? 0 }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allDocs, baseDocs])

  async function retryProcessing(id: string) {
    try {
      await retryDocumentProcessing(id)
      await docsQuery.refetch()
    } catch {toast('Could not retry processing. Try again.', 'error')}
  }

  function rowMenu(doc: Document) {
    return <DocumentRowMenu doc={doc}
      onPreview={() => setPreviewDoc(doc)}
      onRename={() => { setRenamingDoc(doc.id); setRenameValue(doc.title) }}
      onToggleFavourite={() => void handleToggleFavourite(doc.id)}
      onDelete={() => void handleDelete(doc.id)} />
  }

  function titleBlock(doc: Document, stacked: boolean) {
    return <div className="min-w-0 flex-1">
      {renamingDoc === doc.id ? <form onSubmit={e => {e.preventDefault();void handleRenameDoc(doc.id)}}><Input id={'rename-' + doc.id} aria-label="Document title" autoFocus value={renameValue} onChange={e => setRenameValue(e.target.value)} onKeyDown={e => {if(e.key === 'Escape')setRenamingDoc(null)}}/></form> :
        <Link to={'/app/documents/' + doc.id} className={'font-medium hover:underline ' + (stacked ? 'flex min-h-11 min-w-0 items-center' : 'block truncate')} title={doc.title} onClick={e => {if (viewMode === 'grid' && e.detail > 0 && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
          e.preventDefault()
          clearTimeout(titleClick.current)
          if (e.detail === 1) titleClick.current = setTimeout(() => goTo('/app/documents/' + doc.id), 300)
        }}} onDoubleClick={e => {if(viewMode === 'grid'){e.preventDefault();clearTimeout(titleClick.current);setRenamingDoc(doc.id);setRenameValue(doc.title)}}}><span className={stacked ? 'truncate' : undefined}><Highlight text={doc.title} query={query}/></span></Link>}
      {query && excerpts.get(doc.id) && <p className="truncate text-sm text-muted-foreground"><Highlight text={excerpts.get(doc.id)!} query={query}/></p>}
    </div>
  }

  const retryButton = (doc: Document) => doc.processing_status === 'failed' && <button className="text-sm underline" onClick={() => void retryProcessing(doc.id)}>Try again</button>
  const dateOf = (doc: Document) => new Date(doc.created_at).toLocaleDateString('en-IE',{day:'numeric',month:'short',year:'numeric'})
  const rowDrag = (doc: Document) => ({ draggable: true, onDragStart: () => handleDragStart(doc.id), onDragEnd: () => {setDragDocId(null);setDragOverFolder(null)} })

  const filtered = query !== '' || statusFacet.size > 0 || typeFacet.size > 0 || fileFilter !== 'all'

  return <div className="mx-auto h-full max-w-6xl overflow-y-auto px-4 py-6 sm:px-8 sm:py-9">
    <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div><h1 className="text-3xl font-semibold tracking-tight">{currentCategoryName || 'Documents'}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{totalDocs} {totalDocs === 1 ? 'document' : 'documents'} · {categories.length} {categories.length === 1 ? 'folder' : 'folders'}</p>
      </div>
      <div className="flex items-center gap-2">
        <Button variant="outline" onClick={() => navigate('/app/ask')}>Ask</Button>
        <Button onClick={() => navigate('/app/upload')}><Upload size={16}/> Upload</Button>
      </div>
    </header>
    <p className="sr-only" aria-live="polite">{announcement}</p>
    {!loading && !error && <section className="mb-6 rounded-lg border bg-card p-4" aria-labelledby="attention-title">
      <h2 id="attention-title" className="font-semibold">Needs attention</h2>
      {attention.length ? <ul className="mt-2 divide-y">{attention.map(({doc,reason}) => <li key={doc.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
        <span><strong className="block font-medium">{doc.title}</strong><span className="text-attention">{reason}</span></span>
        <Link className="underline underline-offset-4" to={'/app/documents/' + doc.id}>{reason === 'Needs confirming' ? 'Review and confirm' : 'Open bill'}</Link>
      </li>)}</ul> : <p className="mt-1 text-sm text-muted-foreground">{details.isError ? 'Could not check document status.' : details.isFetching ? 'Checking documents…' : 'Nothing needs your attention.'}</p>}
    </section>}
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <div className="relative min-w-[min(100%,16rem)] flex-1"><Search className="absolute top-3 left-3 text-muted-foreground" size={18}/>
        <Input ref={searchRef} aria-label="Search documents" placeholder="Search by name or by what's on the page" className="pl-10" value={typedQuery} onChange={e => setTypedQuery(e.target.value)}/>
      </div>
      <FacetFilter label="Status" options={statusOptions} selected={statusFacet} onChange={setStatusFacet}/>
      <FacetFilter label="Type" options={typeOptions} selected={typeFacet} onChange={setTypeFacet}/>
      <details className="relative"><summary className="rounded-md border border-input px-3 py-2 text-sm">Folders</summary><div className="absolute left-0 z-20 min-w-56 rounded-lg border bg-popover p-2 shadow-md">
        <button className="block w-full rounded-md px-2 py-2 text-left text-sm hover:bg-accent" onClick={() => setSearchParams({})} onDragOver={e => e.preventDefault()} onDrop={() => void handleDropOnFolder('__root__')}>All Documents</button>
        {categories.map(cat => <div key={cat.id} className={'flex items-center gap-1 rounded-md px-2 py-1 ' + (cat.id === dragOverFolder ? 'bg-accent' : '')} onDragOver={e => handleDragOverFolder(e,cat.id)} onDragLeave={() => setDragOverFolder(null)} onDrop={() => void handleDropOnFolder(cat.id)}>
          {editingFolder === cat.id ? <form onSubmit={e => { e.preventDefault(); void handleRenameFolder(cat.id) }}><Input aria-label="Folder name" autoFocus value={editFolderName} onChange={e => setEditFolderName(e.target.value)}/></form> : <>
            <button className="flex flex-1 items-center gap-2 text-left text-sm" onClick={() => setSearchParams({folder:cat.id})}><FolderOpen size={15}/>{cat.name}</button>
            <button aria-label={'Rename folder ' + cat.name} onClick={() => { setEditingFolder(cat.id); setEditFolderName(cat.name) }}><Pencil size={14}/></button>
            <button aria-label={'Delete folder ' + cat.name} onClick={e => void handleDeleteFolder(e,cat.id)}><Trash2 size={14}/></button>
          </>}
        </div>)}
        <button className="mt-1 flex items-center gap-2 px-2 py-2 text-sm" onClick={() => setCreatingFolder(true)}><FolderPlus size={15}/>New Folder</button>
      </div></details>
      <details className="relative"><summary className="rounded-md border border-input px-3 py-2 text-sm">List options</summary><div className="absolute z-20 flex flex-col gap-2 rounded-md border bg-popover p-3 text-sm shadow-md">
        <label>Sort by <select value={sortKey} onChange={e => toggleSort(e.target.value as SortKey)}>{['date','name','size','type'].map(k => <option key={k}>{k}</option>)}</select></label>
        <button onClick={() => setSortDir(sortDir === 'asc' ? 'desc' : 'asc')}>{sortDir === 'asc' ? 'Ascending' : 'Descending'}</button>
        <label>File type <select value={fileFilter} onChange={e => setFileFilter(e.target.value as FileFilter)}><option value="all">All files</option><option value="pdf">PDF</option><option value="image">Image</option></select></label>
        <label>View <select value={viewMode} onChange={e => switchView(e.target.value as ViewMode)}><option value="list">List</option><option value="grid">Grid</option></select></label>
      </div></details>
      {currentFolder && <Button size="sm" variant="ghost" onClick={() => setSearchParams({})}>All Documents</Button>}
      {selected.size > 0 && <><span className="text-sm">{selected.size} selected</span><Button size="sm" variant="destructive" onClick={handleBulkDelete}>Delete selected</Button><Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>Clear selection</Button></>}
    </div>
    {creatingFolder && <form className="my-3 flex gap-2" onSubmit={e => {e.preventDefault(); void handleCreateFolder()}}>
      <Input aria-label="Folder name" placeholder="Folder name..." value={newFolderName} onChange={e => setNewFolderName(e.target.value)} autoFocus/>
      <Button disabled={!newFolderName.trim()}>Create</Button><Button type="button" variant="ghost" onClick={() => setCreatingFolder(false)}>Cancel</Button>
    </form>}
    {loading && <p role="status">Loading your files...</p>}
    {error && <div role="alert"><p>Could not load your documents. Check that DocVault is running, then try again.</p><Button variant="outline" onClick={() => docsQuery.refetch()}>Try again</Button></div>}
    {query && docsInFolder.length > 0 && <p className="mb-3 text-sm text-muted-foreground">{docsInFolder.length} {docsInFolder.length === 1 ? 'document matches' : 'documents match'} "{query}"</p>}
    {!loading && !error && !docsInFolder.length && <div className="rounded-lg border border-dashed p-6">
      {filtered ? <><p>No documents match {query ? '"' + query + '"' : 'your filters'}. Check the spelling, or search the words printed on the page.</p><Button variant="outline" className="mt-3" onClick={() => {setTypedQuery('');setStatusFacet(new Set());setTypeFacet(new Set());setFileFilter('all')}}>Clear search</Button></>
      : <><p>{currentFolder ? 'This folder is empty' : 'Your bills, receipts and manuals will appear here.'}</p><Button className="mt-3" onClick={() => navigate('/app/upload')}>Upload a bill</Button></>}
    </div>}
    {viewMode === 'list' && wide ? (docsInFolder.length > 0 && <Table>
      <TableHeader><TableRow>
        <TableHead className="w-10"><span className="sr-only">Select</span></TableHead>
        <TableHead>Document</TableHead><TableHead>Type</TableHead><TableHead>Added</TableHead><TableHead>Status</TableHead>
        <TableHead className="w-12"><span className="sr-only">Actions</span></TableHead>
      </TableRow></TableHeader>
      <TableBody>{docsInFolder.map(doc => <TableRow key={doc.id} {...rowDrag(doc)} className="transition-colors duration-150 hover:bg-accent/50">
        <TableCell><input type="checkbox" aria-label={'Select ' + doc.title} checked={selected.has(doc.id)} onChange={() => toggleSelect(doc.id)} /></TableCell>
        <TableCell className="max-w-0 w-full"><div className="flex min-w-0 items-center gap-2">
          {doc.is_favourite && <><Star size={14} className="shrink-0 fill-current text-muted-foreground" aria-hidden="true"/><span className="sr-only">Starred</span></>}
          {titleBlock(doc, false)}
        </div></TableCell>
        <TableCell className="whitespace-nowrap text-muted-foreground">{doc.document_type}</TableCell>
        <TableCell className="whitespace-nowrap text-muted-foreground"><time dateTime={doc.created_at}>{dateOf(doc)}</time></TableCell>
        <TableCell><div className="flex flex-wrap items-center gap-2"><DocumentStatus doc={doc} detail={stateOf(doc)}/>{retryButton(doc)}</div></TableCell>
        <TableCell className="text-right">{rowMenu(doc)}</TableCell>
      </TableRow>)}</TableBody>
    </Table>) : <ul className={viewMode === 'grid' ? 'grid gap-3 sm:grid-cols-2 xl:grid-cols-3' : 'divide-y border-y'}>
      {docsInFolder.map(doc => <li key={doc.id} {...rowDrag(doc)}
        className={(viewMode === 'grid' ? 'rounded-lg border bg-card p-4' : 'px-2 py-1') + ' flex min-h-11 items-start gap-2 transition-colors duration-150 hover:bg-accent/50'}>
        <input type="checkbox" className="mt-3.5" aria-label={'Select ' + doc.title} checked={selected.has(doc.id)} onChange={() => toggleSelect(doc.id)} />
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            {doc.is_favourite && <><Star size={14} className="shrink-0 fill-current text-muted-foreground" aria-hidden="true"/><span className="sr-only">Starred</span></>}
            {titleBlock(doc, true)}
          </div>
          <p className="text-[13px] text-muted-foreground">{doc.document_type && <><span>{doc.document_type}</span> · </>}<time dateTime={doc.created_at}>{dateOf(doc)}</time></p>
          <div className="mb-1 mt-1 flex flex-wrap items-center gap-2"><DocumentStatus doc={doc} detail={stateOf(doc)}/>{retryButton(doc)}</div>
        </div>
        {rowMenu(doc)}
      </li>)}
    </ul>}
    {!loading && !error && !currentFolder && totalDocs > 0 && <div className="mt-6">
      <button className="rounded-md px-2 py-2 text-sm text-muted-foreground underline underline-offset-4" aria-expanded={showAnalytics} onClick={() => {const next=!showAnalytics;setShowAnalytics(next);localStorage.setItem('docvault-analytics',next?'shown':'hidden')}}>Storage and activity</button>
      {showAnalytics && <Suspense fallback={<p role="status">Loading activity…</p>}><AnalyticsWidgets docs={allDocs} categories={categories}/></Suspense>}
    </div>}
    {previewDoc && <DocumentPreviewModal doc={previewDoc} onClose={() => setPreviewDoc(null)} />}
  </div>
}

function Highlight({text,query}:{text:string;query:string}) {
  const start = query ? text.toLocaleLowerCase().indexOf(query.toLocaleLowerCase()) : -1
  if (start < 0) return <>{text}</>
  return <>{text.slice(0,start)}<mark className="bg-mark text-mark-text">{text.slice(start,start+query.length)}</mark>{text.slice(start+query.length)}</>
}
