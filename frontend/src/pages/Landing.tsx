import { Link } from 'react-router-dom'
import { Check } from 'lucide-react'
import Navbar from '@/components/Navbar'
import { DocBotMark } from '@/components/DocBotMark'
import { FloatingTiles } from '@/components/landing/FloatingTiles'
import { QuestionMarquee } from '@/components/landing/QuestionMarquee'
import { ASSISTANT_NAME as docbot } from '@/lib/assistant'
import './landing.css'

const repo = 'https://github.com/haydenteh5526/DocVault'
const setup = `${repo}#quick-start`

/** The GitHub mark, drawn here because lucide-react no longer ships brand icons. */
function GithubMark() {
  return (
    <svg aria-hidden="true" focusable="false" width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 .5C5.73.5.5 5.73.5 12c0 5.08 3.29 9.39 7.86 10.91.58.1.79-.25.79-.56v-2c-3.2.7-3.87-1.37-3.87-1.37-.52-1.33-1.28-1.69-1.28-1.69-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.18 1.76 1.18 1.03 1.76 2.69 1.25 3.35.96.1-.74.4-1.25.73-1.54-2.55-.29-5.24-1.28-5.24-5.68 0-1.25.45-2.28 1.18-3.08-.12-.29-.51-1.46.11-3.04 0 0 .96-.31 3.15 1.18a10.9 10.9 0 0 1 5.74 0c2.19-1.49 3.15-1.18 3.15-1.18.62 1.58.23 2.75.11 3.04.74.8 1.18 1.83 1.18 3.08 0 4.41-2.69 5.38-5.25 5.67.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.5 11.5 0 0 0 23.5 12C23.5 5.73 18.27.5 12 .5z" />
    </svg>
  )
}

/** A static "Requires approval" card. Looks like the real one, saves nothing. */
function ApprovalCard() {
  return (
    <div className="approval-card">
      <span className="signal">Requires approval</span>
      <strong>Reminder on 21 November · proposal 2</strong>
      <small>€123.47 · split 4 ways · line 17</small>
      <div className="approval-chips">
        <span className="chip chip-primary">Approve and save</span>
        <span className="chip">Review in bill</span>
      </div>
    </div>
  )
}

/** DocBot's home as a picture, with synthetic data. Nothing in it can be clicked. */
function ProductPicture() {
  const alt = `${docbot}'s home: the side menu with ${docbot}'s status, a question about the electricity bill answered with 23 November 2026 from line 17, and a reminder that requires approval.`
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
          <span className="sample-bubble">When is the electricity bill due?</span>
          <div className="sample-answer">
            <DocBotMark size={20} />
            <span>
              <b>23 November 2026</b>
              <small>October electricity bill · line 17</small>
            </span>
          </div>
          <ApprovalCard />
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
            <Link to="/register">Create an account</Link>
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
          <figure role="img" aria-label={`${docbot} proposes a reminder two days before the bill is due. The reminder requires your approval.`}>
            <span className="sample-bubble">Remind me two days before the bill is due.</span>
            <div className="sample-answer">
              <DocBotMark size={28} />
              <span>Here’s the reminder for you to review.</span>
            </div>
            <ApprovalCard />
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
          <figure role="img" aria-label="A reminder proposal that requires approval, with the buttons Approve and save and Review in bill.">
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
            <a className="text-link" href={setup}>
              Read the setup
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
            Create an account
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
