import type { CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import { Check } from 'lucide-react'
import Navbar from '@/components/Navbar'
import { DocBotMark } from '@/components/DocBotMark'
import { FloatingTiles } from '@/components/landing/FloatingTiles'
import { QuestionMarquee } from '@/components/landing/QuestionMarquee'
import { ASSISTANT_NAME as docbot } from '@/lib/assistant'
import { REPO_URL } from '@/lib/project'
import { GithubMark } from '@/components/GithubMark'
import { VaultMonogram } from '@/components/VaultMonogram'
import './landing.css'

const repo = REPO_URL
const setup = `${repo}#quick-start`

/** A static "Requires approval" card. Looks like the real one, saves nothing. */
function ApprovalCard() {
  return (
    <div className="approval-card">
      <span className="signal">Requires approval</span>
      <strong>Electricity bill · 2 days before due</strong>
      <small>Reminder on 21 November · €123.47 split 4 ways</small>
      <div className="approval-chips">
        <span className="chip chip-primary">Approve and save</span>
        <span className="chip">Review in bill</span>
      </div>
    </div>
  )
}

/** A question and DocBot's answer, as a picture. A miss has no source, as in the product. */
function CitedAnswer({ question, answer, source, size = 20 }: { question: string; answer: string; source?: string; size?: number }) {
  return (
    <>
      <span className="sample-bubble">{question}</span>
      <div className="sample-answer">
        <DocBotMark size={size} />
        <span>
          <b>{answer}</b>
          {source && <small>{source}</small>}
        </span>
      </div>
    </>
  )
}

/** DocBot's home as a picture, with synthetic data. Nothing in it can be clicked. */
function ProductPicture() {
  const alt = `${docbot}'s home: two questions answered from your own documents. How much notice to give the landlord: 28 days in writing, from line 14 of the tenancy agreement. Whether the kettle is still under warranty: yes, until 14 March 2027, from the kettle receipt.`
  return (
    <figure role="img" aria-label={alt} className="product-picture">
      <div className="picture-chrome" aria-hidden="true">
        <i />
        <i />
        <i />
      </div>
      <div className="picture-app" aria-hidden="true">
        <div className="picture-menu">
          <div className="presence">
            <DocBotMark size={22} state="needs-approval" />
            <b>{docbot}</b>
            <span>1 needs approval</span>
          </div>
          <span>Documents</span>
          <span>Upload</span>
          <span>Warranties</span>
        </div>
        <div className="picture-thread">
          <CitedAnswer
            question="How much notice do I give the landlord?"
            answer="28 days, in writing"
            source="Tenancy agreement · line 14"
          />
          <CitedAnswer
            question="Is the kettle still under warranty?"
            answer="Yes, until 14 March 2027"
            source="Kettle receipt · 2-year warranty"
          />
        </div>
      </div>
    </figure>
  )
}

const documents: [string, string][] = [
  ['Leases', 'notice · rent day'],
  ['Manuals', 'fault codes'],
  ['Warranties', 'end dates'],
  ['Receipts', 'proof of purchase'],
  ['Bills', 'amount · due date'],
]

function Ticks({ items }: { items: string[] }) {
  return (
    <ul className="ticks">
      {items.map(item => (
        <li key={item}>
          <Check size={16} aria-hidden="true" />
          {item}
        </li>
      ))}
    </ul>
  )
}

export default function Landing() {
  return (
    <div className="docbot-site poster dark">
      <Navbar />
      <main id="content" tabIndex={-1}>
        <section className="landing-hero" aria-labelledby="hero-title">
          <FloatingTiles />
          <h1 id="hero-title">
            <span className="h1-line">Ask your documents</span> <br />
            <span className="h1-line" style={{ '--d': '90ms' } as CSSProperties}>
              anything.
            </span>
          </h1>
          <p className="hero-lead">
            Your personal AI document assistant. Upload photos or PDFs, ask in your own words, and get answers that cite
            their source line.
          </p>
          <div className="hero-links">
            <Link to="/register">Get started</Link>
            <a href={setup} className="text-link" target="_blank" rel="noopener noreferrer">
              <GithubMark />
              Run it yourself on GitHub{' '}
              <span className="sr-only">(opens in a new tab)</span>
            </a>
          </div>
        </section>

        <ProductPicture />
        <QuestionMarquee />

        <section id="meet-docbot" className="meet-docbot">
          <div>
            <DocBotMark variant="full" state="done" size={120} />
            <h2>{`Meet ${docbot}, who reads your paperwork so you don't have to.`}</h2>
            <p className="meet-lead">
              Ask about anything you've uploaded. {docbot} answers from your own files, shows where the answer is, and
              tells you when it isn't there.
            </p>
          </div>
          <figure
            role="img"
            aria-label={`${docbot} answers that E21 on the dishwasher means the water temperature is too low, from line 22 of the dishwasher manual, then says it couldn't find when the car insurance renews in your documents.`}
          >
            <CitedAnswer
              question="What does E21 mean on the dishwasher?"
              answer="Water temperature too low. Switch off and call the helpline."
              source="Dishwasher manual · line 22"
              size={28}
            />
            <CitedAnswer
              question="When does the car insurance renew?"
              answer="I couldn't find this in your documents."
              size={28}
            />
          </figure>
        </section>

        <section className="own-documents" aria-labelledby="own-documents-title">
          <h2 id="own-documents-title">Works with the paperwork you already have</h2>
          <p>Photos or PDFs. DocVault reads them on your computer.</p>
          <ul>
            {documents.map(([name, caption]) => (
              <li key={name}>
                <strong>{name}</strong>
                <code>{caption}</code>
              </li>
            ))}
          </ul>
        </section>

        <section className="feature-block">
          <figure
            role="img"
            aria-label="Line 17 of the October electricity bill, amount due €123.47 by 23 November 2026, above a card that requires approval: Electricity bill, 2 days before due, a reminder on 21 November for €123.47 split 4 ways, with the buttons Approve and save and Review in bill."
          >
            <div className="source-line">
              <span>October electricity bill</span>
              <code>
                <span className="line-no">17</span>
                Amount due €123.47 · by 23 Nov 2026
              </code>
            </div>
            <ApprovalCard />
          </figure>
          <div>
            <h2>One button to approve. Nothing saves without it.</h2>
            <Ticks
              items={[
                'Every value tied to its source line',
                'Splits worked out in whole cents',
                'Reminders proposed, never sent',
              ]}
            />
          </div>
        </section>

        <section className="feature-block feature-block-reverse">
          <div className="terminal-card" role="region" aria-label="Setup commands" tabIndex={0}>
            <pre>
              <code>
                <span className="term-line">{`$ git clone ${repo}`}</span>
                <span className="term-line">$ docker compose up -d</span>
                <span className="term-line term-ok">✓ api, worker, db, ollama ready</span>
                <span className="term-line">$ open http://localhost:3000</span>
              </code>
            </pre>
          </div>
          <div>
            <h2>If you'd rather run it yourself, you can.</h2>
            <Ticks items={['Runs on your own computer', 'Local OCR and search', '€0 to run']} />
            <a className="text-link text-link-strong" href={setup}>
              Read the setup
              <span aria-hidden="true">→</span>
            </a>
          </div>
        </section>

        <dl id="trust" className="docbot-stats">
          {[
            ['0', 'actions saved without your approval'],
            ['Line 14', 'every answer points to its source line'],
            ['€0', 'runs on your own computer'],
          ].map(([n, t]) => (
            <div key={n}>
              <dt>{n}</dt>
              <dd>{t}</dd>
            </div>
          ))}
        </dl>

        <section className="closing">
          <h2>Your paperwork deserves better than a drawer.</h2>
          <Link className="closing-button" to="/register">
            Get started
          </Link>
        </section>
      </main>
      <footer className="landing-footer">
        <p className="footer-brand">
          <VaultMonogram size={20} />
          © 2026 DocVault · by Hayden · final-year project
        </p>
        <nav aria-label="Project">
          {[
            ['GitHub', repo],
            ['Architecture', `${repo}#architecture`],
            ['Evaluation', `${repo}/tree/main/evaluation`],
          ].map(([name, href]) => (
            <a key={name} href={href} target="_blank" rel="noopener noreferrer">
              {name}{' '}
              <span className="sr-only">(opens in a new tab)</span>
            </a>
          ))}
        </nav>
      </footer>
    </div>
  )
}
