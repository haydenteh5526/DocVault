import { useEffect, useRef } from 'react'

/**
 * Traps keyboard focus within a container while `active` is true, and moves
 * initial focus into it. Restores focus to the previously-focused element when
 * deactivated. Use for modal dialogs to keep Tab navigation inside the dialog.
 */
export function useFocusTrap<T extends HTMLElement>(active: boolean) {
  const ref = useRef<T>(null)

  useEffect(() => {
    if (!active || !ref.current) return
    const node = ref.current
    const previouslyFocused = document.activeElement as HTMLElement | null

    const selector =
      'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
    const focusables = () =>
      Array.from(node.querySelectorAll<HTMLElement>(selector)).filter(
        el => el.offsetParent !== null,
      )

    // Move focus into the dialog.
    focusables()[0]?.focus()

    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== 'Tab') return
      const els = focusables()
      if (els.length === 0) return
      const first = els[0]
      const last = els[els.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }

    node.addEventListener('keydown', onKeyDown)
    return () => {
      node.removeEventListener('keydown', onKeyDown)
      // Restore focus to where it was before the dialog opened.
      previouslyFocused?.focus?.()
    }
  }, [active])

  return ref
}
