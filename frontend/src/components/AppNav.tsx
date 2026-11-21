import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { ChevronsUpDown, FileSearch, FileText, MessageSquare, Search, ShieldCheck, Upload, UserRound } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { useTransitionNavigate } from '@/lib/useTransitionNavigate'
import { getProfile } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { ASSISTANT_NAME } from '@/lib/assistant'
import { useDocBotActivity } from '@/lib/useDocBotActivity'
import { DocBotMark } from './DocBotMark'
import { Wordmark } from './Wordmark'
import { NotificationCenter, useNotifications } from './NotificationCenter'

const primary = [
  { label: 'Ask', path: '/app', icon: MessageSquare },
  { label: 'Documents', path: '/app/documents', icon: FileText },
  { label: 'Upload', path: '/app/upload', icon: Upload },
]
const more = [
  { label: 'Search', path: '/app/search', icon: FileSearch },
  { label: 'Warranties', path: '/app/warranties', icon: ShieldCheck },
]
const menuButton = 'block w-full px-3 py-2 text-left text-sm rounded-md hover:bg-accent'

export function AppNav({ openSettings, openSearch }: {openSettings: () => void; openSearch: () => void}) {
  const goTo = useTransitionNavigate()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const { logout } = useAuth()
  const profile = useQuery({queryKey:['profile'], queryFn: getProfile})
  // Observe cached activity here. Only the thread or Documents should request bill details.
  const activity = useDocBotActivity(false)
  const notifs = useNotifications()
  const [desktop, setDesktop] = useState(() => matchMedia('(min-width: 1024px)').matches)
  // The account menu belongs to the page it was opened on, so any change of page closes it.
  const [openFor, setOpenFor] = useState<string | null>(null)
  // A change of page closes the menu for good, so history returning to this page does not bring it back.
  if (openFor !== null && openFor !== pathname) setOpenFor(null)
  const open = openFor === pathname
  const setOpen = (value: boolean) => setOpenFor(value ? pathname : null)
  const accountRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const media = matchMedia('(min-width: 1024px)')
    const update = () => setDesktop(media.matches)
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])
  useEffect(() => {
    if (!open) return
    const closeOutside = (e: MouseEvent) => { if (!accountRef.current?.contains(e.target as Node)) setOpenFor(null) }
    const escape = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpenFor(null); accountRef.current?.querySelector('button')?.focus() } }
    document.addEventListener('click',closeOutside)
    document.addEventListener('keydown',escape)
    return () => {document.removeEventListener('click',closeOutside); document.removeEventListener('keydown',escape)}
  }, [open])
  const go = (path: string) => { setOpen(false); goTo(path) }
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
      <button className={menuButton} onClick={() => { logout(); setOpen(false); navigate('/') }}>Log out</button>
    </div>}
  </div>
  const navItems = (items: typeof primary, phone = false) => items.map(({label, path, icon: Icon}) => {
    const current = isCurrent(label, path)
    return <button key={path} aria-label={label === 'Ask' ? 'Ask '+ASSISTANT_NAME : label} aria-description={label === 'Ask' ? activity.status : undefined} aria-current={current ? 'page' : undefined} onClick={() => go(path)}
      className={(phone ? 'flex flex-1 flex-col items-center justify-center gap-0.5 text-[13px]' : 'flex min-h-9 w-full items-center gap-3 rounded-md px-3 text-sm') + (current ? ' bg-accent font-semibold text-foreground' : ' text-muted-foreground hover:bg-accent hover:text-foreground')}>
      {label === 'Ask' ? <DocBotMark size={phone ? 20 : 22} state={activity.pending.length ? 'needs-approval' : 'idle'}/> : <Icon size={18} strokeWidth={1.75}/>}
      {label === 'Ask' ? <span className="text-left">{ASSISTANT_NAME}{!phone && <small className="block font-normal text-muted-foreground">{activity.status}</small>}</span> : label}
    </button>
  })
  const isCurrent = (label: string, path: string) => label === 'Ask'
    ? pathname === '/app' || pathname === '/app/ask' || pathname.startsWith('/app/ask/')
    : pathname === path || pathname.startsWith(path + '/')
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
      <nav aria-label="Main navigation" className="relative space-y-1">
        {navItems(primary)}
      </nav>
      <div className="mt-5"><p className="mb-2 px-2 text-sm text-muted-foreground">More</p>
        {navItems(more)}
      </div>
    </div>
    <div className="flex items-center gap-1 border-t p-3">{account}{bell}</div>
  </aside>
}
