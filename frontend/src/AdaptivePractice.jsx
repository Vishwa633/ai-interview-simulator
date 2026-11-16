import { useEffect, useRef, useState } from 'react'
import interviewerImage from './assets/ai-interviewer.jpeg'
import { requestInterview } from './interview-api.js'

function FeedbackNotes({ feedback }) {
  return (
    <dl className="adaptive-feedback-notes">
      <div><dt>What you did well</dt><dd>{feedback.strength}</dd></div>
      <div><dt>What to improve</dt><dd>{feedback.improvement}</dd></div>
    </dl>
  )
}

export function AdaptivePractice({ session, accessToken }) {
  const [record, setRecord] = useState(session)
  const [action, setAction] = useState('')
  const [error, setError] = useState('')
  const request = useRef(null)
  const field = useRef(null)
  const heading = useRef(null)
  const feedbackHeading = useRef(null)
  const { turns, readyForSummary } = record.adaptive
  const turnIndex = turns.length - 1
  const current = turns[turnIndex]
  const { summary } = record
  const showQuestion = !summary && !readyForSummary
  const saved = turns.filter(turn => turn.answer)
  const latestFeedback = saved.at(-1)?.feedback
  const submitting = Boolean(action)

  useEffect(() => () => request.current?.abort(), [])
  useEffect(() => {
    const target = showQuestion && current.clarification ? field : showQuestion && latestFeedback ? feedbackHeading : heading
    target.current?.focus()
  }, [turnIndex, summary, readyForSummary, showQuestion, latestFeedback, current.clarification])

  async function updateInterview(kind) {
    if (!accessToken || request.current) return
    const draft = field.current?.value ?? ''
    const answer = draft.trim()
    if (kind === 'answer' && answer.length < 20) {
      setError('Write at least 20 characters before submitting.')
      field.current?.focus()
      return
    }

    const controller = new AbortController()
    request.current = controller
    setAction(kind)
    setError('')
    try {
      const payload = kind === 'answer' ? { turn: turnIndex, answer } : kind === 'pause' ? { turn: turnIndex, draft } : {}
      const result = await requestInterview(`/${record.id}/adaptive-${kind}`, payload, accessToken, controller.signal)
      if (!controller.signal.aborted) {
        setRecord(result)
        if (kind === 'pause') window.location.hash = 'history'
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        if (error.record) setRecord(error.record)
        setError(error.message)
      }
    } finally {
      request.current = null
      if (!controller.signal.aborted) setAction('')
    }
  }

  return (
    <section className="panel practice-page" aria-labelledby="practice-title">
      <header className="practice-toolbar">
        <h1 id="practice-title">Practice interview</h1>
        <div className="practice-toolbar-actions">
          {showQuestion ? (
            <>
              <button className="button button-outline practice-edit" type="button" disabled={submitting || !accessToken}
                onClick={() => updateInterview('pause')}>{action === 'pause' ? 'Saving…' : 'Pause & save'}</button>
              <button className="button button-outline practice-edit" type="button" disabled={submitting || !accessToken}
                onClick={() => updateInterview('finish')}>{action === 'finish' ? 'Preparing summary…' : 'Finish interview'}</button>
            </>
          ) : <a className="button button-outline practice-edit" href="#history">Practice history</a>}
        </div>
      </header>

      {showQuestion && (
        <div className="practice-stage">
          <figure className="practice-portrait">
            <img src={interviewerImage} alt="" />
            <figcaption><span aria-hidden="true" /> AI interviewer</figcaption>
          </figure>
          <div>
            {latestFeedback && !current.clarification && (
              <section className="adaptive-answer-feedback" aria-labelledby="latest-answer-feedback">
                <h2 id="latest-answer-feedback" ref={feedbackHeading} tabIndex={-1}>Feedback on question {saved.length}</h2>
                <FeedbackNotes feedback={latestFeedback} />
              </section>
            )}
            <h2 className="practice-step-title" ref={heading} tabIndex={-1}>Question {turnIndex + 1}</h2>
            {record.adaptive.usesPracticeMemory && <p className="adaptive-memory-note">Using relevant feedback from previous interviews</p>}
            <div className="practice-copy"><p>{current.question}</p></div>
            <form className="practice-answer" onSubmit={event => { event.preventDefault(); updateInterview('answer') }}>
              <label htmlFor="adaptive-answer">Your answer</label>
              <textarea key={turnIndex} id="adaptive-answer" ref={field} rows="5" required minLength={20} maxLength={3000}
                defaultValue={current.answer ?? current.draft ?? ''} readOnly={submitting || Boolean(current.answer)}
                placeholder="Explain your approach and use a concrete example."
                aria-describedby={current.clarification ? 'adaptive-answer-help adaptive-clarification' : 'adaptive-answer-help'} />
              <p className="practice-answer-help" id="adaptive-answer-help">
                {current.answer ? 'Your answer is saved.' : 'Answer in English. Use Pause & save to keep a draft.'}
              </p>
              {current.clarification && <p className="practice-error" id="adaptive-clarification" role="status">{current.clarification}</p>}
              {error && <p className="practice-error" role="alert">{error}</p>}
              <button className="button button-primary" type="submit" disabled={submitting || !accessToken}>
                {action === 'answer' ? 'Preparing next question…' : current.answer ? 'Continue interview' : 'Submit answer'}
                {action !== 'answer' && <span aria-hidden="true">→</span>}
              </button>
            </form>
          </div>
        </div>
      )}
      {!showQuestion && latestFeedback && (
        <section className="adaptive-answer-feedback" aria-labelledby="last-answer-feedback">
          <h2 id="last-answer-feedback">Feedback on question {saved.length}</h2>
          <FeedbackNotes feedback={latestFeedback} />
        </section>
      )}
      {readyForSummary && !summary && (
        <div className="practice-feedback">
          <h2 ref={heading} tabIndex={-1}>Final practice summary</h2>
          {error ? <p className="practice-error" role="alert">{error}</p>
            : <p role="status">{submitting ? 'Preparing your summary…' : 'Your saved answers are ready for review.'}</p>}
          {!submitting && <button className="button button-primary" type="button" disabled={!accessToken}
            onClick={() => updateInterview('finish')}>Get final summary</button>}
        </div>
      )}
      {summary && (
        <section className="practice-feedback" aria-labelledby="adaptive-summary">
          <h2 id="adaptive-summary" ref={heading} tabIndex={-1}>Final practice summary</h2>
          <div className="practice-feedback-notes adaptive-summary-notes">
            <div><h3>Overall feedback</h3><p>{summary.overview}</p></div>
            <div><h3>Strengths</h3><p>{summary.strengths}</p></div>
            <div><h3>Gaps and topics to revisit</h3><p>{summary.gaps}</p></div>
            <div><h3>What to practice next</h3><p>{summary.nextStep}</p></div>
          </div>
        </section>
      )}
      {saved.length > 0 && (
        <section className="practice-feedback" aria-labelledby="adaptive-saved">
          <h2 id="adaptive-saved">Saved answers</h2>
          <div className="practice-responses">
            {saved.map(({ question, answer, feedback }, index) => (
              <details key={index}>
                <summary>Question {index + 1}</summary>
                <h3>{question}</h3>
                <p>{answer}</p>
                {feedback && <FeedbackNotes feedback={feedback} />}
              </details>
            ))}
          </div>
        </section>
      )}
    </section>
  )
}
