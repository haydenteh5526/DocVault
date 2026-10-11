import { useRef, type KeyboardEvent, type ClipboardEvent } from 'react'

export function PinInput({ value, onChange, length = 6, autoFocus }: { value: string; onChange: (v: string) => void; length?: number; autoFocus?: boolean }) {
  const refs = useRef<(HTMLInputElement | null)[]>([])

  function setDigit(index: number, digit: string) {
    const clean = digit.replace(/\D/g, '')
    if (!clean) return
    const chars = value.split('')
    chars[index] = clean[clean.length - 1]
    const next = chars.join('').slice(0, length)
    onChange(next)
    if (index < length - 1) refs.current[index + 1]?.focus()
  }

  function handleKeyDown(index: number, e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace') {
      e.preventDefault()
      const chars = value.split('')
      if (chars[index]) {
        chars[index] = ''
        onChange(chars.join(''))
      } else if (index > 0) {
        refs.current[index - 1]?.focus()
        const prev = value.split('')
        prev[index - 1] = ''
        onChange(prev.join(''))
      }
    } else if (e.key === 'ArrowLeft' && index > 0) {
      refs.current[index - 1]?.focus()
    } else if (e.key === 'ArrowRight' && index < length - 1) {
      refs.current[index + 1]?.focus()
    }
  }

  function handlePaste(e: ClipboardEvent<HTMLInputElement>) {
    e.preventDefault()
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, length)
    onChange(pasted)
    refs.current[Math.min(pasted.length, length - 1)]?.focus()
  }

  return (
    <div className="flex gap-2 justify-center">
      {Array.from({ length }).map((_, i) => (
        <input
          key={i}
          ref={(el) => { refs.current[i] = el }}
          type="text"
          inputMode="numeric"
          maxLength={1}
          value={value[i] || ''}
          autoFocus={autoFocus && i === 0}
          onChange={(e) => setDigit(i, e.target.value)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          onPaste={handlePaste}
          className="w-11 h-13 text-center text-xl font-semibold rounded-lg border border-input bg-background focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-all duration-150 h-12"
        />
      ))}
    </div>
  )
}
