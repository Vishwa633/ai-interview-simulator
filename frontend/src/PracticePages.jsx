import { useEffect, useRef, useState } from 'react'
import interviewerImage from './assets/ai-interviewer.jpeg'

import { AdaptivePractice } from './AdaptivePractice.jsx'
import { requestInterview } from './interview-api.js'

function PracticeAnswerForm({ answer, pending, disabled, error, onSubmit, actionLabel, pendingLabel }) {
  const id = 'practice-answer'
  return (
    <form className="practice-answer" onSubmit={onSubmit}>
      <label htmlFor={id}>Your answer</label>
      <textarea id={id} name="answer" rows="5" required minLength={20} maxLength={3000}
        defaultValue={answer ?? ''} readOnly={pending || Boolean(answer)}
        placeholder="Describe the situation, what you did, and the outcome." aria-describedby={`${id}-help`} />
      <p className="practice-answer-help" id={`${id}-help`}>{answer
        ? 'Your answer is saved to your practice history.'
        : 'Write your answer in English. It will be saved when you submit.'}</p>
      {error && <p className="practice-error" role="alert">{error}</p>}
      <button className="button button-primary" type="submit" disabled={pending || disabled}>
        {pending ? pendingLabel : actionLabel} {!pending && <span aria-hidden="true">→</span>}
      </button>
    </form>
  )
}

function PracticeInterview({ session, accessToken }) {
  const [pending, setPending] = useState(false)
  const [record, setRecord] = useState(session)
  const [error, setError] = useState('')
  const request = useRef(null)
  const stepTitle = useRef(null)
  const steps = [
    { question: record.question, answer: record.answer, action: 'answer' },
    { question: record.feedback?.followUpQuestion, answer: record.followUpAnswer, action: 'follow-up-answer' },
    ...record.plannedQuestions.map((question, index) => ({
      question, answer: record.plannedAnswers[index], action: 'planned-answer', index,
    })),
  ]
  const currentIndex = !record.feedback ? 0
    : !record.followUpAnswer ? 1
      : record.summary ? -1 : Math.min(steps.length - 1, 2 + record.plannedAnswers.length)
  const current = steps[currentIndex]
  const isLast = currentIndex === steps.length - 1
  const actionLabel = isLast ? 'Get final summary' : currentIndex === 0 ? 'Get feedback and continue' : 'Save and continue'
  const pendingLabel = isLast ? 'Preparing summary…' : currentIndex === 0 ? 'Reviewing answer…' : 'Saving answer…'
  const completed = currentIndex === -1 ? steps : steps.slice(0, currentIndex)

  useEffect(() => () => request.current?.abort(), [])
  useEffect(() => {
    stepTitle.current?.focus()
  }, [currentIndex])

  async function submitAnswer(event) {
    event.preventDefault()
    if (!accessToken || request.current || !current) return
    const answer = new FormData(event.currentTarget).get('answer').trim()
    if (answer.length < 20) {
      setError('Write at least 20 characters before submitting.')
      event.currentTarget.elements.answer.focus()
      return
    }
    const controller = new AbortController()
    request.current = controller
    setPending(true)
    setError('')
    try {
      const result = await requestInterview(`/${record.id}/${current.action}`, { answer, index: current.index }, accessToken, controller.signal)
      if (!controller.signal.aborted) setRecord(result)
    } catch (error) {
      if (!controller.signal.aborted) {
        if (error.record) setRecord(error.record)
        setError(error.message)
      }
    } finally {
      request.current = null
      if (!controller.signal.aborted) setPending(false)
    }
  }

  return (
    <section className="panel practice-page" aria-labelledby="practice-title">
      <header className="practice-toolbar">
        <h1 id="practice-title">Practice interview</h1>
        <div className="practice-toolbar-actions">
          <a className="button button-outline practice-edit" href="#history">Practice history</a>
          <a className="button button-outline practice-edit" href="#setup">Interview setup</a>
        </div>
      </header>
      {current && (
        <div className="practice-stage">
          <figure className="practice-portrait">
            <img src={interviewerImage} alt="" />
            <figcaption><span aria-hidden="true" /> AI interviewer</figcaption>
          </figure>
          <div>
            <h2 className="practice-step-title" ref={stepTitle} tabIndex={-1}>
              Question {currentIndex + 1} of {steps.length}{currentIndex === 1 ? ' · Follow-up' : ''}
            </h2>
            <div className="practice-copy"><p>{current.question}</p></div>
            <PracticeAnswerForm key={currentIndex} answer={current.answer} pending={pending} disabled={!accessToken}
              error={error} onSubmit={submitAnswer} actionLabel={actionLabel} pendingLabel={pendingLabel} />
          </div>
        </div>
      )}
      {record.summary && (
        <section className="practice-feedback" aria-labelledby="practice-summary-title">
          <h2 id="practice-summary-title" ref={stepTitle} tabIndex={-1}>Final practice summary</h2>
          <div className="practice-feedback-notes">
            <div><h3>Overall feedback</h3><p>{record.summary.overview}</p></div>
            <div><h3>What to practice next</h3><p>{record.summary.nextStep}</p></div>
          </div>
        </section>
      )}
      {completed.length > 0 && (
        <section className="practice-feedback" aria-labelledby="practice-responses-title">
          <h2 id="practice-responses-title">Saved answers</h2>
          <div className="practice-responses">
            {completed.map(({ question, answer }, index) => (
              <details key={index} open={index === 0 && currentIndex === 1}>
                <summary>Question {index + 1}{index === 1 ? ' · Follow-up' : ''}</summary>
                <h3>{question}</h3>
                <p>{answer}</p>
                {index === 0 && record.feedback && (
                  <div className="practice-feedback-notes">
                    <div><h3>What you did well</h3><p>{record.feedback.strength}</p></div>
                    <div><h3>What to improve</h3><p>{record.feedback.improvement}</p></div>
                  </div>
                )}
              </details>
            ))}
          </div>
        </section>
      )}
    </section>
  )
}

export function SavedPracticePage({ id, accessToken, checkingSession }) {
  const [record, setRecord] = useState(null)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (!accessToken) return
    const controller = new AbortController()
    requestInterview(`/${id}`, undefined, accessToken, controller.signal)
      .then(result => { if (!controller.signal.aborted) setRecord(result) })
      .catch(error => { if (!controller.signal.aborted) setError(error.message) })
    return () => controller.abort()
  }, [id, accessToken, attempt])

  if (record?.adaptive) return <AdaptivePractice session={record} accessToken={accessToken} />
  if (record) return <PracticeInterview session={record} accessToken={accessToken} />
  return (
    <section className="panel practice-page">
      <h1>Practice question</h1>
      {checkingSession || (accessToken && !error) ? <p role="status">Loading your question…</p>
        : !accessToken ? <p><a className="history-text-link" href="#login">Log in</a> to open your saved question.</p>
          : <div className="history-notice">
            <p role="alert">{error}</p>
            <button className="button button-outline" type="button" onClick={() => {
              setError('')
              setAttempt(previous => previous + 1)
            }}>Try again</button>
            <a className="history-text-link" href="#history">Practice history</a>
          </div>}
    </section>
  )
}

const practiceDate = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' })

export function PracticeHistoryPage({ accessToken, checkingSession }) {
  const [page, setPage] = useState(null)
  const [error, setError] = useState('')
  const [cursors, setCursors] = useState([])
  const [attempt, setAttempt] = useState(0)
  const before = cursors.at(-1)

  useEffect(() => {
    if (!accessToken) return
    const controller = new AbortController()
    requestInterview(before ? `?before=${before}` : '', undefined, accessToken, controller.signal)
      .then(result => { if (!controller.signal.aborted) setPage(result) })
      .catch(error => { if (!controller.signal.aborted) setError(error.message) })
    return () => controller.abort()
  }, [accessToken, before, attempt])

  function changePage(nextCursors) {
    setError('')
    setPage(null)
    setCursors(nextCursors)
  }

  return (
    <section className="panel practice-page" aria-labelledby="history-title">
      <header className="practice-toolbar">
        <h1 id="history-title">Practice history</h1>
        <a className="button button-outline practice-edit" href="#setup/new">New practice</a>
      </header>
      {checkingSession || (accessToken && !page && !error) ? <p role="status">Loading your history…</p>
        : !accessToken ? <p><a className="history-text-link" href="#login">Log in</a> to see your saved practice.</p>
          : error ? <div className="history-notice">
            <p role="alert">{error}</p>
            <button className="button button-outline" type="button" onClick={() => {
              setError('')
              setAttempt(previous => previous + 1)
            }}>Try again</button>
          </div>
            : !page.records.length ? <p className="panel-intro">Your generated questions and submitted answers will appear here.</p>
              : <>
                <ul className="history-list">
                  {page.records.map(record => (
                    <li key={record.id}>
                      <a href={`#practice/${record.id}`}>
                        <span className="history-meta">
                          <time dateTime={record.createdAt}>{practiceDate.format(new Date(record.createdAt))}</time>
                          <span>{record.completed ? 'Completed' : record.answered ? 'In progress' : 'Awaiting answer'}</span>
                        </span>
                        <span>{record.question}</span>
                        <span className="history-open" aria-hidden="true">→</span>
                      </a>
                    </li>
                  ))}
                </ul>
                {(cursors.length > 0 || page.nextCursor) && <nav className="history-notice" aria-label="Practice history pages">
                  {cursors.length > 0 && <button className="button button-outline" type="button"
                    onClick={() => changePage(cursors.slice(0, -1))}>Newer sessions</button>}
                  {page.nextCursor && <button className="button button-outline" type="button"
                    onClick={() => changePage([...cursors, page.nextCursor])}>Older sessions</button>}
                </nav>}
              </>}
    </section>
  )
}
