import { Link } from 'react-router-dom'
import { Check } from 'lucide-react'
import Navbar from '@/components/Navbar'
import { DocBotMark } from '@/components/DocBotMark'
import { FloatingTiles } from '@/components/landing/FloatingTiles'
import { QuestionMarquee } from '@/components/landing/QuestionMarquee'
import { ASSISTANT_NAME as docbot } from '@/lib/assistant'
import { REPO_URL } from '@/lib/project'
import { GithubMark } from '@/components/GithubMark'
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

/** A question and DocBot's cited answer, as a picture. */
function CitedAnswer({ question, answer, source, size = 20 }: { question: string; answer: string; source: string; size?: number }) {
  return (
    <>
      <span className="sample-bubble">{question}</span>
      <div className="sample-answer">
        <DocBotMark size={size} />
        <span>
          <b>{answer}</b>
          <small>{source}</small>
        </span>
      </div>
    </>
  )
}

/** DocBot's home as a picture, with synthetic data. Nothing in it can be clicked. */
function ProductPicture() {
  const alt = `${docbot}'s home: the side menu with ${docbot}'s status, a question about lease notice answered with 28 days in writing from clause 9.2 of the tenancy agreement, and a question about the kettle answered with under warranty until 14 March 2027 from the receipt.`
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
            source="Tenancy agreement · clause 9.2"
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
  ['Bills', 'amount · due date'],
  ['Leases', 'notice · rent day'],
  ['Manuals', 'fault codes'],
  ['Warranties', 'end dates'],
  ['Receipts', 'proof of purchase'],
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
          <h1 id="hero-title">Your documents, answered and kept on track.</h1>
          <p className="hero-lead">
            Ask your bills, leases and manuals in your own words. {docbot} shows the line every answer came from and
            asks before it saves anything.
          </p>
          <div className="hero-links">
            <Link to="/register">Get started</Link>
            <a href={setup} className="text-link">
              <GithubMark />
              Run it yourself on GitHub
            </a>
          </div>
        </section>

        <ProductPicture />
        <QuestionMarquee />

        <section id="meet-docbot" className="meet-docbot">
          <div>
            <DocBotMark variant="full" state="done" size={120} />
            <h2>{`Meet ${docbot}, who keeps your paperwork moving.`}</h2>
          </div>
          <figure
            role="img"
            aria-label={`${docbot} answers that the electricity bill is due on 23 November 2026, from line 17, then drafts a reminder for 21 November that waits for your approval.`}
          >
            <CitedAnswer
              question="When is the electricity bill due?"
              answer="23 November 2026"
              source="October electricity bill · line 17"
              size={28}
            />
            <span className="sample-bubble">Remind me two days before.</span>
            <div className="sample-answer">
              <DocBotMark size={28} />
              <span>
                <b>Drafted a reminder for 21 November.</b>
                <small>Waiting for your approval</small>
              </span>
            </div>
          </figure>
        </section>

        <section className="own-documents" aria-labelledby="own-documents-title">
          <h2 id="own-documents-title">Bring your own documents</h2>
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
            aria-label="Line 17 of the October electricity bill, amount due €123.47 by 23 November 2026, above a reminder for that bill that requires approval, with the buttons Approve and save and Review in bill."
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
            ['Line 17', 'every answer points to its source line'],
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
        <p>© 2026 DocVault · final-year project</p>
        <nav aria-label="Project">
          <a href={repo}>GitHub</a>
          <a href={`${repo}#architecture`}>Architecture</a>
          <a href={`${repo}/tree/main/evaluation`}>Evaluation</a>
        </nav>
      </footer>
    </div>
  )
}
