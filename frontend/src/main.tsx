import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import './index.css'
import App from './App'
import { queryClient } from './lib/queryClient'
import { ErrorBoundary } from './components/ErrorBoundary'

import { initialiseTheme } from './lib/theme'
import { enableMotion } from './lib/motion'

enableMotion()
const stopTheme = initialiseTheme()
if (import.meta.hot) import.meta.hot.dispose(stopTheme)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </ErrorBoundary>
  </StrictMode>,
)

// Register service worker for offline support
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(() => {})
}
