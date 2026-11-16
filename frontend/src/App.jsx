import { useEffect, useRef, useState } from 'react'
import interviewerImage from './assets/ai-interviewer.jpeg'
import { AboutPage, SiteFeedbackPage } from './Pages.jsx'
import { AccountPage } from './AccountPage.jsx'
import { PracticeHistoryPage, SavedPracticePage } from './PracticePages.jsx'
import { readCvPdf, requestInterview } from './interview-api.js'
import { supabase } from './supabase.js'
import './App.css'

const featureCards = [
  { kind: 'voice', title: 'Voice practice', icon: '∿', description: 'Answer English interview questions out loud and practice realistic follow-ups.' },
  { kind: 'profile', title: 'Questions about your work', icon: '≡', description: 'Build your interview around your CV, GitHub, portfolio, and the role.' },
  { kind: 'memory', title: 'Memory across sessions', icon: '↻', description: 'Get feedback on your answers and revisit topics you found difficult.' },
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
  upload: 'M12 16V4m-5 5 5-5 5 5M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3',
  cv: 'M13 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V10Zm0 0v7h7M8 14h8m-8 3h6',
  github: 'M8 6 2 12l6 6m8-12 6 6-6 6M14 4l-4 16',
  job: 'M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M4 7h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2Zm-2 6h20m-11-1h2v3h-2z',
  portfolio: 'M3 7a2 2 0 0 1 2-2h4l3 3h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Zm0 5h18',
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

function Setup({ accessToken, checkingSession, fresh }) {
  const [generating, setGenerating] = useState(false)
  const [cvName, setCvName] = useState('')
  const [error, setError] = useState('')
  const request = useRef(null)
  const setupTitle = useRef(null)
  const cvInput = useRef(null)
  useEffect(() => () => request.current?.abort(), [])
  useEffect(() => { setupTitle.current?.focus() }, [])

  async function startInterview(event) {
    event.preventDefault()
    if (!accessToken || request.current) return
    const form = new FormData(event.currentTarget)
    const jobDescription = form.get('jobDescription').trim()
    const projectNotes = form.get('projectNotes').trim()
    const githubUrl = form.get('githubUrl').trim()
    const portfolioUrl = form.get('portfolioUrl').trim()
    if (jobDescription.length < 30) {
      setError('Enter at least 30 characters describing the role.')
      event.currentTarget.elements.jobDescription.focus()
      return
    }

    const controller = new AbortController()
    request.current = controller
    setError('')
    setGenerating(true)
    try {
      const cvFile = form.get('cv')
      const cvPdf = await readCvPdf(cvFile)
      if (controller.signal.aborted) return
      const record = await requestInterview('/first-question', {
        jobDescription, projectNotes, cvPdf, cvName: cvFile?.name, githubUrl, portfolioUrl, usePracticeMemory: false,
      }, accessToken, controller.signal)
      if (!record?.id) throw new Error('Could not open the saved question. Check Practice history.')
      if (!controller.signal.aborted) window.location.hash = `practice/${record.id}`
    } catch (error) {
      if (!controller.signal.aborted) setError(error.message)
    } finally {
      request.current = null
      if (!controller.signal.aborted) setGenerating(false)
    }
  }
  return (
    <section className="panel setup-page" aria-labelledby="setup-title">
      <header className="setup-heading">
        <div>
          <h1 id="setup-title" ref={setupTitle} tabIndex={-1}>Set up your <em>interview.</em></h1>
          <p className="panel-intro">{fresh
            ? 'Add the details you want to use for this new interview.'
            : 'Add your experience and the role you want to practice for.'}</p>
        </div>
        {fresh ? <div className="setup-heading-actions"><a className="button button-outline" href="#setup">Back to interview setup</a></div>
          : <div className="setup-heading-visual" aria-hidden="true"><Waveform /></div>}
      </header>
      <form className="setup-form" onSubmit={startInterview}>
        <div className="setup-fields">
          <SetupField id="setup-cv" title="CV" kind="cv" help="Upload a PDF up to 4 MB to tailor your first question to your skills and projects." optional>
            <div className="setup-cv-picker">
              <div className="setup-upload">
                <input id="setup-cv" name="cv" type="file" accept=".pdf,application/pdf" ref={cvInput}
                  disabled={generating} aria-describedby="setup-cv-help"
                  onChange={event => { setCvName(event.target.files[0]?.name ?? ''); setError('') }} />
                <SetupIcon kind="upload" />
                <strong>{cvName ? 'Change PDF' : 'Choose a PDF'}</strong>
                {cvName && <small role="status">{cvName}</small>}
              </div>
              {cvName && <button className="button button-outline setup-cv-remove" type="button" disabled={generating}
                onClick={() => {
                  cvInput.current.value = ''
                  setCvName('')
                  setError('')
                  cvInput.current.focus()
                }}>Remove CV</button>}
            </div>
          </SetupField>
          <SetupField id="setup-github" title="GitHub profile" kind="github" help="Use public repositories to tailor your first question to your projects." optional>
            <input id="setup-github" name="githubUrl" type="url" maxLength={100} readOnly={generating}
              placeholder="https://github.com/your-name" aria-describedby="setup-github-help" />
          </SetupField>
          <SetupField id="setup-job" title="Job description" kind="job" help="Include the responsibilities and skills the role asks for.">
            <textarea id="setup-job" name="jobDescription" rows="5" required minLength={30} maxLength={4000}
              readOnly={generating} placeholder="Paste the job description…" aria-describedby="setup-job-help" />
          </SetupField>
          <SetupField id="setup-portfolio" title="Portfolio" kind="portfolio" help="Share a public page that describes your projects." optional>
            <input id="setup-portfolio" name="portfolioUrl" type="url" maxLength={1000} readOnly={generating}
              placeholder="https://your-portfolio.com" aria-describedby="setup-portfolio-help" />
            <div className="setup-portfolio-notes">
              <label htmlFor="setup-project-notes">Project notes <span>Optional</span></label>
              <textarea id="setup-project-notes" name="projectNotes" rows="5" maxLength={1500} readOnly={generating}
                placeholder="What did you build, and what part did you work on?" />
            </div>
          </SetupField>
        </div>
        <div className="setup-actions">
          {checkingSession ? <p>Checking your session…</p> : accessToken
            ? <p>Your setup, including any CV and links, is saved privately so you can pause and resume.</p>
            : <p><a href="#login">Log in</a> to generate a practice question.</p>}
          <button className="button button-primary" type="submit" disabled={!accessToken || generating}>
            {generating ? 'Generating question…' : 'Start practice interview'} {!generating && <span aria-hidden="true">→</span>}
          </button>
        </div>
        {error && <p className="setup-error" role="alert">{error}</p>}
      </form>
    </section>
  )
}

function InterviewSetup({ accessToken, checkingSession, fresh }) {
  const [saved, setSaved] = useState(undefined)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (fresh || !accessToken) return
    const controller = new AbortController()
    requestInterview('/resume', undefined, accessToken, controller.signal)
      .then(record => { if (!controller.signal.aborted) setSaved(record) })
      .catch(error => { if (!controller.signal.aborted) setError(error.message) })
    return () => controller.abort()
  }, [accessToken, fresh, attempt])

  if (fresh || (!checkingSession && (!accessToken || saved === null))) {
    return <Setup accessToken={accessToken} checkingSession={checkingSession} fresh={fresh} />
  }

  return (
    <section className="panel setup-page" aria-labelledby="saved-setup-title">
      <header className="setup-heading">
        <div>
          <h1 id="saved-setup-title">Your <em>interview.</em></h1>
          {saved && <p className="panel-intro">{saved.completed ? 'Your last completed interview' : 'Pick up where you left off.'}</p>}
        </div>
        <div className="setup-heading-actions">
          <a className="button button-outline" href="#setup/new">Start fresh</a>
          {saved && <a className="button button-primary" href={`#practice/${saved.id}`}>
            {saved.completed ? 'View interview' : 'Resume interview'} <span aria-hidden="true">→</span>
          </a>}
        </div>
      </header>

      {error ? (
        <div className="history-notice">
          <p role="alert">{error}</p>
          <button className="button button-outline" type="button" onClick={() => {
            setError('')
            setAttempt(value => value + 1)
          }}>Try again</button>
        </div>
      ) : saved ? (
        <dl className="setup-form saved-setup-details">
          <div className="setup-row"><dt>CV</dt><dd>{saved.hasCv ? saved.cvName || 'Saved CV (PDF)' : 'No CV attached'}</dd></div>
          <div className="setup-row"><dt>GitHub profile</dt><dd>{saved.githubUrl || 'No GitHub profile added'}</dd></div>
          <div className="setup-row"><dt>Job description</dt><dd>{saved.jobDescription}</dd></div>
          <div className="setup-row"><dt>Portfolio</dt><dd>{saved.portfolioUrl || 'No portfolio added'}</dd></div>
          {saved.projectNotes && <div className="setup-row"><dt>Project notes</dt><dd>{saved.projectNotes}</dd></div>}
        </dl>
      ) : <p role="status">Loading your saved interview…</p>}
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
  const practiceId = /^practice\/([1-9]\d{0,18})$/.exec(route)?.[1]
  const freshSetup = route === 'setup/new'
  const screen = practiceId ? 'practice' : freshSetup ? 'setup' : ['home', 'setup', 'about', 'feedbacks', 'login', 'register', 'account', 'history'].includes(route)
    ? route
    : 'home'
  const user = session?.user
  const publicLinks = navItems.slice(0, 3)
  const links = user ? [...publicLinks, ['history', 'Practice history']] : checkingSession ? publicLinks : navItems

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
        {screen === 'setup' && <InterviewSetup key={`${user?.id ?? 'guest'}:${freshSetup}`} fresh={freshSetup}
          accessToken={session?.access_token} checkingSession={checkingSession} />}
        {screen === 'practice' && <SavedPracticePage key={`${user?.id ?? 'guest'}:${practiceId}`} id={practiceId}
          accessToken={session?.access_token} checkingSession={checkingSession} />}
        {screen === 'history' && <PracticeHistoryPage key={user?.id ?? 'guest'}
          accessToken={session?.access_token} checkingSession={checkingSession} />}
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
