import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Wordmark } from './Wordmark'
import { GithubMark } from './GithubMark'
import { REPO_URL } from '@/lib/project'

/** Past this many pixels the sticky bar shows its bottom border. */
const SCROLLED_AFTER = 16

/** True once the page has scrolled past SCROLLED_AFTER pixels. */
function useScrolled() {
  const [scrolled, setScrolled] = useState(() => typeof window !== 'undefined' && window.scrollY > SCROLLED_AFTER)
  useEffect(() => {
    const update = () => setScrolled(window.scrollY > SCROLLED_AFTER)
    update()
    window.addEventListener('scroll', update, { passive: true })
    return () => window.removeEventListener('scroll', update)
  }, [])
  return scrolled
}

/** Public navigation at every width: the wordmark, Sign in and GitHub. Sticks to the top and shows a border once the page scrolls. */
export default function Navbar() {
  const scrolled = useScrolled()
  return <header className="poster-nav" data-scrolled={scrolled ? 'true' : 'false'}>
    <a href="#content" className="skip-link">Skip to content</a>
    <Link className="poster-brand" to="/"><Wordmark /></Link>
    <nav aria-label="Site" className="poster-nav-links">
      <Link className="poster-nav-link" to="/login">Sign in</Link>
      <a className="poster-nav-link" href={REPO_URL} target="_blank" rel="noopener noreferrer">
        <GithubMark />
        GitHub{' '}
        <span className="sr-only">(opens in a new tab)</span>
      </a>
    </nav>
  </header>
}
