import { Layers } from 'lucide-react'

export default function Footer() {
  return (
    <footer className="border-t border-border/40 py-12 px-6">
      <div className="max-w-5xl mx-auto">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-8">
          {/* Left - brand */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Layers size={18} className="text-primary" />
              <span className="font-semibold text-sm text-foreground">DocVault</span>
            </div>
            <p className="text-xs text-muted-foreground max-w-xs leading-relaxed">
              AI-powered cloud document vault. Digitise, search, and query your physical documents.
            </p>
          </div>

          {/* Right - links */}
          <div className="flex items-center gap-6 text-sm text-muted-foreground">
            <a href="#features" className="hover:text-foreground transition-colors">Features</a>
            <a href="#security" className="hover:text-foreground transition-colors">Security</a>
            <a href="#tech-stack" className="hover:text-foreground transition-colors">Tech Stack</a>
            <a href="#faq" className="hover:text-foreground transition-colors">FAQ</a>
            <a href="https://github.com/haydenteh5526/FYP" target="_blank" rel="noopener noreferrer" className="hover:text-foreground transition-colors">GitHub</a>
          </div>
        </div>

        <div className="mt-8 pt-6 border-t border-border/30 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">© 2026 DocVault. Final Year Project — TUS Athlone.</p>
          <p className="text-xs text-muted-foreground">Software Design with AI for Cloud Computing</p>
        </div>
      </div>
    </footer>
  )
}
