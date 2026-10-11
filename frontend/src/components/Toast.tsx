import { useState, useEffect, useCallback, createContext, useContext, type ReactNode } from 'react'
import { CheckCircle, AlertCircle, Info, X } from 'lucide-react'

type ToastType = 'success' | 'error' | 'info'

interface Toast {
  id: string
  message: string
  type: ToastType
  action?: { label: string; onClick: () => void }
}

interface ToastContextType {
  toast: (message: string, type?: ToastType, action?: { label: string; onClick: () => void }) => void
}

const ToastContext = createContext<ToastContextType>({ toast: () => {} })

export function useToast() {
  return useContext(ToastContext)
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const addToast = useCallback((message: string, type: ToastType = 'success', action?: { label: string; onClick: () => void }) => {
    const id = Math.random().toString(36).slice(2)
    setToasts(prev => [...prev, { id, message, type, action }])
  }, [])

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  return (
    <ToastContext.Provider value={{ toast: addToast }}>
      {children}
      {/* Toast container */}
      <div className="fixed bottom-6 right-6 z-[100] flex flex-col gap-2 pointer-events-none">
        {toasts.map(t => (
          <ToastItem key={t.id} toast={t} onDismiss={removeToast} />
        ))}
      </div>
    </ToastContext.Provider>
  )
}

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: (id: string) => void }) {
  useEffect(() => {
    const timer = setTimeout(() => onDismiss(toast.id), toast.action ? 6000 : 4000)
    return () => clearTimeout(timer)
  }, [toast.id, toast.action, onDismiss])

  const icons = {
    success: <CheckCircle size={16} className="text-green-600 shrink-0" />,
    error: <AlertCircle size={16} className="text-destructive shrink-0" />,
    info: <Info size={16} className="text-primary shrink-0" />,
  }

  return (
    <div className="pointer-events-auto flex items-center gap-3 bg-background border border-border/60 shadow-lg rounded-xl px-4 py-3 min-w-[280px] max-w-sm animate-slide-up">
      {icons[toast.type]}
      <p className="text-sm flex-1">{toast.message}</p>
      {toast.action && (
        <button onClick={() => { toast.action!.onClick(); onDismiss(toast.id) }} className="text-xs font-medium text-primary hover:underline shrink-0">
          {toast.action.label}
        </button>
      )}
      <button onClick={() => onDismiss(toast.id)} className="text-muted-foreground hover:text-foreground transition-colors">
        <X size={14} />
      </button>
    </div>
  )
}
