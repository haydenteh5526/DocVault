import { Link } from 'react-router-dom'
import { Wordmark } from './Wordmark'

export default function Navbar() {
  return <header className="poster-nav">
    <a href="#content" className="skip-link">Skip to content</a>
    <Link className="poster-brand" to="/"><Wordmark /></Link>
    <nav aria-label="Account"><Link className="poster-signin" to="/login">Sign in</Link><Link className="poster-button" to="/register">Create an account</Link></nav>
  </header>
}
