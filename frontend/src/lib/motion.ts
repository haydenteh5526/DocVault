/**
 * Turns on the landing page's motion. Content is visible by default; the animation rules
 * only exist under html.motion-ok, so nothing hides unless this ran. It runs only when the
 * visitor has not asked for reduced motion and the browser has IntersectionObserver.
 */
export function enableMotion(): void {
  if (typeof window === 'undefined' || typeof IntersectionObserver === 'undefined') return
  if (!window.matchMedia('(prefers-reduced-motion: no-preference)').matches) return
  document.documentElement.classList.add('motion-ok')
}
