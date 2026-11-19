import { FileText, MessageSquare, Search } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Fragment, type CSSProperties, type ReactNode } from 'react'
import { useReveal } from '@/lib/useReveal'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import Navbar from '@/components/Navbar'
import Footer from '@/components/Footer'
import { ExampleBill } from '@/components/ExampleBill'
import './landing.css'

const results = [
  ['Washer-dryer warranty card', 'Warranty period: 2 years', ' from the date of purchase, parts and labour.'],
  ['Washer-dryer manual (model WD8)', 'Keep your proof of purchase.', ' The guarantee does not cover misuse.'],
  ['Kettle receipt', 'Returns within 30 days.', ' Manufacturer warranty applies after that.'],
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
      <section className="poster-hero poster-grid" aria-labelledby="hero-title">
        <div>
          <h1 id="hero-title">{headline.map((line, i) => <Fragment key={line}>{i > 0 && ' '}<span className="h1-line" style={{ '--i': i } as CSSProperties}><span>{line}</span></span></Fragment>)}</h1>
          <p className="hero-lead">DocVault turns the documents you keep into a personal knowledge base. Ask in your own words, and every answer comes with the line it came from. Nothing is saved or acted on until you approve it.</p>
          <p className="hero-lead phone-lead">Ask in your own words. Every answer comes with the line it came from, and nothing is saved until you approve it.</p>
        </div>
        <div className="paper-example">
          <div className="drift-question"><div className="example-question"><MessageSquare size={20}/><div><span>You asked</span><p>When is the electricity bill due?</p></div></div></div>
          <div className="drift-stack"><ExampleBill /></div>
        </div>
      </section>
      <Reveal className="poster-section poster-grid" labelledBy="find-title">
        <div><h2 id="find-title">Find anything by what it says or what it means.</h2>
        <p>Search the words printed on the page, or describe what you are looking for. Results come from every document you have uploaded: bills, leases, manuals, warranties and receipts.</p></div>
        <figure role="img" aria-label="A search across three documents" className="search-example">
          <div className="search-caption">Search your documents</div>
          <div className="search-sample"><Search size={18}/>how long is the washer guaranteed for</div>
          <div className="search-count">3 documents match</div>
          {results.map(([name, phrase, rest]) => <div className="search-result" key={name}><FileText size={19}/><div><strong>{name}</strong><p><mark>{phrase}</mark>{rest}</p></div></div>)}
        </figure>
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
      <Reveal className="poster-section poster-grid privacy-band" labelledBy="private-title"><h2 id="private-title">Your documents stay on your computer.</h2>
        <div><p>DocVault runs on your own machine. It stores the originals, reads their text and searches them locally, and each account sees only its own documents.</p>
          <details><summary className="link-draw">How does asking a question work?</summary>
            <h3>Ask your documents</h3><p>Text is read with Tesseract OCR and searched with the nomic-embed-text model on Ollama, all on your own computer. Answers written by a language model need a provider key, which this build does not set.</p>
            <p>Local embeddings help find matching passages. Review warranty dates found for you against the original wording, such as “2 year warranty” or “Expires 12 June 2028”.</p>
          </details></div>
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
