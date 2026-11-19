import { useEffect, useRef } from 'react'

/** Every hidden element is revealed this long after it mounts, whatever the observer does. */
export const REVEAL_SAFETY_MS = 2500

/**
 * Sets data-revealed on the element the first time 20% of it is in view, then stops watching.
 * A safety timer sets it anyway, so nothing stays hidden in a background tab, a screenshot
 * or a browser where the observer fails. Without IntersectionObserver it is revealed at once.
 */
export function useReveal<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  useEffect(() => {
    const element = ref.current
    if (!element) return
    const reveal = () => element.setAttribute('data-revealed', '')
    if (typeof IntersectionObserver === 'undefined') { reveal(); return }
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) { reveal(); observer.disconnect() }
    }, { threshold: 0.2 })
    observer.observe(element)
    const timer = setTimeout(() => { reveal(); observer.disconnect() }, REVEAL_SAFETY_MS)
    return () => { clearTimeout(timer); observer.disconnect() }
  }, [])
  return ref
}
