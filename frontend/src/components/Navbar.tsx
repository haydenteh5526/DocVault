import { Link } from 'react-router-dom'
import { Wordmark } from './Wordmark'
import { buttonVariants } from '@/components/ui/button'

/** The account links live here, at every width, and nowhere in the hero. */
export default function Navbar() {
  return <header className="poster-nav">
    <a href="#content" className="skip-link">Skip to content</a>
    <Link className="poster-brand" to="/"><Wordmark /></Link>
    <nav aria-label="Account" className="flex items-center gap-1">
      <Link className={buttonVariants({ variant: 'ghost' }) + ' h-9 px-3 text-sm'} to="/login">Sign in</Link>
      <Link className={buttonVariants() + ' h-9 px-3 text-sm'} to="/register">Create an account</Link>
    </nav>
  </header>
}
