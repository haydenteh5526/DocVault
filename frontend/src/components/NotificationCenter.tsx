import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell, CheckCircle, X, FileText, Upload, ShieldAlert } from 'lucide-react'
import { getDocuments, getExpiringWarranties } from '@/lib/api'
import { relativeTime } from '@/lib/format'

export interface AppNotification {
  id: string
  type: 'upload' | 'processing' | 'warranty' | 'system'
  title: string
  body: string
  timestamp: Date
  read: boolean
  actionUrl?: string
}

const STORAGE_KEY = 'docvault-notifications'

function loadFromStorage(): AppNotification[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    return JSON.parse(raw).map((n: AppNotification) => ({ ...n, timestamp: new Date(n.timestamp) }))
  } catch { return [] }
}

function saveToStorage(notifications: AppNotification[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(notifications))
}

/** Hook for consuming notifications across the app */
export function useNotifications() {
  const [notifications, setNotifications] = useState<AppNotification[]>(loadFromStorage)
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const knownCompleteRef = useRef<Set<string>>(new Set())

  const add = useCallback((n: Omit<AppNotification, 'id' | 'timestamp' | 'read'>) => {
    setNotifications(prev => {
      // Deduplicate by title + body
      if (prev.some(p => p.title === n.title && p.body === n.body)) return prev
      const next = [{ ...n, id: Math.random().toString(36).slice(2), timestamp: new Date(), read: false }, ...prev].slice(0, 20)
      saveToStorage(next)
      return next
    })
  }, [])

  const markAllRead = useCallback(() => {
    setNotifications(prev => {
      const next = prev.map(n => ({ ...n, read: true }))
      saveToStorage(next)
      return next
    })
  }, [])

  const markRead = useCallback((id: string) => {
    setNotifications(prev => {
      const next = prev.map(n => (n.id === id ? { ...n, read: true } : n))
      saveToStorage(next)
      return next
    })
  }, [])

  const remove = useCallback((id: string) => {
    setNotifications(prev => {
      const next = prev.filter(n => n.id !== id)
      saveToStorage(next)
      return next
    })
  }, [])

  // Poll for recently completed documents and notify
  useEffect(() => {
    // Initialize known complete docs on first load
    getDocuments().then(data => {
      const docs = data.documents || data
      docs.forEach((d) => {
        if (d.processing_status === 'complete') {
          knownCompleteRef.current.add(d.id)
        }
      })
    }).catch(() => {})

    // Check for expiring warranties once per session
    const warrantyChecked = sessionStorage.getItem('docvault-warranty-checked')
    if (!warrantyChecked) {
      sessionStorage.setItem('docvault-warranty-checked', '1')
      getExpiringWarranties(30).then(items => {
        items.forEach(w => {
          add({
            type: 'warranty',
            title: 'Warranty expiring soon',
            body: `${w.document_title} expires in ${w.days_remaining} day${w.days_remaining !== 1 ? 's' : ''}`,
            actionUrl: '/app/warranties',
          })
        })
      }).catch(() => {})
    }

    pollingRef.current = setInterval(async () => {
      try {
        const data = await getDocuments()
        const docs = data.documents || data
        docs.forEach((d) => {
          if (d.processing_status === 'complete' && !knownCompleteRef.current.has(d.id)) {
            knownCompleteRef.current.add(d.id)
            add({
              type: 'processing',
              title: 'Document ready',
              body: `"${d.title}" has been processed — text extracted and indexed.`,
              actionUrl: `/app/documents/${d.id}`,
            })
          }
        })
      } catch { /* ignore */ }
    }, 10000) // Poll every 10s

    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current)
    }
  }, [add])

  const unreadCount = notifications.filter(n => !n.read).length

  return { notifications, unreadCount, add, markAllRead, markRead, remove }
}

interface Props {
  notifications: AppNotification[]
  unreadCount: number
  onMarkAllRead: () => void
  onMarkRead: (id: string) => void
  onRemove: (id: string) => void
}

export function NotificationCenter({ notifications, unreadCount, onMarkAllRead, onMarkRead, onRemove }: Props) {
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()

  function handleItemClick(n: AppNotification) {
    if (!n.read) onMarkRead(n.id)
    if (n.actionUrl) {
      navigate(n.actionUrl)
      setOpen(false)
    }
  }

  // Close on any click anywhere (OS-style). Deferred by a tick so the opening
  // click itself doesn't immediately re-close it. Clicks inside the panel call
  // stopPropagation, so they never reach this listener.
  useEffect(() => {
    if (!open) return
    function onClick() { setOpen(false) }
    const timer = setTimeout(() => document.addEventListener('click', onClick), 0)
    return () => { clearTimeout(timer); document.removeEventListener('click', onClick) }
  }, [open])

  function getIcon(type: AppNotification['type']) {
    if (type === 'upload') return <Upload size={14} className="text-primary" />
    if (type === 'processing') return <CheckCircle size={14} className="text-green-500" />
    if (type === 'warranty') return <ShieldAlert size={14} className="text-amber-500" />
    return <FileText size={14} className="text-primary" />
  }

  function formatTime(date: Date) {
    return relativeTime(date)
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="relative p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
        aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}
      >
        <Bell size={18} />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 w-4 h-4 rounded-full gradient-bg text-white text-[9px] font-bold flex items-center justify-center animate-scale-in">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <>
          {/* Dropdown — fixed to the bottom-left so the sidebar can't clip it.
              The bell lives in the bottom-left corner, so the panel floats just
              above the profile row and stays fully on-screen (incl. mobile).
              Clicks inside are stopped so the global close listener ignores them. */}
          <div
            onClick={(e) => e.stopPropagation()}
            className="fixed bottom-16 left-3 z-50 w-80 max-w-[calc(100vw-1.5rem)] bg-card border border-border/50 rounded-xl shadow-2xl shadow-black/20 animate-scale-in overflow-hidden"
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-border/40">
              <p className="text-sm font-semibold">Notifications</p>
              {notifications.length > 0 && (
                <button
                  onClick={() => { onMarkAllRead(); setOpen(false) }}
                  className="text-[11px] text-primary hover:underline"
                >
                  Mark all read
                </button>
              )}
            </div>

            <div className="max-h-80 overflow-auto">
              {notifications.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-center px-4">
                  <Bell size={24} className="text-muted-foreground/30 mb-2" />
                  <p className="text-sm font-medium text-foreground/70">All caught up!</p>
                  <p className="text-xs text-muted-foreground mt-1">You'll be notified when documents finish processing.</p>
                </div>
              ) : (
                notifications.map(n => (
                  <div
                    key={n.id}
                    onClick={() => handleItemClick(n)}
                    className={`flex items-start gap-3 px-4 py-3 border-b border-border/30 last:border-0 transition-colors hover:bg-accent/30 ${!n.read ? 'bg-primary/[0.02]' : ''} ${n.actionUrl ? 'cursor-pointer' : ''}`}
                  >
                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${n.type === 'warranty' ? 'bg-amber-500/10' : n.type === 'processing' ? 'bg-green-50 dark:bg-green-950/30' : 'bg-primary/[0.07]'}`}>
                      {getIcon(n.type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        {!n.read && <span className="w-1.5 h-1.5 rounded-full gradient-bg shrink-0" aria-label="unread" />}
                        <p className="text-[12px] font-medium truncate">{n.title}</p>
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">{n.body}</p>
                      <p className="text-[10px] text-muted-foreground/50 mt-1">{formatTime(n.timestamp)}</p>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); onRemove(n.id) }}
                      className="p-0.5 rounded text-muted-foreground/40 hover:text-muted-foreground transition-colors shrink-0"
                      aria-label="Dismiss"
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
