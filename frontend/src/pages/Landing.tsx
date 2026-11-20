import { Link } from 'react-router-dom'
import { Fragment, type CSSProperties, type ReactNode } from 'react'
import { useReveal } from '@/lib/useReveal'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import Navbar from '@/components/Navbar'
import Footer from '@/components/Footer'
import { HeroPreview } from '@/components/landing/HeroPreview'
import './landing.css'

const steps = [
  ['Upload', 'A bill, a lease, a manual or a receipt.'],
  ['Ask', 'In your own words. Every answer shows the line it came from.'],
  ['Check and approve', 'See the source line. Nothing is saved without you.'],
]
/** A landing section whose heading and visual enter once, as it scrolls into view. */
function Reveal({ className, labelledBy, children }: { className: string; labelledBy: string; children: ReactNode }) {
  const ref = useReveal<HTMLElement>()
  return <section ref={ref} aria-labelledby={labelledBy} className={'reveal ' + className}>{children}</section>
}

const headline = ['Everything', 'you keep,', 'ready to', 'answer.']

export default function Landing() {
  return <div className="poster">
    <Navbar />
    <main id="content" tabIndex={-1}>
      <section className="poster-hero" aria-labelledby="hero-title">
        <h1 id="hero-title">{headline.map((line, i) => <Fragment key={line}>{i > 0 && ' '}<span className="h1-line" style={{ '--i': i } as CSSProperties}><span>{line}</span></span></Fragment>)}</h1>
        <p className="hero-lead">Ask in your own words. Every answer comes with the line it came from, and nothing is saved until you approve it.</p>
        <HeroPreview />
      </section>
      <Reveal className="poster-section steps-section" labelledBy="steps-title">
        <h2 id="steps-title">Three steps, and you decide.</h2>
        <ol aria-labelledby="steps-title" className="steps">
          {steps.map(([name, line]) => <li key={name}><h3>{name}</h3><p>{line}</p></li>)}
        </ol>
      </Reveal>
      <Reveal className="poster-section decision-section" labelledBy="decide-title">
        <h2 id="decide-title">It proposes. You decide.</h2>
        <p>Ask DocVault to split a bill among the people you live with, or to remind you before it is due. You see the exact shares and the exact reminder first. Nothing is saved until you approve it.</p>
        <div className="decision-grid"><dl className="split-numbers">{['Aoife','Ben','Chidi','Dara'].map((name,i) => <div key={name}><dt>{name}</dt><dd>{i === 3 ? '30.86' : '30.87'}</dd></div>)}</dl>
          <figure className="reminder-sample" aria-label="Example reminder proposal">
            <strong>Approve this reminder</strong><p>Proposal 2 · not saved yet</p><dl><div><dt>Amount due</dt><dd>€123.47</dd></div><div><dt>Remind on</dt><dd>21 November 2026</dd></div></dl>
            <p>Nothing is sent to anyone. The reminder is saved in your account only.</p>
            <div className="sample-actions"><span>Approve and save</span><span>Cancel proposal</span></div>
          </figure></div>
      </Reveal>
      <Reveal className="poster-section closing-section" labelledBy="closing-title">
        <h2 id="closing-title">Start with one document.</h2>
        <p>Upload a bill, a lease or a manual and ask about it in your own words.</p>
        <Link className={cn(buttonVariants({ size: 'lg' }), 'mt-6 h-11 px-6 text-base')} to="/register">Create an account</Link>
      </Reveal>
    </main>
    <Footer />
  </div>
}
