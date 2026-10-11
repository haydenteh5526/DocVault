import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom'
import { useState, useEffect, Suspense, lazy } from 'react'
import { FileText, Search, Settings as SettingsIcon, Layers, Plus, LogOut, ExternalLink, MoreVertical, Pin, Pencil, Trash2, Upload } from 'lucide-react'
import { AuthProvider, useAuth } from './lib/auth'
import { useFocusTrap } from './lib/useFocusTrap'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { listConversations, deleteConversation, renameConversation, togglePinConversation, getProfile, type Conversation } from './lib/api'
import { ToastProvider } from './components/Toast'
import { CommandPalette } from './components/CommandPalette'
import { OnboardingTour } from './components/OnboardingTour'
import { NotificationCenter, useNotifications } from './components/NotificationCenter'
// Route pages are code-split so the initial bundle (landing + auth) stays small;
// each page loads on demand behind the <Suspense> boundary below.
const Landing = lazy(() => import('./pages/Landing'))
const AuthPage = lazy(() => import('./pages/Auth'))
const OAuthCallback = lazy(() => import('./pages/OAuthCallback'))
const ForgotPassword = lazy(() => import('./pages/ForgotPassword'))
const ResetPassword = lazy(() => import('./pages/ResetPassword'))
const VerifyEmail = lazy(() => import('./pages/VerifyEmail'))
const Dashboard = lazy(() => import('./pages/Dashboard'))
const UploadPage = lazy(() => import('./pages/Upload'))
const SearchPage = lazy(() => import('./pages/Search'))
const SearchChats = lazy(() => import('./pages/SearchChats'))
const AskAI = lazy(() => import('./pages/AskAI'))
const DocumentDetail = lazy(() => import('./pages/DocumentDetail'))
const Warranties = lazy(() => import('./pages/Warranties'))
const Settings = lazy(() => import('./pages/Settings'))
const ProfilePage = lazy(() => import('./pages/Profile'))

/** Fallback shown while a lazily-loaded route chunk is being fetched. */
function PageLoader() {
  return (
    <div className="flex items-center justify-center h-full min-h-[40vh] w-full" role="status" aria-label="Loading">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-muted border-t-primary" />
    </div>
  )
}

function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </ToastProvider>
    </AuthProvider>
  )
}

function AppRoutes() {
  const { isAuthenticated } = useAuth()

  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route path="/" element={isAuthenticated ? <Navigate to="/app" /> : <Landing />} />
        <Route path="/login" element={isAuthenticated ? <Navigate to="/app" /> : <AuthPage mode="login" />} />
        <Route path="/register" element={isAuthenticated ? <Navigate to="/app" /> : <AuthPage mode="register" />} />
        <Route path="/verify" element={<VerifyEmail />} />
        <Route path="/auth/callback" element={<OAuthCallback />} />
        <Route path="/forgot-password" element={isAuthenticated ? <Navigate to="/app" /> : <ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/app/*" element={isAuthenticated ? <AppShell /> : <Navigate to="/login" />}>
          <Route index element={<AskAI />} />
          <Route path="documents" element={<Dashboard />} />
          <Route path="upload" element={<UploadPage />} />
          <Route path="documents/:id" element={<DocumentDetail />} />
          <Route path="warranties" element={<Warranties />} />
          <Route path="search" element={<SearchPage />} />
          <Route path="ask" element={<AskAI />} />
          <Route path="ask/:conversationId" element={<AskAI />} />
          <Route path="settings" element={<Settings />} />
        </Route>
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </Suspense>
  )
}

function AppShell() {
  const { logout, token } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settingsTab, setSettingsTab] = useState<'general' | 'account'>('general')
  const settingsTrapRef = useFocusTrap<HTMLDivElement>(settingsOpen)
  const [userName, setUserName] = useState('')
  const [userEmail, setUserEmail] = useState('')
  const [paletteOpen, setPaletteOpen] = useState(false)
  const queryClient = useQueryClient()
  const { data: conversations = [] } = useQuery({
    queryKey: ['conversations'],
    queryFn: async () => (await listConversations()).filter(c => !c.title.startsWith('[')).slice(0, 10),
  })
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const notifs = useNotifications()

  useEffect(() => {
    if (!token) return
    getProfile()
      .then(data => { setUserName(data.display_name || data.email.split('@')[0]); setUserEmail(data.email) })
      .catch(() => {})
  }, [token])

  // Refresh the sidebar conversation list when navigating into Ask AI
  // (a new conversation may have been created there).
  useEffect(() => {
    if (location.pathname.startsWith('/app/ask')) {
      queryClient.invalidateQueries({ queryKey: ['conversations'] })
    }
  }, [location.pathname, queryClient])

  // Global ⌘K → command palette
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setPaletteOpen(o => !o)
      }
      if (e.key === 'Escape') { setPaletteOpen(false); setSettingsOpen(false); setUserMenuOpen(false) }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  // Close user menu on any click outside
  useEffect(() => {
    if (!userMenuOpen) return
    function onClick() { setUserMenuOpen(false) }
    const timer = setTimeout(() => document.addEventListener('click', onClick), 0)
    return () => { clearTimeout(timer); document.removeEventListener('click', onClick) }
  }, [userMenuOpen])

  // Close conversation menu on any click outside
  useEffect(() => {
    if (!menuOpenId) return
    function onClick() { setMenuOpenId(null) }
    const timer = setTimeout(() => document.addEventListener('click', onClick), 0)
    return () => { clearTimeout(timer); document.removeEventListener('click', onClick) }
  }, [menuOpenId])

  return (
    <div className="flex h-screen bg-muted/20">
      {/* Mobile overlay */}
      {sidebarOpen && <div className="fixed inset-0 z-40 bg-black/40 lg:hidden" onClick={() => setSidebarOpen(false)} />}

      {/* Sidebar */}
      <aside className={`dark fixed lg:static inset-y-0 left-0 z-50 ${sidebarCollapsed ? 'w-0 lg:w-16 overflow-hidden' : 'w-[290px]'} flex flex-col bg-[oklch(0.12_0.005_264)] text-foreground transition-all duration-300 lg:translate-x-0 ${sidebarOpen ? 'translate-x-0 !w-[290px]' : !sidebarCollapsed ? '' : '-translate-x-full'}`}>
        {/* Top: Logo + Nav */}
        <div className={`${sidebarCollapsed ? 'px-3 pt-5 pb-2' : 'px-5 pt-5 pb-2'}`}>
          {/* Logo row */}
          <div className={`flex items-center ${sidebarCollapsed ? 'justify-center mb-6' : 'justify-between mb-6'}`}>
            {sidebarCollapsed ? (
              <button
                onClick={() => setSidebarCollapsed(false)}
                className="text-muted-foreground hover:text-foreground transition-colors"
                title="Open sidebar"
                aria-label="Open sidebar"
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="3"/><path d="M9 3v18"/></svg>
              </button>
            ) : (
              <>
                <button onClick={() => navigate('/app')} className="flex items-center gap-3 group hover:opacity-80 transition-opacity">
                  <Layers size={20} className="text-primary transition-transform duration-300 group-hover:rotate-12" />
                  <span className="text-[17px] font-semibold text-foreground">DocVault</span>
                </button>
                <button
                  onClick={() => setSidebarCollapsed(true)}
                  className="text-muted-foreground/50 hover:text-foreground transition-colors hidden lg:block"
                  title="Close sidebar"
                  aria-label="Close sidebar"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="3"/><path d="M9 3v18"/></svg>
                </button>
              </>
            )}
          </div>

          {/* Nav items */}
          <nav className="space-y-0.5">
            <button
              onClick={() => { navigate('/app/ask'); setSidebarOpen(false) }}
              className={`w-full flex items-center ${sidebarCollapsed ? 'justify-center px-0 py-2.5' : 'gap-3 py-2'} rounded-lg text-[14px] font-medium text-muted-foreground hover:text-foreground transition-all duration-200`}
              title={sidebarCollapsed ? 'New chat' : undefined}
            >
              <Plus size={18} className="shrink-0" />
              {!sidebarCollapsed && 'New chat'}
            </button>

            <button
              onClick={() => { navigate('/app/chats'); setSidebarOpen(false) }}
              className={`w-full flex items-center ${sidebarCollapsed ? 'justify-center px-0 py-2.5' : 'gap-3 py-2'} rounded-lg text-[14px] font-medium transition-all duration-200 ${
                location.pathname === '/app/chats'
                  ? 'text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              title={sidebarCollapsed ? 'Search chats' : undefined}
            >
              <Search size={18} className="shrink-0" />
              {!sidebarCollapsed && 'Search chats'}
            </button>

            <button
              onClick={() => { navigate('/app/documents'); setSidebarOpen(false) }}
              className={`w-full flex items-center ${sidebarCollapsed ? 'justify-center px-0 py-2.5' : 'gap-3 py-2'} rounded-lg text-[14px] font-medium transition-all duration-200 ${
                location.pathname.startsWith('/app/documents')
                  ? 'text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              title={sidebarCollapsed ? 'Documents' : undefined}
            >
              <FileText size={18} className="shrink-0" />
              {!sidebarCollapsed && 'Documents'}
            </button>

            <button
              onClick={() => { navigate('/app/upload'); setSidebarOpen(false) }}
              className={`w-full flex items-center ${sidebarCollapsed ? 'justify-center px-0 py-2.5' : 'gap-3 py-2'} rounded-lg text-[14px] font-medium transition-all duration-200 ${
                location.pathname === '/app/upload'
                  ? 'text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              title={sidebarCollapsed ? 'Upload' : undefined}
            >
              <Upload size={18} className="shrink-0" />
              {!sidebarCollapsed && 'Upload'}
            </button>

            {sidebarCollapsed && (
              <div className="flex-1" />
            )}
          </nav>
        </div>

        {/* Conversations list */}
        {!sidebarCollapsed && (
        <div className="flex-1 overflow-auto px-3 py-2 min-h-0 mt-1" onClick={() => { setSidebarOpen(false); setMenuOpenId(null) }}>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground px-3 mb-2">Recent chats</p>
          {conversations.map(conv => (
            <div key={conv.id} className="group relative">
              {renamingId === conv.id ? (
                <form
                  className="px-3 py-2.5"
                  onSubmit={async (e) => {
                    e.preventDefault()
                    if (renameValue.trim()) {
                      await renameConversation(conv.id, renameValue.trim())
                      queryClient.setQueryData<Conversation[]>(['conversations'], prev => (prev ?? []).map(c => c.id === conv.id ? { ...c, title: renameValue.trim() } : c))
                    }
                    setRenamingId(null)
                  }}
                >
                  <input
                    autoFocus
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onBlur={() => setRenamingId(null)}
                    onKeyDown={(e) => { if (e.key === 'Escape') setRenamingId(null) }}
                    className="w-full bg-accent/60 border border-border/60 rounded-md px-2 py-1 text-sm text-foreground outline-none focus:ring-1 focus:ring-primary/50"
                  />
                </form>
              ) : (
                <button
                  onClick={(e) => { e.stopPropagation(); navigate(`/app/ask/${conv.id}`); setSidebarOpen(false); setMenuOpenId(null) }}
                  onTouchStart={(e) => {
                    const timer = setTimeout(() => { e.preventDefault(); setMenuOpenId(conv.id) }, 500)
                    const el = e.currentTarget
                    const cancel = () => clearTimeout(timer)
                    el.addEventListener('touchend', cancel, { once: true })
                    el.addEventListener('touchmove', cancel, { once: true })
                  }}
                  className={`w-full flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm text-left transition-all duration-200 ${
                    location.pathname === `/app/ask/${conv.id}`
                      ? 'text-foreground font-medium'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {conv.is_pinned && <Pin size={12} className="shrink-0 text-primary/70" />}
                  <span className="truncate flex-1 font-medium">{conv.title || 'New conversation'}</span>
                  <span
                    role="button"
                    aria-label="Conversation options"
                    onClick={(e) => { e.stopPropagation(); setMenuOpenId(menuOpenId === conv.id ? null : conv.id) }}
                    className={`p-1.5 rounded-md text-muted-foreground/50 hover:text-foreground hover:bg-accent transition-colors shrink-0 hidden sm:block sm:opacity-0 sm:group-hover:opacity-100`}
                  >
                    <MoreVertical size={14} />
                  </span>
                </button>
              )}

              {/* 3-dot dropdown menu */}
              {menuOpenId === conv.id && (
                <>
                  <div className="absolute right-2 top-full mt-1 w-44 bg-card border border-border/50 rounded-xl shadow-xl z-50 animate-scale-in overflow-hidden">
                    <button
                      onClick={async (e) => {
                        e.stopPropagation()
                        const newPinned = !conv.is_pinned
                        await togglePinConversation(conv.id, newPinned)
                        queryClient.setQueryData<Conversation[]>(['conversations'], prev => (prev ?? []).map(c => c.id === conv.id ? { ...c, is_pinned: newPinned } : c))
                        setMenuOpenId(null)
                      }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-foreground/80 hover:bg-accent/50 transition-colors"
                    >
                      <Pin size={14} className="text-muted-foreground" />
                      {conv.is_pinned ? 'Unpin' : 'Pin conversation'}
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        setRenameValue(conv.title || '')
                        setRenamingId(conv.id)
                        setMenuOpenId(null)
                      }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-foreground/80 hover:bg-accent/50 transition-colors"
                    >
                      <Pencil size={14} className="text-muted-foreground" />
                      Rename
                    </button>
                    <div className="border-t border-border/30" />
                    <button
                      onClick={async (e) => {
                        e.stopPropagation()
                        await deleteConversation(conv.id)
                        queryClient.setQueryData<Conversation[]>(['conversations'], prev => (prev ?? []).filter(c => c.id !== conv.id))
                        if (location.pathname === `/app/ask/${conv.id}`) navigate('/app/ask')
                        setMenuOpenId(null)
                      }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-destructive hover:bg-destructive/10 transition-colors"
                    >
                      <Trash2 size={14} />
                      Delete
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}
          {conversations.length === 0 && (
            <p className="text-[11px] text-muted-foreground px-3 py-4 text-center">Your conversations will appear here</p>
          )}
        </div>
        )}

        {/* Bottom: User with dropdown menu */}
        {!sidebarCollapsed && (
        <div className="px-3 py-3 relative">
          {/* Dropdown menu */}
          {userMenuOpen && (
            <>
              <div className="absolute bottom-full left-3 right-3 mb-2 bg-card border border-border/50 rounded-xl shadow-xl z-[70] animate-scale-in overflow-hidden">
                <div className="px-4 py-3 border-b border-border/30">
                  <p className="text-xs text-muted-foreground truncate">{userEmail || 'User'}</p>
                </div>
                <div className="py-1">
                  <button onClick={() => { setSettingsOpen(true); setSettingsTab('general'); setUserMenuOpen(false) }} className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-foreground/80 hover:bg-accent/50 transition-colors">
                    <SettingsIcon size={15} className="text-muted-foreground" /> Settings
                  </button>
                  <button onClick={() => { window.open('https://github.com/haydenteh5526/FYP', '_blank'); setUserMenuOpen(false) }} className="w-full flex items-center justify-between px-4 py-2.5 text-sm text-foreground/80 hover:bg-accent/50 transition-colors">
                    <span className="flex items-center gap-3"><ExternalLink size={15} className="text-muted-foreground" /> Learn more</span>
                    <ExternalLink size={12} className="text-muted-foreground/40" />
                  </button>
                </div>
                <div className="border-t border-border/30 py-1">
                  <button onClick={() => { logout(); navigate('/'); setUserMenuOpen(false) }} className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-foreground/80 hover:bg-accent/50 transition-colors">
                    <LogOut size={15} className="text-muted-foreground" /> Log out
                  </button>
                </div>
              </div>
            </>
          )}

          <div className="flex items-center gap-1">
            <button
              onClick={() => setUserMenuOpen(!userMenuOpen)}
              className="flex-1 flex items-center gap-2 px-2 py-2 rounded-lg hover:bg-accent/50 transition-colors"
            >
              <div className="w-8 h-8 rounded-full gradient-bg flex items-center justify-center text-white text-xs font-bold shadow-sm">
                {userName ? userName[0].toUpperCase() : 'U'}
              </div>
              <div className="flex-1 min-w-0 text-left">
                <p className="text-sm font-medium truncate">{userName || 'User'}</p>
                <p className="text-[10px] text-muted-foreground truncate">{userEmail || ''}</p>
              </div>
            </button>
            <NotificationCenter
              notifications={notifs.notifications}
              unreadCount={notifs.unreadCount}
              onMarkAllRead={notifs.markAllRead}
              onMarkRead={notifs.markRead}
              onRemove={notifs.remove}
            />
          </div>
        </div>
        )}
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-hidden bg-background/50 flex flex-col min-w-0">
        {/* Mobile menu button */}
        <button onClick={() => setSidebarOpen(true)} className="lg:hidden fixed top-3 left-3 z-30 p-2 rounded-lg bg-background/80 backdrop-blur-md text-muted-foreground hover:text-foreground shadow-sm" aria-label="Open menu">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 12h18M3 6h18M3 18h18"/></svg>
        </button>
        <div className="flex-1 overflow-hidden">
          <Suspense fallback={<PageLoader />}>
            <Routes>
              <Route index element={<AskAI />} />
              <Route path="documents" element={<Dashboard />} />
              <Route path="upload" element={<UploadPage />} />
              <Route path="documents/:id" element={<DocumentDetail />} />
              <Route path="warranties" element={<Warranties />} />
              <Route path="search" element={<SearchPage />} />
              <Route path="ask" element={<AskAI />} />
              <Route path="ask/:conversationId" element={<AskAI />} />
              <Route path="chats" element={<SearchChats />} />
              <Route path="profile" element={<ProfilePage />} />
              <Route path="settings" element={<Settings />} />
            </Routes>
          </Suspense>
        </div>
      </main>

      {/* Global overlays */}
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
      <OnboardingTour />

      {/* Settings modal */}
      {settingsOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setSettingsOpen(false)} />
          <div ref={settingsTrapRef} role="dialog" aria-modal="true" aria-label="Settings" className="relative w-full max-w-4xl h-[85vh] bg-card border border-border/50 rounded-2xl shadow-2xl overflow-hidden animate-scale-in">
            <button
              onClick={() => setSettingsOpen(false)}
              className="absolute top-4 right-4 p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors z-10"
              aria-label="Close settings"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18"/><path d="M6 6l12 12"/></svg>
            </button>
            <Suspense fallback={<PageLoader />}>
              <Settings initialTab={settingsTab} />
            </Suspense>
          </div>
        </div>
      )}
    </div>
  )
}

export default App
