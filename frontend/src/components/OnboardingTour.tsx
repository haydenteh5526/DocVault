import { useState, useEffect } from 'react'
import { Upload, Search, FolderOpen, MessageSquare, X, ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'

const STORAGE_KEY = 'docvault-onboarding-done'

const STEPS = [
  {
    id: 'welcome',
    icon: <div className="text-4xl">👋</div>,
    title: 'Welcome to DocVault!',
    desc: 'Your AI-powered document vault. Scan any physical document — manuals, receipts, warranties — and ask questions about them instantly.',
    target: null,
  },
  {
    id: 'upload',
    icon: <Upload size={28} className="text-white" />,
    title: 'Start by uploading',
    desc: 'Click the Upload button in the top bar or drag files into the Upload page. We support JPEG, PNG, WebP, and PDF.',
    target: 'topbar-upload',
  },
  {
    id: 'search',
    icon: <Search size={28} className="text-white" />,
    title: 'Search semantically',
    desc: 'Press ⌘K anywhere to search. Our AI understands meaning — search "heating problem" and it finds "boiler fault" in your manual.',
    target: 'topbar-search',
  },
  {
    id: 'folders',
    icon: <FolderOpen size={28} className="text-white" />,
    title: 'Organise with categories',
    desc: 'Create categories to group documents, or use the automatically detected document type as a sorting aid.',
    target: null,
  },
  {
    id: 'ai',
    icon: <MessageSquare size={28} className="text-white" />,
    title: 'Ask AI questions',
    desc: 'Open any document and use Ask AI to get answers accompanied by the retrieved source excerpts.',
    target: null,
  },
]

interface Props {
  onDone?: () => void
}

export function OnboardingTour({ onDone }: Props) {
  const [step, setStep] = useState(0)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (!localStorage.getItem(STORAGE_KEY)) {
      // Slight delay so the app renders first
      const t = setTimeout(() => setVisible(true), 800)
      return () => clearTimeout(t)
    }
  }, [])

  function complete() {
    localStorage.setItem(STORAGE_KEY, '1')
    setVisible(false)
    onDone?.()
  }

  function next() {
    if (step < STEPS.length - 1) setStep(s => s + 1)
    else complete()
  }

  function prev() {
    if (step > 0) setStep(s => s - 1)
  }

  if (!visible) return null

  const current = STEPS[step]
  const isLast = step === STEPS.length - 1

  return (
    <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center p-4 sm:p-0">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-fade-in" />

      {/* Card */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="onboarding-title"
        className="relative w-full max-w-sm bg-card border border-border/40 rounded-2xl shadow-2xl p-7 animate-scale-in"
      >
        {/* Close */}
        <button
          onClick={complete}
          className="absolute top-4 right-4 p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          aria-label="Skip tour"
        >
          <X size={16} />
        </button>

        {/* Progress dots */}
        <div className="flex gap-1.5 mb-6" aria-hidden="true">
          {STEPS.map((_, i) => (
            <div
              key={i}
              className={`h-1 rounded-full transition-all duration-300 ${i === step ? 'w-6 gradient-bg' : 'w-1.5 bg-muted'}`}
            />
          ))}
        </div>

        {/* Icon */}
        <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-5 ${current.id === 'welcome' ? 'bg-primary/10' : 'gradient-bg shadow-lg shadow-primary/20'}`}>
          {current.icon}
        </div>

        {/* Content */}
        <h2 id="onboarding-title" className="text-xl font-bold mb-2">{current.title}</h2>
        <p className="text-sm text-muted-foreground leading-relaxed">{current.desc}</p>

        {/* Actions */}
        <div className="flex gap-2 mt-7">
          {step > 0 && (
            <Button variant="ghost" size="sm" onClick={prev} className="text-muted-foreground">
              Back
            </Button>
          )}
          <div className="flex-1" />
          <Button variant="ghost" size="sm" onClick={complete} className="text-muted-foreground text-xs">
            Skip tour
          </Button>
          <Button size="sm" className="gradient-bg border-0 text-white" onClick={next}>
            {isLast ? 'Get started' : 'Next'}
            {!isLast && <ArrowRight size={13} className="ml-1.5" />}
          </Button>
        </div>
      </div>
    </div>
  )
}

/** Call this to reset the tour (e.g. from Settings) */
export function resetOnboardingTour() {
  localStorage.removeItem(STORAGE_KEY)
}
