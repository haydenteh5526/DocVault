import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useState, useEffect, Suspense, lazy } from 'react'
import { Search } from 'lucide-react'
import { AppNav } from './components/AppNav'
import { AuthProvider, useAuth } from './lib/auth'
import { useFocusTrap } from './lib/useFocusTrap'
import { ToastProvider } from './components/Toast'
import { CommandPalette } from './components/CommandPalette'
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

/** Tells the theme that the page changed, so the dark class follows /app and nothing else (lib/theme.ts). */
function ThemeRouteSync() {
  const { pathname } = useLocation()
  useEffect(() => { window.dispatchEvent(new Event('route-change')) }, [pathname])
  return null
}

function AppRoutes() {
  const { isAuthenticated, accountId } = useAuth()
  const { pathname } = useLocation()
  const publicAccount = pathname !== '/' && !pathname.startsWith('/app')

  return (
    <Suspense fallback={<PageLoader />}>
      {publicAccount && <a href="#public-content" className="skip-link">Skip to content</a>}
      <ThemeRouteSync />
      <div id={publicAccount ? 'public-content' : undefined} tabIndex={publicAccount ? -1 : undefined}>
      <Routes>
        <Route path="/" element={isAuthenticated ? <Navigate to="/app" /> : <Landing />} />
        <Route path="/login" element={isAuthenticated ? <Navigate to="/app" /> : <AuthPage mode="login" />} />
        <Route path="/register" element={isAuthenticated ? <Navigate to="/app" /> : <AuthPage mode="register" />} />
        <Route path="/verify" element={<VerifyEmail />} />
        <Route path="/auth/callback" element={<OAuthCallback />} />
        <Route path="/forgot-password" element={isAuthenticated ? <Navigate to="/app" /> : <ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/app/*" element={isAuthenticated ? <AppShell key={accountId} /> : <Navigate to="/login" />} />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
      </div>
    </Suspense>
  )
}

function AppShell() {
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const settingsTrapRef = useFocusTrap<HTMLDivElement>(settingsOpen)
  useEffect(() => {
    function key(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); setPaletteOpen(o => !o) }
      if (e.key === 'Escape') { setPaletteOpen(false); setSettingsOpen(false) }
    }
    document.addEventListener('keydown', key)
    return () => document.removeEventListener('keydown', key)
  }, [])
  return (
    <div className="flex h-dvh min-w-0 flex-col bg-background lg:flex-row">
      <a className="skip-link" href="#content">Skip to content</a>
      <AppNav openSettings={() => setSettingsOpen(true)} openSearch={() => setPaletteOpen(true)} />
      <main id="content" tabIndex={-1} className="flex min-h-0 min-w-0 flex-1 flex-col pb-14 lg:pb-0">
        <div className="hidden h-14 shrink-0 items-center justify-end border-b px-8 lg:flex">
          <button className="flex items-center gap-2 rounded-md border border-input px-3 py-1.5 text-sm text-muted-foreground hover:bg-accent" aria-label="Open command palette" onClick={() => setPaletteOpen(true)}><Search size={16}/>Find a page or document <kbd>Ctrl K</kbd></button>
        </div>
        <div className="min-h-0 flex-1 overflow-hidden">
          <Suspense fallback={<PageLoader />}>
            <Routes>
              <Route index element={<AskAI key="home" home />} />
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

      {/* Settings modal */}
      {settingsOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setSettingsOpen(false)} />
          <div ref={settingsTrapRef} role="dialog" aria-modal="true" aria-label="Settings" className="relative w-full max-w-4xl h-[85vh] bg-card border border-border/50 rounded-2xl shadow-2xl overflow-hidden">
            <button
              onClick={() => setSettingsOpen(false)}
              className="absolute top-4 right-4 p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors z-10"
              aria-label="Close settings"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18"/><path d="M6 6l12 12"/></svg>
            </button>
            <Suspense fallback={<PageLoader />}>
              <Settings />
            </Suspense>
          </div>
        </div>
      )}
    </div>
  )
}

export default App
