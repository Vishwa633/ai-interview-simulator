import { useEffect, useState } from 'react'
import interviewerImage from './assets/ai-interviewer.jpeg'
import { AboutPage, AccountPage, SiteFeedbackPage } from './Pages.jsx'
import './App.css'

const featureCards = [
  { kind: 'voice', title: 'Voice practice', icon: '∿', description: 'Answer English interview questions out loud and practice realistic follow-ups.' },
  { kind: 'profile', title: 'Questions about your work', icon: '≡', description: 'Build your interview around your CV, GitHub, portfolio, and the role.' },
  { kind: 'memory', title: 'Memory across sessions', icon: '↻', description: 'Get feedback in Sinhala and revisit topics you found difficult.' },
]

const waveformHeights = [10, 17, 13, 25, 36, 21, 30, 44, 27, 16, 30, 38, 21, 28, 14, 19, 10]

const questions = [
  'You built a student search feature. How would you speed it up as the database grows?',
  'How would you check whether your change made the search faster?',
]

function Brand() {
  return <><span className="brand-mark" aria-hidden="true"><i /><i /><i /><i /><i /></span>InterviewLoop</>
}

function Setup({ onStart }) {
  const [fileName, setFileName] = useState('')
  return (
    <section className="panel" aria-labelledby="setup-title">
      <a className="back-link" href="#home">← Back to home</a>
      <h1 id="setup-title">Set up your interview.</h1>
      <p className="panel-intro">Add the experience and role you want to practice for. You can try a sample interview while the AI integration is being built.</p>
      <form onSubmit={(event) => { event.preventDefault(); onStart() }}>
        <div className="fields">
          <label>CV <span>Optional · PDF</span><input type="file" accept=".pdf,application/pdf" onChange={(event) => setFileName(event.target.files[0]?.name ?? '')} />{fileName && <small>Selected {fileName}</small>}</label>
          <label>GitHub profile <span>Optional</span><input type="url" placeholder="https://github.com/your-name" /></label>
          <label>Job description<textarea rows="5" placeholder="Paste the role and its requirements…" /></label>
          <label>Portfolio <span>Optional</span><textarea rows="5" placeholder="Paste a portfolio link or describe a project…" /></label>
        </div>
        <button className="button button-primary" type="submit">Continue to sample <span aria-hidden="true">→</span></button>
      </form>
    </section>
  )
}

function SampleInterview({ onExit }) {
  const [answers, setAnswers] = useState([])
  const [answer, setAnswer] = useState('')
  const complete = answers.length === questions.length

  function submitAnswer(event) {
    event.preventDefault()
    const text = answer.trim()
    if (!text) return
    setAnswers([...answers, text])
    setAnswer('')
  }

  return (
    <section className="panel" aria-labelledby="sample-title">
      <button type="button" className="back-link" onClick={onExit}>← Back to setup</button>
      <p className="eyebrow">SAMPLE INTERVIEW</p>
      <h1 id="sample-title">{complete ? 'Practice complete.' : `Question ${answers.length + 1} of ${questions.length}`}</h1>
      {complete ? (
        <>
          <p className="panel-intro" lang="si">ඊළඟ වතාවේ index එකක් තෝරපු හේතුවත්, ඒකෙන් query එක වේගවත් වුණාද කියලා බලන විදිහත් උදාහරණයක් එක්ක පැහැදිලි කරන්න.</p>
          <AnswerList answers={answers} />
          <button type="button" className="button button-primary" onClick={onExit}>Back to setup</button>
        </>
      ) : (
        <form onSubmit={submitAnswer}>
          <p className="panel-intro">{questions[answers.length]}</p>
          <label htmlFor="sample-answer">Your answer</label>
          <textarea id="sample-answer" rows="5" value={answer} onChange={(event) => setAnswer(event.target.value)} required />
          <button className="button button-primary" type="submit" disabled={!answer.trim()}>{answers.length === questions.length - 1 ? 'Finish practice' : 'Next question'} <span aria-hidden="true">→</span></button>
        </form>
      )}
    </section>
  )
}

const navItems = [
  ['home', 'Home'],
  ['about', 'About'],
  ['feedbacks', 'Feedbacks'],
  ['login', 'Login'],
  ['register', 'Register'],
]

function AnswerList({ answers }) {
  return (
    <>
      <h2>Your answers</h2>
      <ol className="answers">
        {answers.map((text, index) => (
          <li key={questions[index]}><strong>{questions[index]}</strong><p>{text}</p></li>
        ))}
      </ol>
    </>
  )
}

function App() {
  const [path, setPath] = useState(window.location.hash)

  // Keep navigation compatible with browser history and direct links.
  const navigate = (target) => {
    window.location.hash = target
  }

  useEffect(() => {
    const updatePath = () => setPath(window.location.hash)
    window.addEventListener('hashchange', updatePath)
    return () => window.removeEventListener('hashchange', updatePath)
  }, [])

  useEffect(() => {
    if (path === '#how-it-works') {
      document.getElementById('how-it-works')?.scrollIntoView()
    } else {
      window.scrollTo(0, 0)
    }
  }, [path])
  const route = path.slice(1)
  const screen = ['setup', 'sample', 'about', 'feedbacks', 'login', 'register'].includes(route) ? route : 'home'

  return (
    <div className="site-layout">
      <header className="site-header">
        <div className="shell header-inner">
          <a className="brand" href="#home"><Brand /></a>
          <nav className="site-nav" aria-label="Main navigation">
            {navItems.map(([target, label]) => (
              <a
                key={target}
                className={target === 'register' ? 'button button-outline' : 'nav-link'}
                href={`#${target}`}
                aria-current={screen === target ? 'page' : undefined}
              >
                {label}
              </a>
            ))}
          </nav>
        </div>
      </header>
      <main id="home" className="shell">
        {screen === 'setup' && <Setup onStart={() => navigate('sample')} />}
        {screen === 'sample' && <SampleInterview onExit={() => navigate('setup')} />}
        {screen === 'about' && <AboutPage />}
        {screen === 'feedbacks' && <SiteFeedbackPage />}
        {(screen === 'login' || screen === 'register') && <AccountPage key={screen} mode={screen} />}
        {screen === 'home' && (
          <>
            <section className="hero" aria-labelledby="home-title">
              <div className="hero-copy">
                <h1 id="home-title">Practice for the<br className="hero-break" /> job <em>you want.</em></h1>
                <p className="hero-description">Practice with questions tailored to your CV, GitHub, portfolio, and target role. Pick up where your last interview left off.</p>
                <div className="hero-actions"><a className="button button-primary" href="#setup">Start a mock interview <span aria-hidden="true">→</span></a><a className="sample-link" href="#sample">Try a sample <span aria-hidden="true">↗</span></a></div>
              </div>
              <img className="hero-art" src={interviewerImage} alt="An AI interviewer framed by cyan and violet audio displays" />
            </section>
            <section id="how-it-works" className="how" aria-labelledby="how-title">
              <h2 id="how-title">How it works</h2>
              <ol className="steps">
                {featureCards.map(({ kind, title, icon, description }) => (
                  <li key={kind} className={`feature feature-${kind}`}>
                    <div className="feature-heading">
                      <h3>{title}</h3>
                      <span className="feature-icon" aria-hidden="true">{icon}</span>
                    </div>
                    <p>{description}</p>
                    {kind === 'voice' && (
                      <div className="waveform" aria-hidden="true">
                        {waveformHeights.map((height, index) => <i key={index} style={{ '--height': `${height}px` }} />)}
                      </div>
                    )}
                    {kind === 'profile' && (
                      <ul className="feature-tags" aria-label="Profile sources">
                        <li>CV</li><li>GitHub</li><li>Portfolio</li><li>Job description</li>
                      </ul>
                    )}
                    {kind === 'memory' && <p className="feature-note"><strong>Example follow-up</strong>Explain why you chose that SQL index.</p>}
                  </li>
                ))}
              </ol>
            </section>
          </>
        )}
      </main>
      <footer className="shell site-footer"><a className="brand" href="#home"><Brand /></a></footer>
    </div>
  )
}

export default App
