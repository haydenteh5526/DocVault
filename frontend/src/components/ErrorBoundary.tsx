import { Component, type ErrorInfo, type ReactNode } from 'react'
import { AlertTriangle } from 'lucide-react'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

/**
 * Global error boundary — catches render-time crashes anywhere in the tree so
 * the app shows a recovery screen instead of a blank white page.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Surface to the console for debugging; a real deployment could forward
    // this to an error-tracking service (e.g. Sentry) here.
    console.error('Uncaught error in React tree:', error, info)
  }

  handleReload = () => {
    this.setState({ hasError: false, error: null })
    window.location.assign('/')
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center px-6 bg-background text-center">
          <div className="w-14 h-14 rounded-2xl bg-destructive/10 flex items-center justify-center mb-5">
            <AlertTriangle className="h-7 w-7 text-destructive" />
          </div>
          <h1 className="text-xl font-semibold tracking-tight">Something went wrong</h1>
          <p className="text-sm text-muted-foreground mt-2 max-w-sm">
            An unexpected error occurred. You can reload the app to continue.
          </p>
          <button
            onClick={this.handleReload}
            className="mt-6 h-10 px-6 rounded-lg gradient-bg text-white text-sm font-medium transition-all duration-200 hover:-translate-y-0.5"
          >
            Reload app
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
