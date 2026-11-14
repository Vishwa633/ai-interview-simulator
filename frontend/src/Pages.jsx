import { useEffect, useRef, useState } from 'react'
import interviewerImage from './assets/ai-interviewer.jpeg'

const practiceSteps = [
  ['Add your experience', 'Upload your CV and add your GitHub profile and portfolio. These give the interviewer real projects to ask you about.'],
  ['Choose the role', 'Paste the job description so the practice questions focus on the skills and responsibilities you will likely need to discuss.'],
  ['Practice the interview', 'Answer questions in English. In voice mode you will hear each question and speak your answer. The interviewer can ask follow-ups about what you said.'],
  ['Review your answers', 'Read feedback in Sinhala, see what you explained clearly, and find one thing to improve before the next interview.'],
  ['Build on your progress', 'A later session will use relevant notes from your earlier practice to ask a new question about a topic you want to improve.'],
]

export function AboutPage() {
  return (
    <section className="panel wide-panel" aria-labelledby="about-title">
      <header className="wide-intro">
        <h1 id="about-title">About InterviewLoop</h1>
        <p className="panel-intro">InterviewLoop helps you prepare for software jobs and internships. It is designed to turn your CV, GitHub projects, portfolio, and a job description into a mock interview about the work you have done and the role you want.</p>
      </header>

      <div className="about-overview">
        <section className="detail-card">
          <h2>What we want to make possible</h2>
          <p>We want students and first-time job seekers to be able to practice a realistic interview even when they have limited access to coaching. Our goal is to help you explain your work clearly and walk into the real interview knowing what you want to say.</p>
        </section>
        <section className="detail-card">
          <h2>What you get out of it</h2>
          <ul>
            <li>Practice explaining your own projects and the choices you made.</li>
            <li>Rehearse answers in English and review specific feedback in Sinhala.</li>
            <li>Know what to work on next and revisit it in a later session.</li>
          </ul>
        </section>
      </div>

      <section className="how-practice" aria-labelledby="practice-steps-title">
        <h2 id="practice-steps-title">How to use InterviewLoop</h2>
        <ol className="process-list">
          {practiceSteps.map(([title, description], index) => (
            <li key={title}>
              <span className="process-number" aria-hidden="true">{index + 1}</span>
              <div><h3>{title}</h3><p>{description}</p></div>
            </li>
          ))}
        </ol>
        <p className="page-note">Available now: a two-question text demo with example feedback. Personalized voice practice and interview history are in development.</p>
        <a className="button button-primary" href="#sample">Try the sample interview <span aria-hidden="true">→</span></a>
      </section>
    </section>
  )
}

export function AccountPage({ mode }) {
  const isLogin = mode === 'login'
  const [showPassword, setShowPassword] = useState(false)
  const [status, setStatus] = useState('')

  function previewAccount(event) {
    event.preventDefault()
    setStatus(isLogin ? 'Sign-in will be available when account services are connected.' : 'Account creation will be available when account services are connected.')
  }

  return (
    <section className="panel account-panel" aria-labelledby="account-title">
      <div className="account-visual">
        <img src={interviewerImage} alt="An AI interviewer framed by cyan and violet audio displays" />
        <div className="account-visual-copy">
          <p>Practice for the job <em>you want.</em></p>
          <a className="sample-link" href="#sample">Try a sample interview <span aria-hidden="true">↗</span></a>
        </div>
      </div>
      <div className="form-card account-card">
        <nav className="account-nav" aria-label="Account">
          <a href="#login" aria-current={isLogin ? 'page' : undefined}>Login</a>
          <a href="#register" aria-current={isLogin ? undefined : 'page'}>Register</a>
        </nav>
        <h1 id="account-title">{isLogin ? 'Welcome back.' : 'Create an account.'}</h1>
        <p className="panel-intro">{isLogin ? 'Sign in to return to your interview practice.' : 'Create a profile for your interview practice and progress.'}</p>
        <form className="page-form" onSubmit={previewAccount}>
          {!isLogin && <label>Full name<input autoComplete="name" placeholder="Your full name" required /></label>}
          <label>Email address<input type="email" autoComplete="email" placeholder="you@example.com" required /></label>
          <div>
            <label htmlFor="account-password">Password</label>
            <div className="password-field">
              <input id="account-password" type={showPassword ? 'text' : 'password'} autoComplete={isLogin ? 'current-password' : 'new-password'} minLength={isLogin ? undefined : 8} placeholder={isLogin ? 'Enter your password' : 'At least 8 characters'} required />
              <button type="button" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? 'Hide password' : 'Show password'}>{showPassword ? 'Hide' : 'Show'}</button>
            </div>
          </div>
          <button className="button button-primary form-submit" type="submit">{isLogin ? 'Log in' : 'Create account'}</button>
          {status && <p className="form-status" role="status">{status}</p>}
        </form>
        <p className="page-note account-note">Account preview. Use sample details to try the form.</p>
      </div>
    </section>
  )
}

const ratings = ['Poor', 'Fair', 'Okay', 'Good', 'Excellent']

function Stars({ rating }) {
  return <span className="review-stars" role="img" aria-label={`${rating} out of 5 stars`}><span aria-hidden="true">{'★'.repeat(rating)}<span>{'★'.repeat(5 - rating)}</span></span></span>
}

export function SiteFeedbackPage() {
  const [reviews, setReviews] = useState([])
  const [loadState, setLoadState] = useState('loading')
  const [name, setName] = useState('')
  const [rating, setRating] = useState(0)
  const [comment, setComment] = useState('')
  const [status, setStatus] = useState('')
  const [publishing, setPublishing] = useState(false)
  const dialog = useRef(null)

  useEffect(() => {
    const request = new AbortController()
    fetch('/api/feedback', { signal: request.signal })
      .then(response => {
        if (!response.ok) throw new Error('Could not load reviews')
        return response.json()
      })
      .then(data => { setReviews(data); setLoadState('ready') })
      .catch(error => { if (error.name !== 'AbortError') setLoadState('error') })
    return () => request.abort()
  }, [])

  async function publishFeedback(event) {
    event.preventDefault()
    if (!rating || !comment.trim() || publishing) return
    setPublishing(true)
    setStatus('')

    try {
      const response = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, rating, comment: comment.trim() }),
      })
      if (!response.ok) throw new Error('Could not publish feedback')
      const review = await response.json()
      setReviews(previous => [review, ...previous.filter(item => item.id !== review.id)])
      setLoadState('ready')
      setRating(0)
      setName('')
      setComment('')
      dialog.current.close()
      setStatus('Your review is now public.')
    } catch {
      setStatus('Your review could not be published. Check the display name and try again.')
    } finally {
      setPublishing(false)
    }
  }

  const count = reviews.length
  const average = count ? reviews.reduce((sum, review) => sum + review.rating, 0) / count : 0

  return (
    <section className="panel wide-panel reviews-page" aria-labelledby="feedback-title">
      <header className="reviews-hero">
        <div>
          <h1 id="feedback-title">Community feedback</h1>
          <p className="panel-intro">See what people think of InterviewLoop and share your experience.</p>
          <button className="button button-primary" type="button" disabled={loadState !== 'ready'} onClick={() => { setStatus(''); dialog.current.showModal() }}>Write a review <span aria-hidden="true">↗</span></button>
        </div>
        <div className="reviews-summary">
          <div className="review-score"><strong>{count ? average.toFixed(1) : '—'}</strong><span>/ 5</span></div>
          <Stars rating={Math.round(average)} />
          <p>{count} public {count === 1 ? 'review' : 'reviews'}</p>
        </div>
      </header>

      <section className="reviews-section" aria-labelledby="review-list-title">
        <h2 id="review-list-title">Latest reviews</h2>
        {status === 'Your review is now public.' && <p className="review-notice" role="status">{status}</p>}
        {loadState === 'loading' && <p className="review-notice" role="status">Loading reviews…</p>}
        {loadState === 'error' && <p className="review-notice" role="status">Reviews could not be loaded. Refresh the page to try again.</p>}
        {loadState === 'ready' && (
          count ? (
            <ul className="reviews-grid">
              {reviews.map(review => (
                <li className="review-card" key={review.id}>
                  <Stars rating={review.rating} />
                  <blockquote>{review.comment}</blockquote>
                  <div className="review-author"><span aria-hidden="true">{Array.from(review.name)[0]?.toUpperCase()}</span>{review.name}</div>
                </li>
              ))}
            </ul>
          ) : (
            <div className="reviews-empty">
              <p>No reviews yet. Be the first to share your experience.</p>
            </div>
          )
        )}
      </section>

      <dialog className="review-dialog" ref={dialog} aria-labelledby="write-review-title">
        <div className="review-dialog-title">
          <h2 id="write-review-title">Write a review</h2>
          <button className="review-close" type="button" aria-label="Close review form" onClick={() => dialog.current.close()}>×</button>
        </div>
        <form className="page-form review-form" onSubmit={publishFeedback}>
          <p className="feedback-storage">Your rating and message will be public. Leave out private details.</p>
          <label>Display name <small>Optional</small><input maxLength={60} placeholder="Anonymous" value={name} onChange={event => setName(event.target.value)} /></label>
          <fieldset className="rating-field">
            <legend>Rating</legend>
            <div className="rating-options">
              {ratings.map((label, index) => (
                <label className={`rating-option${rating > index ? ' rating-filled' : ''}`} key={label}>
                  <input type="radio" name="rating" value={index + 1} checked={rating === index + 1} onChange={() => setRating(index + 1)} required />
                  <span aria-hidden="true">★</span>
                  <span className="visually-hidden">{index + 1} out of 5 · {label}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <label>Your review<textarea rows="4" maxLength={1000} required value={comment} onChange={event => setComment(event.target.value)} /></label>
          {status && <p className="form-status" role="status">{status}</p>}
          <button className="button button-primary" type="submit" disabled={publishing || !rating || !comment.trim()}>{publishing ? 'Publishing…' : 'Publish review'}</button>
        </form>
      </dialog>
    </section>
  )
}
