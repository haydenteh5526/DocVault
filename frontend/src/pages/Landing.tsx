import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowUpRight, Clock3, FileText } from 'lucide-react'
import Navbar from '@/components/Navbar'
import { DocBotMark } from '@/components/DocBotMark'
import { ASSISTANT_NAME as docbot } from '@/lib/assistant'
import './landing.css'

const setup = 'https://github.com/haydenteh5526/DocVault#quick-start'
const words = ['answer', 'check', 'remind']
function HeroWord() {
  const [word, setWord] = useState(words[0])
  useEffect(() => {
    const media = window.matchMedia?.('(prefers-reduced-motion: reduce)')
    if (!media) return
    let timer: ReturnType<typeof setTimeout>
    function restart() {
      clearTimeout(timer)
      setWord(words[0])
      if (media!.matches) return
      let index = 0
      let length = words[0].length
      let erasing = true
      function tick() {
        length += erasing ? -1 : 1
        if (!length) {
          index = (index + 1) % words.length
          erasing = false
        }
        setWord(words[index].slice(0, length))
        const complete = length === words[index].length
        if (complete) erasing = true
        timer = setTimeout(tick, complete ? 2600 : 95)
      }
      timer = setTimeout(tick, 2600)
    }
    restart()
    media.addEventListener('change', restart)
    return () => {
      clearTimeout(timer)
      media.removeEventListener('change', restart)
    }
  }, [])
  return <span aria-hidden="true">{word}.</span>
}

function ReminderPreview() {
  return (
    <div className="sample-reminder">
      <span className="signal">Requires approval</span>
      <strong>Electricity bill reminder</strong>
      <small>21 November · €123.47</small>
    </div>
  )
}
const panels = [
  {
    title: 'Ask',
    alt: 'When is my electricity bill due? October electricity bill, 23 November 2026, line 17.',
    visual: (
      <>
        <span className="sample-bubble">When is my electricity bill due?</span>
        <div className="sample-answer">
          <DocBotMark size={22} />
          <span>
            <span>23 November 2026</span> · line 17
          </span>
        </div>
      </>
    ),
  },
  {
    title: 'Check',
    alt: 'October electricity bill showing EUR 123.47 and the highlighted due date on line 17.',
    visual: (
      <div className="sample-paper">
        <b>
          <FileText size={13} /> October electricity bill
        </b>
        <span>16 · Amount · EUR 123.47</span>
        <mark>17 · Payment due date: 23 November 2026</mark>
        <span>18 · End of statement</span>
      </div>
    ),
  },
  {
    title: docbot,
    alt: `${docbot} proposes a reminder for 21 November for €123.47. It requires approval.`,
    visual: <ReminderPreview />,
  },
  {
    title: 'Daily check',
    alt: 'Preview of a daily bill check at 07:30. Scheduling is planned.',
    visual: (
      <div className="sample-clock">
        <Clock3 size={28} />
        <strong>Daily bill check</strong>
        <span>Every day at 07:30 · Preview</span>
      </div>
    ),
  },
]

export default function Landing() {
  return (
    <div className="docbot-site poster dark">
      <Navbar />
      <main id="content" tabIndex={-1}>
        <section className="docbot-hero" aria-labelledby="hero-title">
          <span className="news-pill">Preview · {docbot} checks your bills each morning</span>
          <h1 id="hero-title" aria-label="Everything you keep, ready to answer.">
            Everything you keep,
            <br />
            ready to <HeroWord />
          </h1>
          <p className="hero-lead">
            Ask your bills, leases and manuals in your own words. Every answer shows the line it came from.
          </p>
          <div className="hero-links">
            <Link to="/register">Create an account</Link>
            <Link to="/login">Sign in</Link>
          </div>
        </section>
        <section className="product-row" aria-label="Explore DocVault">
          {panels.map((panel) => (
            <article key={panel.title}>
              <figure role="img" aria-label={panel.alt}>
                {panel.visual}
              </figure>
              <div>
                <h2>{panel.title}</h2>
                <Link aria-label={'Explore ' + panel.title} to="/register">
                  Explore →
                </Link>
              </div>
            </article>
          ))}
        </section>
        <section id="meet-docbot" className="meet-docbot">
          <h2>
            Meet <DocBotMark variant="full" state="done" size={72} /> {docbot}, who keeps your paperwork moving.
          </h2>
          <figure
            role="img"
            aria-label={`${docbot} proposes a reminder two days before the bill is due. The reminder requires your approval.`}
          >
            <span className="sample-bubble">Remind me two days before it’s due.</span>
            <div className="sample-answer">
              <DocBotMark size={28} /> Here’s the reminder for you to review.
            </div>
            <ReminderPreview />
          </figure>
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
        <section className="start-cards" aria-label="Get started">
          <Link to="/register">
            Create an account <ArrowUpRight />
          </Link>
          <a href={setup}>
            Run it yourself <ArrowUpRight />
          </a>
        </section>
      </main>
      <footer>
        {[
          ['Product', 'Meet ' + docbot, '#meet-docbot'],
          ['Trust', 'Source evidence', '#trust'],
          ['Project', 'Setup guide', setup],
          ['Account', 'Sign in', '/login'],
        ].map(([group, title, href]) => (
          <div key={group}>
            <strong>{group}</strong>
            <a href={href}>{title}</a>
          </div>
        ))}
        <p className="footer-notes">
          DocVault runs on your own computer. Each account sees only its own documents.
        </p>
        <p className="footer-notes">
          A final-year project at TUS Athlone. It runs on your own computer, and the examples on this page are
          synthetic.
        </p>
      </footer>
    </div>
  )
}
