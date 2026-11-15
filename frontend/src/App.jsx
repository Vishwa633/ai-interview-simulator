import { useEffect, useRef, useState } from 'react'
import interviewerImage from './assets/ai-interviewer.jpeg'
import { AboutPage, SiteFeedbackPage } from './Pages.jsx'
import { AccountPage } from './AccountPage.jsx'
import { supabase } from './supabase.js'
import './App.css'

const featureCards = [
  { kind: 'voice', title: 'Voice practice', icon: '∿', description: 'Answer English interview questions out loud and practice realistic follow-ups.' },
  { kind: 'profile', title: 'Questions about your work', icon: '≡', description: 'Build your interview around your CV, GitHub, portfolio, and the role.' },
  { kind: 'memory', title: 'Memory across sessions', icon: '↻', description: 'Get feedback in Sinhala and revisit topics you found difficult.' },
]

const waveformHeights = [10, 17, 13, 25, 36, 21, 30, 44, 27, 16, 30, 38, 21, 28, 14, 19, 10]

function Waveform() {
  return (
    <div className="waveform" aria-hidden="true">
      {waveformHeights.map((height, index) => <i key={index} style={{ '--height': `${height}px` }} />)}
    </div>
  )
}

function Brand() {
  return <><span className="brand-mark" aria-hidden="true"><i /><i /><i /><i /><i /></span>InterviewLoop</>
}

const nameSegments = new Intl.Segmenter()

function ProfileLink({ user, current }) {
  const fullName = user.user_metadata?.full_name
  const name = (typeof fullName === 'string' && fullName.trim()) || 'Account'
  const initial = nameSegments.segment(name).containing(0).segment.toLocaleUpperCase()

  return (
    <a className="profile-link" href="#account" aria-current={current ? 'page' : undefined}>
      <span className="profile-initial" aria-hidden="true">{initial}</span>
      <span className="profile-name">{name}</span>
    </a>
  )
}

const setupIconPaths = {
  cv: 'M13 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V10Zm0 0v7h7M8 14h8m-8 3h6',
  github: 'M8 6 2 12l6 6m8-12 6 6-6 6M14 4l-4 16',
  job: 'M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M4 7h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2Zm-2 6h20m-11-1h2v3h-2z',
  portfolio: 'M3 7a2 2 0 0 1 2-2h4l3 3h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Zm0 5h18',
  upload: 'M12 16V4m-5 5 5-5 5 5M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3',
}

function SetupIcon({ kind }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={setupIconPaths[kind]} />
    </svg>
  )
}

function SetupField({ id, title, kind, help, optional, children }) {
  return (
    <div className="setup-row">
      <div className="setup-field-info">
        <div className="setup-field-heading">
          <SetupIcon kind={kind} />
          <label className="setup-field-title" htmlFor={id}>{title}</label>
          {optional && <span className="setup-optional">Optional</span>}
        </div>
        <p className="setup-field-help" id={`${id}-help`}>{help}</p>
      </div>
      <div className="setup-field-control">{children}</div>
    </div>
  )
}

function Setup() {
  const [fileName, setFileName] = useState('')
  return (
    <section className="panel setup-page" aria-labelledby="setup-title">
      <header className="setup-heading">
        <div>
          <h1 id="setup-title">Set up your <em>interview.</em></h1>
          <p className="panel-intro">Add your experience and the role you want to practice for.</p>
        </div>
        <div className="setup-heading-visual" aria-hidden="true"><Waveform /></div>
      </header>
      <form className="setup-form" onSubmit={(event) => event.preventDefault()}>
        <div className="setup-fields">
          <SetupField id="setup-cv" title="CV" kind="cv" help="Add your résumé as a PDF." optional>
            <div className="setup-upload">
              <input id="setup-cv" name="cv" type="file" accept=".pdf,application/pdf" aria-describedby="setup-cv-help"
                onChange={event => setFileName(event.target.files[0]?.name ?? '')} />
              <SetupIcon kind="upload" />
              <strong>{fileName ? 'Change PDF' : 'Choose a PDF'}</strong>
              {fileName && <small role="status">{fileName}</small>}
            </div>
          </SetupField>
          <SetupField id="setup-github" title="GitHub profile" kind="github" help="Link the profile that shows your code." optional>
            <input id="setup-github" name="github" type="url" placeholder="https://github.com/your-name" aria-describedby="setup-github-help" />
          </SetupField>
          <SetupField id="setup-job" title="Job description" kind="job" help="Include the responsibilities and skills the role asks for.">
            <textarea id="setup-job" name="jobDescription" rows="5" placeholder="Paste the job description…" aria-describedby="setup-job-help" />
          </SetupField>
          <SetupField id="setup-portfolio" title="Portfolio" kind="portfolio" help="Share the work you want to talk about." optional>
            <textarea id="setup-portfolio" name="portfolio" rows="5" placeholder="Paste a portfolio link or describe a project…" aria-describedby="setup-portfolio-help" />
          </SetupField>
        </div>
        <div className="setup-actions">
          <p>Personalized interviews are in development.</p>
          <button className="button button-primary" type="submit" disabled>Start interview <span aria-hidden="true">→</span></button>
        </div>
      </form>
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

function App() {
  const [path, setPath] = useState(window.location.hash)
  const [session, setSession] = useState(null)
  const [checkingSession, setCheckingSession] = useState(Boolean(supabase))
  const [loggingOut, setLoggingOut] = useState(false)
  const [logoutError, setLogoutError] = useState('')
  const [confirmingLogout, setConfirmingLogout] = useState(false)
  const logoutDialog = useRef(null)

  useEffect(() => {
    if (!supabase) return
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      setCheckingSession(false)
      if (!nextSession) {
        setLogoutError('')
        logoutDialog.current?.close()
      }
    })
    return () => subscription.unsubscribe()
  }, [])

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
  const route = path === '#feedback' ? 'feedbacks' : path.slice(1)
  const screen = ['home', 'setup', 'about', 'feedbacks', 'login', 'register', 'account'].includes(route)
    ? route
    : 'home'
  const user = session?.user
  const links = user || checkingSession ? navItems.slice(0, 3) : navItems

  function requestLogout() {
    setLogoutError('')
    setConfirmingLogout(true)
    logoutDialog.current.showModal()
  }

  async function logOut() {
    if (!user || loggingOut) return
    setLoggingOut(true)
    setLogoutError('')
    try {
      const { error } = await supabase.auth.signOut({ scope: 'local' })
      if (error) throw error
      window.location.hash = 'login'
    } catch {
      setLogoutError('Could not log out. Please try again.')
    } finally {
      setLoggingOut(false)
    }
  }

  return (
    <div className="site-layout">
      <header className="site-header">
        <div className="shell header-inner">
          <a className="brand" href="#home"><Brand /></a>
          <nav className="site-nav" aria-label="Main navigation">
            {links.map(([target, label]) => (
              <a
                key={target}
                className={target === 'register' ? 'button button-outline' : 'nav-link'}
                href={`#${target}`}
                aria-current={screen === target ? 'page' : undefined}
              >
                {label}
              </a>
            ))}
            {user && (
              <div className="nav-account-actions">
                <ProfileLink user={user} current={screen === 'account'} />
                <button className="button button-outline nav-logout" type="button" disabled={loggingOut} onClick={requestLogout}>
                  {loggingOut ? 'Logging out…' : 'Log out'}
                </button>
              </div>
            )}
          </nav>
        </div>
      </header>
      <main id="home" className="shell">
        {user && logoutError && !confirmingLogout && <p className="form-status account-error" role="alert">{logoutError}</p>}
        {screen === 'setup' && <Setup />}
        {screen === 'about' && <AboutPage />}
        {screen === 'feedbacks' && (
          <SiteFeedbackPage key={user?.id ?? 'guest'} accessToken={session?.access_token}
            accountName={user?.user_metadata?.full_name} />
        )}
        {['login', 'register', 'account'].includes(screen) && (
          <AccountPage key={screen} mode={screen} user={user} checkingSession={checkingSession}
            loggingOut={loggingOut} onRequestLogout={requestLogout} onLogout={logOut} />
        )}
        {screen === 'home' && (
          <>
            <section className="hero" aria-labelledby="home-title">
              <div className="hero-copy">
                <h1 id="home-title">Practice for the job <em>you want.</em></h1>
                <p className="hero-description">Practice with questions tailored to your CV, GitHub, portfolio, and target role. Pick up where your last interview left off.</p>
                <a className="button button-primary" href="#setup">Set up an interview <span aria-hidden="true">→</span></a>
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
                    {kind === 'voice' && <Waveform />}
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
      <dialog className="review-dialog logout-dialog" ref={logoutDialog} aria-labelledby="logout-title"
        onClose={() => { setConfirmingLogout(false); setLogoutError('') }}
        onCancel={event => { if (loggingOut) event.preventDefault() }}>
        <h2 id="logout-title">Log out of InterviewLoop?</h2>
        {logoutError && <p className="form-status account-error" role="alert">{logoutError}</p>}
        <div className="logout-dialog-actions">
          <button className="button button-outline" type="button" disabled={loggingOut} onClick={() => logoutDialog.current.close()}>Cancel</button>
          <button className="button button-primary" type="button" disabled={loggingOut} onClick={logOut}>{loggingOut ? 'Logging out…' : 'Log out'}</button>
        </div>
      </dialog>
    </div>
  )
}

export default App
