import { useCallback } from 'react'
import { flushSync } from 'react-dom'
import { useNavigate } from 'react-router-dom'

type TransitionDocument = Document & { startViewTransition?: (update: () => void) => unknown }

/**
 * Navigates inside a page transition (the cross-fade in index.css) where the browser has the
 * View Transitions API and the visitor has not asked for reduced motion; everywhere else it
 * simply navigates. It does not use React Router's own viewTransition option, which only
 * works under a data router. A data router would not follow the history entries that the
 * browser tests add by hand (pushState plus popstate), so the app keeps <BrowserRouter>.
 */
export function useTransitionNavigate() {
  const navigate = useNavigate()
  return useCallback((to: string) => {
    const doc = document as TransitionDocument
    const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
    if (typeof doc.startViewTransition !== 'function' || reduced) { navigate(to); return }
    doc.startViewTransition(() => { flushSync(() => navigate(to)) })
  }, [navigate])
}
