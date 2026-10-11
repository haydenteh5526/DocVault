import { ArrowRight, Camera, Search, MessageSquare, Shield, Cloud, FileText, Zap, ChevronDown, ArrowUp, Lock, ShieldCheck, Users, EyeOff } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useState, useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import Navbar from '@/components/Navbar'
import Footer from '@/components/Footer'

const faqs = [
  { q: 'What file formats are supported?', a: 'JPEG, PNG, WebP, and multi-page PDF.' },
  { q: 'How is my data protected?', a: 'The app uses JWT authentication, bcrypt password hashing, per-user query isolation, and access-controlled object storage.' },
  { q: 'How does the AI Q&A work?', a: 'We split your documents into chunks, embed them semantically using vector search (pgvector), and use RAG (Retrieval-Augmented Generation) to answer questions grounded in your actual content.' },
  { q: 'What AI models are used?', a: 'Document categorisation uses Mistral. Q&A uses Groq (Llama 3.3 70B) or Google Gemini 2.0 Flash. OCR is handled by Tesseract.' },
  { q: 'Is this a commercial product?', a: 'No — this is a final year project for TUS Athlone (Software Design with AI for Cloud Computing). It demonstrates a tested local architecture and cloud infrastructure definition.' },
]

const features = [
  { icon: <Camera size={20} />, title: 'OCR Extraction', desc: 'Automatic text extraction from images and PDFs using Tesseract OCR with multi-page support.', gradient: 'icon-gradient-blue' },
  { icon: <Search size={20} />, title: 'Semantic Search', desc: 'Find "drainage issue" even when the manual says "blocked filter". Vector embeddings understand context.', gradient: 'icon-gradient-purple' },
  { icon: <MessageSquare size={20} />, title: 'AI Q&A', desc: 'Ask natural questions, get sourced answers. Grounded in your documents with cited references.', gradient: 'icon-gradient-blue', featured: true },
  { icon: <Shield size={20} />, title: 'Secure by Default', desc: 'JWT auth, bcrypt hashing, per-user data isolation. Your documents are only accessible by you.', gradient: 'icon-gradient-green' },
  { icon: <Cloud size={20} />, title: 'Cloud-Ready', desc: 'Dockerised with Terraform modules for AWS deployment. S3 storage, PostgreSQL with pgvector.', gradient: 'icon-gradient-amber' },
  { icon: <Zap size={20} />, title: 'Background Processing', desc: 'Upload returns instantly. OCR, categorisation, and embedding run asynchronously via ARQ workers.', gradient: 'icon-gradient-purple' },
]

const securityFeatures = [
  { icon: <Lock size={18} />, title: 'Hashed passwords', desc: 'bcrypt with salt rounds — passwords are never stored in plain text.' },
  { icon: <ShieldCheck size={18} />, title: 'JWT authentication', desc: 'Stateless token-based auth with expiry and refresh.' },
  { icon: <Users size={18} />, title: 'User isolation', desc: 'Authenticated API queries are scoped to the current user, with cross-user access covered by integration tests.' },
  { icon: <EyeOff size={18} />, title: 'Controlled AI context', desc: 'Only retrieved document excerpts are sent to a configured Q&A provider; embeddings run locally by default.' },
]

export default function Landing() {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      {/* Hero — split layout with product mockup */}
      <section className="pt-36 pb-16 px-6 relative overflow-hidden">
        <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: 'radial-gradient(circle, currentColor 1px, transparent 1px)', backgroundSize: '24px 24px' }} />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[900px] h-[600px] bg-gradient-to-b from-primary/[0.07] via-purple-400/[0.03] to-transparent rounded-full blur-3xl pointer-events-none" />

        <div className="max-w-6xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
            {/* Left — copy */}
            <div className="text-center lg:text-left">
              <div className="opacity-0" style={{ animation: 'fadeSlideUp 0.7s cubic-bezier(0.16,1,0.3,1) 0.1s forwards' }}>
                <span className="inline-flex items-center gap-2 rounded-full border border-border/50 bg-background/80 backdrop-blur px-4 py-1.5 text-xs font-medium text-muted-foreground">
                  <span className="h-1.5 w-1.5 rounded-full gradient-bg animate-pulse" /> Final Year Project — TUS Athlone
                </span>
              </div>
              <h1 className="mt-7 text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight leading-[1.05] opacity-0" style={{ animation: 'fadeSlideUp 0.7s cubic-bezier(0.16,1,0.3,1) 0.2s forwards' }}>
                Documents that<br /><span className="gradient-text">think for you</span>
              </h1>
              <p className="mt-5 text-lg text-muted-foreground max-w-lg mx-auto lg:mx-0 leading-relaxed opacity-0" style={{ animation: 'fadeSlideUp 0.7s cubic-bezier(0.16,1,0.3,1) 0.35s forwards' }}>
                Upload or snap any document — photos, PDFs, manuals. AI extracts the text, organises it, and lets you ask questions about it in plain English.
              </p>

            </div>

            {/* Right — animated app mockup */}
            <div className="relative opacity-0 hidden lg:block" style={{ animation: 'fadeSlideUp 0.9s cubic-bezier(0.16,1,0.3,1) 0.4s forwards' }}>
              <div className="absolute -inset-4 gradient-bg opacity-[0.06] rounded-3xl blur-2xl" />
              <AppMockup />
            </div>
          </div>
        </div>
      </section>

      {/* Scanner showcase — enhanced mockup */}
      <section className="py-24 px-6" aria-hidden="true">
        <div className="max-w-3xl mx-auto opacity-0" style={{ animation: 'fadeSlideUp 0.8s cubic-bezier(0.16,1,0.3,1) 0.2s forwards' }}>
          <div className="relative rounded-2xl border border-border/40 bg-card p-8 shadow-2xl shadow-black/[0.04] overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-0.5 gradient-bg animate-[scanLine_3s_ease-in-out_infinite]" />
            <div className="grid md:grid-cols-2 gap-6 items-center">
              {/* Physical doc — realistic mockup instead of grey bars */}
              <div className="rounded-xl bg-muted/50 border border-border/30 p-5 aspect-[4/5] flex flex-col justify-between">
                <div className="space-y-3">
                  <div className="flex items-center gap-2 pb-2 border-b border-border/30">
                    <div className="w-6 h-6 rounded bg-blue-500/20 flex items-center justify-center">
                      <span className="text-[8px] font-bold text-blue-600">S</span>
                    </div>
                    <span className="text-[11px] font-semibold text-foreground/70">Samsung User Manual</span>
                  </div>
                  <p className="text-[10px] text-muted-foreground leading-relaxed">
                    <span className="font-semibold text-foreground">Chapter 4: Washing Programmes</span>
                  </p>
                  <p className="text-[9px] text-muted-foreground leading-relaxed">
                    Select the appropriate programme for your fabric type. Delicate fabrics should be washed at 30°C with reduced spin speed...
                  </p>
                  <p className="text-[9px] text-muted-foreground leading-relaxed">
                    For heavily soiled items, use the Intensive programme at 60°C. Pre-soak is recommended for stubborn stains.
                  </p>
                  <div className="flex gap-2 mt-1">
                    <div className="h-8 w-8 rounded bg-muted-foreground/[0.06] flex items-center justify-center text-[8px] text-muted-foreground">📷</div>
                    <div className="h-8 w-8 rounded bg-muted-foreground/[0.06] flex items-center justify-center text-[8px] text-muted-foreground">📷</div>
                  </div>
                </div>
                <div className="flex items-center gap-2 pt-2 border-t border-border/30">
                  <span className="text-[9px] text-muted-foreground">Page 42 of 98</span>
                  <span className="ml-auto text-[8px] text-muted-foreground">WW90T554DAW</span>
                </div>
              </div>
              {/* Digital output */}
              <div className="rounded-xl border border-primary/20 bg-gradient-to-br from-primary/[0.02] to-transparent p-5 space-y-4">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg gradient-bg flex items-center justify-center"><FileText size={14} className="text-white" /></div>
                  <div>
                    <p className="text-sm font-medium">Samsung WW90T Manual</p>
                    <p className="text-[11px] text-muted-foreground">User Manual • Detected automatically</p>
                  </div>
                </div>
                <div className="space-y-2 text-[12px] text-muted-foreground border-t border-border/30 pt-3">
                  <p><span className="font-medium text-foreground">Brand:</span> Samsung</p>
                  <p><span className="font-medium text-foreground">Model:</span> WW90T554DAW</p>
                  <p><span className="font-medium text-foreground">Category:</span> Appliances → Laundry</p>
                </div>
                <div className="bg-muted/50 rounded-lg p-3 text-[12px]">
                  <p className="text-muted-foreground">💬 "Wash delicates at 30°C with 800rpm spin"<span className="inline-block w-0.5 h-3.5 bg-primary ml-0.5 animate-pulse" /></p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Feature bento grid — enhanced with gradient icons + hover effects */}
      <section id="features" className="py-24 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl font-semibold tracking-tight">Built for the way you think</h2>
            <p className="mt-2 text-muted-foreground">Every feature designed to feel invisible until you need it.</p>
          </div>
          <div className="grid md:grid-cols-3 gap-4">
            {features.map((f, i) => (
              <div
                key={f.title}
                className={`group rounded-2xl border border-border/40 bg-card p-6 hover-lift animate-slide-up transition-all duration-300 hover:border-primary/20 ${f.featured ? 'md:ring-1 md:ring-primary/10 md:shadow-lg md:shadow-primary/[0.03]' : ''}`}
                style={{ animationDelay: `${i * 50}ms`, animationFillMode: 'both' }}
              >
                <div className={`w-10 h-10 rounded-xl ${f.gradient} flex items-center justify-center text-primary mb-4 transition-transform duration-300 group-hover:scale-110 group-hover:rotate-3`}>
                  {f.icon}
                </div>
                <h3 className="font-semibold text-[15px] mb-1.5">{f.title}</h3>
                <p className="text-[13px] text-muted-foreground leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Deep-dive feature — alternating layout */}
      <section className="py-24 px-6 bg-muted/20 border-t border-border/30">
        <div className="max-w-5xl mx-auto space-y-20">
          <FeatureRow
            title="Ask questions, get real answers"
            desc="Stop flipping through pages. Type your question in plain English and get an instant, sourced answer pulled directly from your stored documents. The AI cites exactly which manual and section it found the answer in."
            visual={
              <div className="rounded-xl border border-border/40 bg-card p-5 space-y-3">
                <div className="bg-primary/[0.05] rounded-lg p-3 text-sm ml-auto w-fit text-right">What temperature for delicates?</div>
                <div className="bg-muted/60 rounded-lg p-3 text-sm max-w-[85%]">
                  Wash delicates at 30°C with a maximum spin speed of 800 RPM.
                  <span className="block text-[10px] text-muted-foreground mt-1.5">🔗 Samsung WW90T Manual, Section 4.2</span>
                </div>
              </div>
            }
          />
          <FeatureRow
            title="Automatic organisation"
            desc="Upload a photo and AI detects the brand, model number, document type, and suggests a title. It auto-creates categories and even extracts warranty expiry dates from receipts. You never have to manually tag anything."
            visual={
              <div className="rounded-xl border border-border/40 bg-card p-5 space-y-3 text-sm">
                <div className="flex items-center gap-3 pb-3 border-b border-border/30">
                  <div className="w-9 h-9 rounded-lg gradient-bg flex items-center justify-center"><FileText size={14} className="text-white" /></div>
                  <div><p className="font-medium">Bosch Serie 6 Dishwasher</p><p className="text-[11px] text-muted-foreground">Auto-categorised • Warranty: Jan 2028</p></div>
                </div>
                <div className="grid grid-cols-3 gap-2 text-[11px]">
                  <div className="rounded-md bg-primary/[0.06] px-2 py-1.5 text-center text-primary font-medium">Bosch</div>
                  <div className="rounded-md bg-muted px-2 py-1.5 text-center">Dishwasher</div>
                  <div className="rounded-md bg-muted px-2 py-1.5 text-center">User Manual</div>
                </div>
              </div>
            }
            reverse
          />
        </div>
      </section>

      {/* Security — with distinct icons per card */}
      <section id="security" className="py-24 px-6 border-t border-border/30">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl font-semibold tracking-tight">Security you can trust</h2>
            <p className="mt-2 text-muted-foreground">Authenticated access controls keep each user's documents isolated by default.</p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
            {securityFeatures.map((item, i) => (
              <div key={item.title} className="group rounded-2xl border border-border/40 bg-card p-6 hover-lift animate-slide-up transition-all duration-300 hover:border-green-500/20" style={{ animationDelay: `${i * 50}ms`, animationFillMode: 'both' }}>
                <div className="w-10 h-10 rounded-xl icon-gradient-green flex items-center justify-center mb-4 transition-transform duration-300 group-hover:scale-110">
                  <span className="text-green-600">{item.icon}</span>
                </div>
                <h4 className="text-[15px] font-semibold mb-1.5">{item.title}</h4>
                <p className="text-[13px] text-muted-foreground leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ — with smooth animations */}
      <section id="faq" className="py-24 px-6 bg-muted/20 border-t border-border/30">
        <div className="max-w-2xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl font-semibold tracking-tight">Frequently asked questions</h2>
            <p className="mt-2 text-muted-foreground">Everything you need to know.</p>
          </div>
          <div className="space-y-3">
            {faqs.map((faq, i) => <FAQItem key={i} question={faq.q} answer={faq.a} />)}
          </div>
        </div>
      </section>

      {/* Tech Stack + CTA */}
      <section id="tech-stack" className="py-24 px-6 border-t border-border/30">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-semibold tracking-tight">Built with modern tools</h2>
            <p className="mt-2 text-muted-foreground">Tested local architecture with infrastructure defined for AWS.</p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 mb-16">
            {[
              { name: 'React', desc: 'Frontend' },
              { name: 'FastAPI', desc: 'Backend' },
              { name: 'PostgreSQL', desc: 'Database' },
              { name: 'pgvector', desc: 'Vector search' },
              { name: 'Tesseract', desc: 'OCR engine' },
              { name: 'Redis', desc: 'Cache + queue' },
              { name: 'Docker', desc: 'Containers' },
              { name: 'Terraform', desc: 'Infrastructure' },
              { name: 'MinIO / S3', desc: 'Object storage' },
              { name: 'Groq / Gemini', desc: 'LLM providers' },
              { name: 'Mistral', desc: 'Categorisation' },
              { name: 'TypeScript', desc: 'Type safety' },
            ].map((tech) => (
              <div key={tech.name} className="rounded-xl border border-border/40 bg-card/50 px-4 py-3.5 text-center transition-all duration-200 hover:border-primary/20 hover:bg-card">
                <p className="text-sm font-medium text-foreground">{tech.name}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{tech.desc}</p>
              </div>
            ))}
          </div>

          <div className="text-center">
            <p className="text-lg text-muted-foreground mb-6">See it in action — create an account and upload your first document.</p>
            <Button size="lg" className="gradient-bg border-0 text-white h-12 px-8 text-[15px] shadow-xl shadow-primary/20 transition-all duration-200 hover:shadow-2xl hover:-translate-y-0.5" asChild>
              <Link to="/register">Get started <ArrowRight size={16} className="ml-1.5" /></Link>
            </Button>
          </div>
        </div>
      </section>

      <BackToTop />
      <Footer />

      <style>{`
        @keyframes fadeSlideUp { from { opacity: 0; transform: translateY(24px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes scanLine { 0%, 100% { transform: translateY(0); opacity: 0; } 10% { opacity: 1; } 90% { opacity: 1; } 50% { transform: translateY(320px); } }
      `}</style>
    </div>
  )
}

function FeatureRow({ title, desc, visual, reverse }: { title: string; desc: string; visual: React.ReactNode; reverse?: boolean }) {
  return (
    <div className={`grid md:grid-cols-2 gap-10 items-center ${reverse ? 'md:[direction:rtl]' : ''}`}>
      <div className={reverse ? 'md:[direction:ltr]' : ''}>
        <h3 className="text-2xl font-semibold mb-3">{title}</h3>
        <p className="text-muted-foreground leading-relaxed">{desc}</p>
      </div>
      <div className={reverse ? 'md:[direction:ltr]' : ''}>{visual}</div>
    </div>
  )
}

function FAQItem({ question, answer }: { question: string; answer: string }) {
  const [open, setOpen] = useState(false)
  const contentRef = useRef<HTMLDivElement>(null)

  return (
    <div className="rounded-xl border border-border/40 bg-card overflow-hidden transition-all duration-200">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-between px-5 py-4 text-left text-sm font-medium hover:bg-accent/30 transition-colors duration-200">
        {question}
        <ChevronDown size={16} className={`text-muted-foreground transition-transform duration-300 ease-out ${open ? 'rotate-180' : ''}`} />
      </button>
      <div
        className="transition-all duration-300 ease-out overflow-hidden"
        style={{
          maxHeight: open ? `${contentRef.current?.scrollHeight || 200}px` : '0px',
          opacity: open ? 1 : 0,
        }}
      >
        <div ref={contentRef}>
          <p className="px-5 pb-5 pt-3 text-sm text-muted-foreground leading-relaxed">{answer}</p>
        </div>
      </div>
    </div>
  )
}

function BackToTop() {
  const [show, setShow] = useState(false)

  useEffect(() => {
    function onScroll() { setShow(window.scrollY > 600) }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <button
      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      className={`fixed bottom-8 right-8 z-50 w-10 h-10 rounded-full gradient-bg text-white shadow-lg shadow-primary/25 flex items-center justify-center transition-all duration-300 hover:-translate-y-1 hover:shadow-xl ${show ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 translate-y-4 scale-75 pointer-events-none'}`}
      aria-label="Back to top"
    >
      <ArrowUp size={16} />
    </button>
  )
}

function AppMockup() {
  return (
    <div aria-hidden="true" className="relative rounded-2xl border border-border/50 bg-card shadow-2xl shadow-black/10 overflow-hidden">
      {/* Fake browser chrome */}
      <div className="flex items-center gap-1.5 px-4 py-3 border-b border-border/30 bg-muted/40">
        <div className="w-2.5 h-2.5 rounded-full bg-red-400/70" />
        <div className="w-2.5 h-2.5 rounded-full bg-amber-400/70" />
        <div className="w-2.5 h-2.5 rounded-full bg-green-400/70" />
        <div className="flex-1 mx-4 h-5 rounded-full bg-muted/80 flex items-center px-3">
          <span className="text-[9px] text-muted-foreground">docvault.app/dashboard</span>
        </div>
      </div>

      {/* App UI */}
      <div className="flex h-72">
        {/* Mini sidebar */}
        <div className="w-14 border-r border-border/30 bg-muted/20 flex flex-col items-center py-4 gap-3">
          <div className="w-7 h-7 rounded-lg gradient-bg flex items-center justify-center">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="white"><path d="M7 18h10V6H7v12zM5 4h14a1 1 0 011 1v14a1 1 0 01-1 1H5a1 1 0 01-1-1V5a1 1 0 011-1zm4 4h6v2h-6V8zm0 4h6v2h-6v-2z"/></svg>
          </div>
          {[['oklch(0.55 0.22 264)', true], ['oklch(0.6 0.15 155)', false], ['oklch(0.6 0.2 300)', false]].map(([color, active], i) => (
            <div key={i} className={`w-8 h-8 rounded-lg flex items-center justify-center ${active ? 'gradient-bg' : 'bg-muted/60'}`}>
              <div className="w-3.5 h-3.5 rounded-sm" style={{ background: active ? 'white' : String(color), opacity: active ? 1 : 0.4 }} />
            </div>
          ))}
        </div>

        {/* Main area */}
        <div className="flex-1 p-4 flex flex-col gap-3 overflow-hidden">
          {/* Mini topbar */}
          <div className="flex items-center gap-2">
            <div className="flex-1 h-6 rounded-full bg-muted/60 flex items-center px-3 gap-2">
              <div className="w-3 h-3 rounded-full bg-muted-foreground/20" />
              <div className="w-16 h-2 rounded bg-muted-foreground/15" />
              <div className="ml-auto w-8 h-3 rounded bg-muted-foreground/20 text-[7px] text-foreground flex items-center justify-center font-mono">⌘K</div>
            </div>
            <div className="w-14 h-6 rounded-full gradient-bg flex items-center justify-center">
              <span className="text-[8px] text-white font-semibold">Upload</span>
            </div>
          </div>

          {/* Doc cards */}
          <div className="grid grid-cols-2 gap-2 flex-1">
            {[
              { color: 'bg-blue-400/20', title: 'Samsung Manual', type: 'Appliance', w: 'w-14' },
              { color: 'bg-purple-400/20', title: 'Lease Agreement', type: 'Legal', w: 'w-16' },
              { color: 'bg-green-400/20', title: 'Warranty Card', type: 'Warranty', w: 'w-12' },
              { color: 'bg-amber-400/20', title: 'IKEA Instructions', type: 'Manual', w: 'w-14' },
            ].map((d, i) => (
              <div key={i} className="rounded-xl border border-border/30 bg-background/80 p-3 flex flex-col gap-2" style={{ animationDelay: `${i * 100}ms` }}>
                <div className={`w-8 h-8 rounded-lg ${d.color} flex items-center justify-center`}>
                  <div className="w-3.5 h-4 rounded-sm bg-current opacity-30" />
                </div>
                <div>
                  <div className={`h-2 ${d.w} rounded bg-foreground/20 mb-1`} />
                  <div className="h-1.5 w-10 rounded bg-muted-foreground/20" />
                </div>
                <div className="mt-auto">
                  <span className="text-[8px] text-primary font-medium bg-primary/[0.08] px-1.5 py-0.5 rounded-full">{d.type}</span>
                </div>
              </div>
            ))}
          </div>

          {/* AI chat preview */}
          <div className="rounded-xl border border-border/30 bg-muted/20 p-3 flex items-center gap-2">
            <div className="w-6 h-6 rounded-full gradient-bg flex items-center justify-center shrink-0">
              <div className="w-3 h-3 rounded-sm bg-white/70" />
            </div>
            <div className="flex-1 space-y-1">
              <div className="h-1.5 w-full rounded bg-muted-foreground/20" />
              <div className="h-1.5 w-3/4 rounded bg-muted-foreground/15" />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
