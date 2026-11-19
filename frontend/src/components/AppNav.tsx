import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Archive, ChevronsUpDown, FileSearch, FileText, MessageSquare, MoreHorizontal, Search, ShieldCheck, Upload, UserRound } from 'lucide-react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { deleteConversation, getProfile, listConversations, renameConversation, togglePinConversation, type Conversation } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { Wordmark } from './Wordmark'
import { NotificationCenter, useNotifications } from './NotificationCenter'
import { useToast } from './Toast'

const primary = [
  { label: 'Documents', path: '/app/documents', icon: FileText },
  { label: 'Ask', path: '/app/ask', icon: MessageSquare },
  { label: 'Upload', path: '/app/upload', icon: Upload },
]
const more = [
  { label: 'Search', path: '/app/search', icon: FileSearch },
  { label: 'Warranties', path: '/app/warranties', icon: ShieldCheck },
  { label: 'Search chats', path: '/app/chats', icon: Archive },
]
const menuButton = 'block w-full px-3 py-2 text-left text-sm rounded-md hover:bg-accent'

function RecentChats() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const client = useQueryClient()
  const { toast } = useToast()
  const { data = [] } = useQuery({ queryKey: ['conversations'], queryFn: listConversations })
  const recent = data.filter(c => !c.title.startsWith('[')).slice(0, 5)
  const [editing, setEditing] = useState('')
  const [name, setName] = useState('')
  const [actions, setActions] = useState('')
  useEffect(() => {
    if (pathname.startsWith('/app/ask')) void client.invalidateQueries({ queryKey: ['conversations'] })
  }, [pathname, client])

  async function change(chat: Conversation, action: 'rename' | 'pin' | 'delete') {
    try {
      if (action === 'rename') await renameConversation(chat.id, name.trim())
      else if (action === 'pin') await togglePinConversation(chat.id, !chat.is_pinned)
      else {
        await deleteConversation(chat.id)
        if (pathname === '/app/ask/' + chat.id) navigate('/app/ask')
      }
      await client.invalidateQueries({queryKey:['conversations']})
      setActions('')
      setEditing('')
    } catch { toast('Could not update the conversation.', 'error') }
  }
  return <details open className="mt-8 min-w-0">
    <summary className="text-sm font-medium text-muted-foreground">Recent chats</summary>
    <div className="mt-2">
      {recent.map(chat => <div key={chat.id} className="relative">
        {editing === chat.id ? <form onSubmit={e => { e.preventDefault(); if (name.trim()) void change(chat,'rename') }}>
          <input className="w-full rounded-md border border-input px-2 py-1" aria-label="Conversation title" autoFocus value={name} onChange={e => setName(e.target.value)} onKeyDown={e => {if(e.key === 'Escape') setEditing('')}} />
        </form> : <div className="flex items-center">
          <button className="min-w-0 flex-1 truncate rounded-md px-2 py-2 text-left text-sm hover:bg-accent" onClick={() => navigate('/app/ask/' + chat.id)}>{chat.is_pinned && '★ '}{chat.title || 'New conversation'}</button>
          <button aria-label={'Conversation options for ' + chat.title} aria-expanded={actions === chat.id} onClick={() => setActions(actions === chat.id ? '' : chat.id)}><MoreHorizontal size={17}/></button>
        </div>}
        {actions === chat.id && <div className="rounded-md border bg-popover p-1">
          <button className={menuButton} onClick={() => void change(chat,'pin')}>{chat.is_pinned ? 'Unpin' : 'Pin conversation'}</button>
          <button className={menuButton} onClick={() => {setEditing(chat.id); setName(chat.title); setActions('')}}>Rename</button>
          <button className={menuButton} onClick={() => void change(chat,'delete')}>Delete</button>
        </div>}
      </div>)}
      {recent.length === 0 && <p className="mt-2 text-sm text-muted-foreground">Your conversations will appear here</p>}
    </div>
  </details>
}

export function AppNav({ openSettings, openSearch }: {openSettings: () => void; openSearch: () => void}) {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const { logout } = useAuth()
  const profile = useQuery({queryKey:['profile'], queryFn: getProfile})
  const notifs = useNotifications()
  const [desktop, setDesktop] = useState(() => matchMedia('(min-width: 1024px)').matches)
  const [open, setOpen] = useState(false)
  const accountRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const media = matchMedia('(min-width: 1024px)')
    const update = () => setDesktop(media.matches)
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])
  useEffect(() => {
    if (!open) return
    const closeOutside = (e: MouseEvent) => { if (!accountRef.current?.contains(e.target as Node)) setOpen(false) }
    const escape = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); accountRef.current?.querySelector('button')?.focus() } }
    document.addEventListener('click',closeOutside)
    document.addEventListener('keydown',escape)
    return () => {document.removeEventListener('click',closeOutside); document.removeEventListener('keydown',escape)}
  }, [open])
  const go = (path: string) => { setOpen(false); navigate(path) }
  const settings = () => {setOpen(false); openSettings()}
  const accountName = profile.data?.display_name || 'Account'
  const account = <div ref={accountRef} className="relative min-w-0 flex-1">
    <button className="flex w-full items-center gap-2 rounded-md p-2 text-sm hover:bg-accent" aria-label={['Account', accountName, profile.data?.email].filter(Boolean).join(' · ')} aria-expanded={open} onClick={() => setOpen(!open)}>
      <UserRound size={18}/>{desktop && <><span className="flex-1 truncate text-left">{accountName}</span><ChevronsUpDown size={14}/></>}
    </button>
    {open && <div className={'absolute z-50 min-w-48 rounded-lg border bg-popover p-1 shadow-lg ' + (desktop ? 'bottom-full left-0 mb-2' : 'right-0 top-full mt-2')}>
      <button className={menuButton} onClick={() => go('/app/profile')}>Profile</button>
      {!desktop && more.map(item => <button key={item.path} className={menuButton} onClick={() => go(item.path)}>{item.label}</button>)}
      <button className={menuButton} onClick={settings}>Settings</button>
      <button className={menuButton} onClick={settings}>Theme</button>
      <button className={menuButton} onClick={() => { logout(); go('/') }}>Log out</button>
    </div>}
  </div>
  const navItems = (items: typeof primary, phone = false) => items.map(({label, path, icon: Icon}) => {
    const current = pathname === path || pathname.startsWith(path + '/') || (pathname === '/app' && label === 'Documents')
    return <button key={path} aria-current={current ? 'page' : undefined} onClick={() => go(path)}
      className={(phone ? 'flex flex-1 flex-col items-center justify-center gap-0.5 text-[13px]' : 'flex min-h-9 w-full items-center gap-3 rounded-md px-3 text-sm') + (current ? ' bg-accent font-semibold text-foreground' : ' text-muted-foreground hover:bg-accent hover:text-foreground')}>
      <Icon size={18} strokeWidth={1.75}/>{label}
    </button>
  })
  const brand = <button aria-label="DocVault" onClick={() => go('/app')}><Wordmark /></button>
  const bell = <NotificationCenter notifications={notifs.notifications} unreadCount={notifs.unreadCount} onMarkAllRead={notifs.markAllRead} onMarkRead={notifs.markRead} onRemove={notifs.remove}/>
  if (!desktop) return <>
    <header className="flex h-14 shrink-0 items-center justify-between border-b bg-background px-4">{brand}
      <div className="flex items-center gap-1"><button aria-label="Search commands" className="p-2" onClick={openSearch}><Search size={18}/></button>{bell}{account}</div>
    </header>
    <nav aria-label="Main navigation" className="fixed inset-x-0 bottom-0 z-30 flex h-14 border-t bg-background">{navItems(primary,true)}</nav>
  </>
  return <aside className="flex w-60 shrink-0 flex-col border-r bg-sidebar">
    <div className="px-5 py-6">{brand}</div>
    <div className="flex-1 overflow-y-auto px-3">
      <nav aria-label="Main navigation" className="space-y-1">{navItems(primary)}</nav>
      <details open className="mt-5"><summary className="mb-2 px-2 text-sm text-muted-foreground">More</summary>
        {navItems(more)}<button className={menuButton} onClick={settings}>Settings</button>
      </details>
      <RecentChats />
    </div>
    <div className="flex items-center gap-1 border-t p-3">{account}{bell}</div>
  </aside>
}
