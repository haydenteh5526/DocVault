import { useTransitionNavigate } from '@/lib/useTransitionNavigate'
import { useRef, useState } from 'react'
import { ArrowRight, Camera, CheckCircle, FileText, Upload as UploadIcon, X } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { uploadDocument } from '@/lib/api'
import { useToast } from '@/components/Toast'

interface UploadItem {
  id: string
  file: File
  status: 'pending' | 'uploading' | 'done' | 'error'
  docId?: string
}

export default function UploadPage() {
  const [dragging, setDragging] = useState(false)
  const [queue, setQueue] = useState<UploadItem[]>([])
  const [busy, setBusy] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)
  const cameraInput = useRef<HTMLInputElement>(null)
  const uploading = useRef(false)
  const goTo = useTransitionNavigate()
  const client = useQueryClient()
  const { toast } = useToast()
  const pending = queue.filter(item => item.status === 'pending')
  const completed = queue.filter(item => item.status === 'done')
  const finished = completed.length > 0 && completed.length === queue.length

  function choose(files: FileList | null) {
    const items = Array.from(files ?? []).filter(f => f.type.startsWith('image/') || f.type === 'application/pdf' || /\.pdf$/i.test(f.name))
      .map(file => ({file, id:crypto.randomUUID(), status:'pending' as const}))
    if (!items.length) { toast('Only images and PDFs are supported', 'error'); return }
    setQueue(prev => [...prev,...items])
  }

  async function send(items: UploadItem[]) {
    if (uploading.current || !items.length) return
    uploading.current = true
    setBusy(true)
    try {
      for (const item of items) {
        setQueue(prev => prev.map(row => row.id === item.id ? {...row,status:'uploading'} : row))
        try {
          const doc = await uploadDocument(item.file)
          setQueue(prev => prev.map(row => row.id === item.id ? {...row,status:'done',docId:doc.id} : row))
          await client.invalidateQueries({queryKey:['documents']})
        } catch {
          setQueue(prev => prev.map(row => row.id === item.id ? {...row,status:'error'} : row))
        }
      }
    } finally { uploading.current = false; setBusy(false) }
  }

  return <div className="mx-auto h-full max-w-3xl overflow-y-auto px-4 py-6 sm:px-8 sm:py-9">
    <h1 className="text-3xl font-semibold tracking-tight">Upload Documents</h1>
    <p className="mt-2 text-sm text-muted-foreground">Drag multiple files or choose from your device</p>
    {!finished && <section className={'mt-6 rounded-lg border-2 border-dashed px-4 py-10 text-center ' + (dragging ? 'border-primary bg-muted' : 'border-input')}
      onDragOver={e => {e.preventDefault();setDragging(true)}} onDragLeave={() => setDragging(false)}
      onDrop={e => {e.preventDefault();setDragging(false);choose(e.dataTransfer.files)}}>
      <UploadIcon size={28} className="mx-auto mb-3"/>
      <h2 className="text-xl font-semibold">{dragging ? 'Release to upload' : 'Drop your documents here'}</h2>
      <p className="mt-1 text-sm text-muted-foreground">PDF, JPEG, PNG or WebP</p>
      <div className="mt-5 flex justify-center gap-2">
        <input ref={fileInput} type="file" hidden accept="image/*,.pdf" multiple onChange={e => {choose(e.target.files);e.target.value=''}}/>
        <Button variant="outline" onClick={() => fileInput.current?.click()}>Choose files</Button>
        <input ref={cameraInput} type="file" hidden accept="image/*" capture="environment" onChange={e => {choose(e.target.files);e.target.value=''}}/>
        <Button variant="outline" className="sm:hidden" onClick={() => cameraInput.current?.click()}><Camera size={16}/>Take photo</Button>
      </div>
    </section>}
    {!finished && queue.length > 0 && <section className="mt-5" aria-label="Upload queue">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><h2 className="font-semibold">Files ({queue.length})</h2>
        <div className="flex items-center gap-2">{!busy && pending.length > 0 && <><Button variant="ghost" size="sm" onClick={() => setQueue([])}>Clear all</Button>
          <Button onClick={() => void send(pending)}>{pending.length === 1 ? 'Upload' : 'Upload All (' + pending.length + ')'}</Button></>}</div></div>
      <ul className="divide-y rounded-lg border px-3">{queue.map(item => <li key={item.id} className="flex flex-wrap items-center gap-3 py-3 text-sm">
        <FileText size={17}/><span className="min-w-0 flex-1 truncate" title={item.file.name}>{item.file.name}</span>
        <span aria-live="polite">{item.status === 'uploading' ? 'Uploading' : item.status === 'error' ? 'Could not read this file' : item.status === 'done' ? 'Reading the text' : Math.ceil(item.file.size / 1024) + ' KB'}</span>
        {item.status === 'error' && <Button disabled={busy} size="sm" variant="outline" onClick={() => void send([item])}>Try again</Button>}
        {(item.status === 'pending' || item.status === 'error') && <button aria-label={'Remove ' + item.file.name} onClick={() => setQueue(prev => prev.filter(row => row.id !== item.id))}><X size={16}/></button>}
      </li>)}</ul>
    </section>}
    {finished && <section aria-label="Upload results" className="mt-6 rounded-lg border bg-card p-5 sm:p-7">
      <CheckCircle className="mb-3 text-success" size={25}/><h2 className="text-xl font-semibold">Upload Complete!</h2>
      <p className="mt-1 text-sm text-muted-foreground">{completed.length} {completed.length === 1 ? 'file' : 'files'} uploaded successfully.</p>
      <p className="mt-3 text-sm">DocVault is reading the text and indexing your documents for search.</p>
      <div className="mt-5 flex flex-wrap gap-2"><Button onClick={() => goTo('/app/documents')}>View Documents <ArrowRight size={16}/></Button>
        <Button variant="outline" onClick={() => setQueue([])}>Upload More</Button></div>
      <ul className="mt-5 divide-y border-t">{completed.map(item => <li key={item.id}><button className="flex w-full items-center justify-between gap-2 py-3 text-left text-sm" onClick={() => goTo('/app/documents/' + item.docId)}>
        <span className="truncate">{item.file.name}</span><ArrowRight size={15}/></button></li>)}</ul>
    </section>}
  </div>
}
