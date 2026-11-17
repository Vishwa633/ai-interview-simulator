import { useEffect, useRef, useState } from 'react'

const practiceSteps = [
  ['Choose a role', <>Log in and select <strong>Set up an interview</strong>. Paste the job description so the interviewer knows which skills and responsibilities to ask about.</>],
  ['Add your experience', <>Optionally upload a CV as a PDF up to 4 MB, share your public GitHub profile or portfolio, or write project notes about what you built and your part in it. Select <strong>Start practice interview</strong> to get your first question.</>],
  ['Listen to the interviewer', <>Read the question on screen or select <strong>Listen to question</strong> to hear the AI interviewer ask it aloud in English. Select <strong>Stop audio</strong> to stop playback.</>],
  ['Type or record your answer', <>Write your answer in English or select <strong>Record answer</strong> and allow microphone access. You can record up to 90 seconds. The timer tracks how long you have recorded, and the mic level shows how loudly your microphone picks you up. Select <strong>Stop &amp; transcribe</strong> to put a transcript in the answer box, then check and edit it.</>],
  ['Submit and get feedback', <>Select <strong>Submit answer</strong> to save your response. The AI uses your setup and previous answers to ask follow-up questions. Check <strong>Interview progress</strong> for the number of answers you’ve submitted and the latest feedback in English.</>],
  ['Pause and resume', <>Select <strong>Pause &amp; save</strong> to keep your place and any draft. Return through <strong>Resume interview</strong> or open that session in <strong>Practice history</strong> to continue with your saved setup and answers.</>],
  ['Finish and review', <>Select <strong>Finish interview</strong> whenever you’re done. Your summary covers strengths, gaps, and what to practice next. Use <strong>Practice history</strong> to reopen the session and review its questions and saved answers.</>],
  ['Practice a skill again', <>Select <strong>Use past feedback</strong> from setup or history to use relevant feedback from completed interviews. Upload the same CV if you used one before. This helps the interviewer choose topics to revisit.</>],
  ['Start a fresh interview', <>Choose <strong>Start fresh</strong> from setup or <strong>New practice</strong> from history to enter a new job description and experience. The AI starts with the new setup, and your previous sessions are still available in history.</>],
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
            <li>Practice answering in English and get specific feedback in English.</li>
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
        <a className="button button-primary" href="#setup">Set up an interview <span aria-hidden="true">→</span></a>
        <p className="page-note">Want to share feedback about the site? Open <a className="history-text-link" href="#feedbacks">Feedbacks</a> to read public reviews or write your own after logging in.</p>
      </section>
    </section>
  )
}

const ratings = ['Poor', 'Fair', 'Okay', 'Good', 'Excellent']

function Stars({ rating }) {
  return <span className="review-stars" role="img" aria-label={`${rating} out of 5 stars`}><span aria-hidden="true">{'★'.repeat(rating)}<span>{'★'.repeat(5 - rating)}</span></span></span>
}

export function SiteFeedbackPage({ accessToken, accountName }) {
  const [reviews, setReviews] = useState([])
  const [ownedIds, setOwnedIds] = useState(() => new Set())
  const [loadState, setLoadState] = useState('loading')
  const [loadAttempt, setLoadAttempt] = useState(0)
  const [editedName, setEditedName] = useState(null)
  const [rating, setRating] = useState(0)
  const [comment, setComment] = useState('')
  const [action, setAction] = useState(null)
  const [formError, setFormError] = useState('')
  const [notice, setNotice] = useState('')
  const [saving, setSaving] = useState(false)
  const dialog = useRef(null)
  const listRequest = useRef(null)
  const canReview = Boolean(accessToken)
  const isEditing = action?.type === 'edit'
  const isDeleting = action?.type === 'delete'
  const defaultName = typeof accountName === 'string' && !accountName.includes('@')
    ? Array.from(accountName.trim()).slice(0, 60).join('')
    : ''
  const name = editedName ?? defaultName

  useEffect(() => {
    if (action && canReview && !dialog.current.open) dialog.current.showModal()
  }, [action, canReview])

  useEffect(() => {
    const request = new AbortController()
    listRequest.current = request
    const signal = AbortSignal.any([request.signal, AbortSignal.timeout(18000)])
    const options = { signal, cache: 'no-store' }
    fetch('/api/feedback', options)
      .then(response => {
        if (!response.ok) throw new Error('Could not load reviews')
        return response.json()
      })
      .then(data => {
        if (request.signal.aborted) return
        setReviews(data)
        setLoadState('ready')
      })
      .catch(() => { if (!request.signal.aborted) setLoadState('error') })

    if (accessToken) {
      fetch('/api/feedback/mine', {
        ...options,
        headers: { Authorization: `Bearer ${accessToken}` },
      }).then(response => response.ok ? response.json() : null)
        .then(ids => {
          if (!request.signal.aborted && Array.isArray(ids)) setOwnedIds(new Set(ids))
        })
        .catch(() => {
          // Public reviews are available even if ownership cannot be loaded.
        })
    }
    return () => request.abort()
  }, [accessToken, loadAttempt])

  function openReview(type, review = null) {
    setEditedName(review?.name ?? null)
    setRating(review?.rating ?? 0)
    setComment(review?.comment ?? '')
    setNotice('')
    setFormError('')
    setAction({ type, id: review?.id })
  }

  async function saveReview(event) {
    event.preventDefault()
    if (!canReview || saving || !action) return
    if (!isDeleting && (!rating || !comment.trim())) return
    if (!isDeleting && name.includes('@')) {
      setFormError('Use a display name, such as your first name.')
      return
    }
    setSaving(true)
    setFormError('')

    try {
      const url = action.id ? `/api/feedback/${action.id}` : '/api/feedback'
      const headers = { Authorization: `Bearer ${accessToken}` }
      const method = isDeleting ? 'DELETE' : isEditing ? 'PATCH' : 'POST'
      const options = { method, headers }
      if (!isDeleting) {
        headers['Content-Type'] = 'application/json'
        options.body = JSON.stringify({ name, rating, comment: comment.trim() })
      }
      const response = await fetch(url, options)
      if (!response.ok) {
        if (response.status === 401) {
          setFormError('Log in again to manage reviews.')
          return
        }
        if (response.status === 404 && action.id) {
          setFormError('This review is no longer available.')
          setLoadAttempt(previous => previous + 1)
          return
        }
        throw new Error('Could not save feedback')
      }
      const review = isDeleting ? null : await response.json()
      listRequest.current?.abort()
      setOwnedIds(previous => {
        const next = new Set(previous)
        if (isDeleting) next.delete(action.id)
        else next.add(review.id)
        return next
      })
      setReviews(previous => {
        if (isDeleting) return previous.filter(item => item.id !== action.id)
        if (isEditing) return previous.map(item => item.id === review.id ? review : item)
        return [review, ...previous]
      })
      setLoadAttempt(previous => previous + 1)
      dialog.current?.close()
      setNotice(isDeleting ? 'Review deleted.' : isEditing ? 'Review updated.' : 'Your review is now public.')
    } catch {
      setFormError('Could not save your changes. Please try again.')
    } finally {
      setSaving(false)
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
          <button className="button button-primary" type="button" disabled={!canReview} onClick={() => openReview('create')}>
            Write a review <span aria-hidden="true">↗</span>
          </button>
          {!canReview && <p className="review-login-hint"><a href="#login">Log in</a> to write a review.</p>}
        </div>
        <div className="reviews-summary">
          <div className="review-score"><strong>{count ? average.toFixed(1) : '—'}</strong><span>/ 5</span></div>
          <Stars rating={Math.round(average)} />
          <p>{loadState === 'ready' ? `${count} public ${count === 1 ? 'review' : 'reviews'}` : 'Public reviews'}</p>
        </div>
      </header>

      <section className="reviews-section" aria-labelledby="review-list-title">
        <h2 id="review-list-title">Latest reviews</h2>
        {notice && <p className="review-notice" role="status">{notice}</p>}
        {loadState === 'loading' && <p className="review-notice" role="status">Loading reviews…</p>}
        {loadState === 'error' && (
          <div className="review-notice review-load-error">
            <p role="status">Reviews could not be loaded.</p>
            <button className="button button-outline" type="button" onClick={() => {
              setLoadState('loading')
              setLoadAttempt(previous => previous + 1)
            }}>Try again</button>
          </div>
        )}
        {count > 0 && (
          <ul className="reviews-grid">
            {reviews.map(review => (
              <li className="review-card" key={review.id}>
                <Stars rating={review.rating} />
                <blockquote>{review.comment}</blockquote>
                <div className="review-card-footer">
                  <div className="review-author"><span aria-hidden="true">{Array.from(review.name)[0]?.toUpperCase()}</span>{review.name}</div>
                  {canReview && ownedIds.has(review.id) && (
                    <div className="review-card-actions">
                      <button className="button button-outline review-icon-button" type="button" aria-label="Edit review" title="Edit review" onClick={() => openReview('edit', review)}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="m16 4 4 4M4 20l4.5-1 11-11a2.8 2.8 0 0 0-4-4l-11 11L4 20Z" />
                        </svg>
                      </button>
                      <button className="button button-danger review-icon-button" type="button" aria-label="Delete review" title="Delete review" onClick={() => openReview('delete', review)}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v5m4-5v5" />
                        </svg>
                      </button>
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
        {loadState === 'ready' && count === 0 && (
          <div className="reviews-empty">
            <p>No reviews yet. Be the first to share your experience.</p>
          </div>
        )}
      </section>

      <dialog className="review-dialog" ref={dialog} aria-labelledby="write-review-title"
        onClose={() => setAction(null)} onCancel={event => { if (saving) event.preventDefault() }}>
        <div className="review-dialog-title">
          <h2 id="write-review-title">{isDeleting ? 'Delete review?' : isEditing ? 'Edit your review' : 'Write a review'}</h2>
          <button className="review-close" type="button" aria-label="Close review dialog" disabled={saving} onClick={() => dialog.current.close()}>×</button>
        </div>
        {isDeleting ? (
          <form className="page-form review-form" onSubmit={saveReview}>
            <p className="feedback-storage">Your review will be removed from the public list.</p>
            {formError && <p className="form-status account-error" role="alert">{formError}</p>}
            <div className="review-actions">
              <button className="button button-outline" type="button" disabled={saving} onClick={() => dialog.current.close()}>Cancel</button>
              <button className="button button-danger" type="submit" disabled={saving}>{saving ? 'Deleting…' : 'Delete review'}</button>
            </div>
          </form>
        ) : (
          <form className="page-form review-form" onSubmit={saveReview}>
            <p className="feedback-storage">Your display name, rating, and message will be public. Leave out private details.</p>
            <label>Display name <small>Optional</small><input maxLength={60} placeholder="Anonymous" value={name} onChange={event => setEditedName(event.target.value)} /></label>
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
            {formError && <p className="form-status account-error" role="alert">{formError}</p>}
            <button className="button button-primary" type="submit" disabled={!canReview || saving || !rating || !comment.trim()}>
              {saving ? 'Saving…' : isEditing ? 'Save changes' : 'Publish review'}
            </button>
          </form>
        )}
      </dialog>
    </section>
  )
}
