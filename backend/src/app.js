import express from 'express'
import { createAdaptivePractice } from './adaptive-practice.js'
import { githubProfileInput } from './github-projects.js'
import { HttpError } from './http-error.js'
import { interviewAnswerInput, interviewCvInput, interviewInput, plannedQuestionCount, portfolioUrlInput } from './interview.js'

function bearerToken(request, required) {
  const value = request.get('Authorization')
  const token = /^Bearer\s+([^\s]+)$/i.exec(value ?? '')?.[1]
  if (!token && (required || value)) throw new HttpError(401, 'Please log in again.')
  return token
}

function reviewInput(body) {
  if (!body || Array.isArray(body) || typeof body !== 'object') throw new HttpError(422, 'Enter your review.')
  const { name = '', rating, comment } = body
  if (typeof name !== 'string' || [...name.trim()].length > 60 || name.includes('@')) {
    throw new HttpError(422, 'Use a display name of up to 60 characters.')
  }
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw new HttpError(422, 'Choose a rating from 1 to 5.')
  if (typeof comment !== 'string' || !comment.trim() || [...comment.trim()].length > 1000) {
    throw new HttpError(422, 'Enter a review of up to 1000 characters.')
  }
  return { name: name.trim() || 'Anonymous', rating, comment: comment.trim() }
}

function recordId(value, message) {
  if (typeof value !== 'string' || !/^[1-9]\d{0,18}$/.test(value) || BigInt(value) > 9223372036854775807n) {
    throw new HttpError(422, message)
  }
  return value
}

export function createApp(reviews, auth, interviewer, practices) {
  const app = express()
  app.disable('x-powered-by')
  const parseJson = express.json({ limit: '24kb' })

  app.get('/api/health', (_request, response) => response.json({ status: 'ok' }))

  app.get('/api/feedback', async (request, response) => {
    const token = bearerToken(request, false)
    const viewer = token ? await auth.verifyUser(token) : null
    response.set('Cache-Control', 'private, no-store').json(await reviews.list(viewer))
  })

  app.get('/api/feedback/mine', async (request, response) => {
    const author = await auth.verifyUser(bearerToken(request, true))
    response.set('Cache-Control', 'private, no-store').json(await reviews.mine(author))
  })

  app.post('/api/feedback', parseJson, async (request, response) => {
    const author = await auth.verifyUser(bearerToken(request, true))
    response.status(201).json(await reviews.create(reviewInput(request.body), author))
  })

  app.patch('/api/feedback/:id', parseJson, async (request, response) => {
    const author = await auth.verifyUser(bearerToken(request, true))
    const review = await reviews.update(recordId(request.params.id, 'Invalid review ID.'), reviewInput(request.body), author)
    if (!review) throw new HttpError(404, 'Review not found.')
    response.json(review)
  })

  app.delete('/api/feedback/:id', async (request, response) => {
    const author = await auth.verifyUser(bearerToken(request, true))
    const removed = await reviews.remove(recordId(request.params.id, 'Invalid review ID.'), author)
    if (!removed) throw new HttpError(404, 'Review not found.')
    response.status(204).end()
  })

  app.use('/api/interviews', async (request, response, next) => {
    response.set('Cache-Control', 'private, no-store')
    response.locals.userId = await auth.verifyUser(bearerToken(request, true))
    next()
  })

  app.get('/api/interviews', async (request, response) => {
    const before = request.query.before === undefined ? null : recordId(request.query.before, 'Invalid history cursor.')
    response.json(await practices.list(response.locals.userId, before))
  })

  app.get('/api/interviews/resume', async (_request, response) => {
    response.json(await practices.resumeSetup(response.locals.userId))
  })

  // Base64 adds about one third to the PDF's size. Keep the larger limit on this authenticated route.
  app.post('/api/interviews/first-question', express.json({ limit: '6mb', inflate: false }), async (request, response) => {
    const { userId } = response.locals
    const context = interviewInput(request.body)
    const cvPdf = interviewCvInput(request.body?.cvPdf)
    const githubUser = githubProfileInput(request.body?.githubUrl)
    const portfolioUrl = portfolioUrlInput(request.body?.portfolioUrl)
    const usePracticeMemory = request.body?.usePracticeMemory
    if (usePracticeMemory !== undefined && typeof usePracticeMemory !== 'boolean') {
      throw new HttpError(422, 'Choose whether to use feedback from previous practice.')
    }
    const practiceMemory = usePracticeMemory === false ? [] : await practices.relevantMemory(userId, context, cvPdf)
    const prompt = practiceMemory.length ? { ...context, practiceMemory } : context
    const first = await interviewer.generateQuestion(prompt, userId, { cvPdf, githubUser, portfolioUrl })
    const cvName = cvPdf && typeof request.body?.cvName === 'string' ? request.body.cvName.trim().slice(0, 255) : undefined
    const sources = { cvPdf, cvName, githubUrl: githubUser ? `https://github.com/${githubUser}` : null, portfolioUrl }
    response.status(201).json(await practices.createAdaptive(userId, context, sources, { ...first, practiceMemory }))
  })

  app.get('/api/interviews/:id', async (request, response) => {
    const id = recordId(request.params.id, 'Invalid practice session ID.')
    const record = await practices.get(response.locals.userId, id)
    if (!record) throw new HttpError(404, 'Practice session not found.')
    response.json(record)
  })

  const performAdaptive = createAdaptivePractice(practices, interviewer)
  for (const action of ['answer', 'pause', 'finish']) {
    app.post(`/api/interviews/:id/adaptive-${action}`, parseJson, async (request, response) => {
      const id = recordId(request.params.id, 'Invalid practice session ID.')
      const { turn, draft = '' } = request.body ?? {}
      if (action !== 'finish' && (!Number.isSafeInteger(turn) || turn < 0)) {
        throw new HttpError(422, 'Invalid practice question number.')
      }
      if (action === 'pause' && (typeof draft !== 'string' || draft.length > 3000)) {
        throw new HttpError(422, 'Use up to 3,000 characters for a saved draft.')
      }
      const text = action === 'answer' ? interviewAnswerInput(request.body) : draft
      const { record, error } = await performAdaptive(response.locals.userId, id, action, { turn, text })
      if (error) return response.status(error.status).json({ detail: error.message, record })
      response.json(record)
    })
  }

  const pendingFeedback = new Map()
  async function submitPracticeAnswer(request, response, turn) {
    const { userId } = response.locals
    const id = recordId(request.params.id, 'Invalid practice session ID.')
    const answer = interviewAnswerInput(request.body)
    const forSummary = turn !== 'first'
    const index = request.body?.index
    if (turn === 'planned' && (!Number.isInteger(index) || index < 0 || index >= plannedQuestionCount)) {
      throw new HttpError(422, 'Invalid practice question number.')
    }
    const saved = turn === 'planned'
      ? await practices.savePlannedAnswer(userId, id, index, answer)
      : await practices.saveAnswer(userId, id, answer, forSummary)
    const { jobDescription, projectNotes, ...record } = saved
    if (forSummary && (record.summary || record.plannedAnswers.length < record.plannedQuestions.length)) {
      return response.json(record)
    }
    if (!forSummary && record.feedback) return response.json(record)

    const key = forSummary ? `summary:${id}` : id
    let pending = pendingFeedback.get(key)
    if (!pending) {
      const input = { jobDescription, projectNotes, question: record.question, answer: record.answer }
      const review = forSummary
        ? interviewer.summarizeInterview({
          ...input, followUpQuestion: record.feedback.followUpQuestion, followUpAnswer: record.followUpAnswer,
          additionalTurns: record.plannedQuestions.map((question, index) => ({ question, answer: record.plannedAnswers[index] })),
        }, userId)
        : interviewer.reviewAnswer(input, userId)
      pending = review
        .then(feedback => practices.saveFeedback(userId, id, feedback, forSummary))
        .finally(() => pendingFeedback.delete(key))
      pendingFeedback.set(key, pending)
    }

    try {
      response.json(await pending)
    } catch (error) {
      if (!(error instanceof HttpError)) throw error
      response.status(error.status).json({ detail: error.message, record })
    }
  }
  app.post('/api/interviews/:id/answer', parseJson, (request, response) => submitPracticeAnswer(request, response, 'first'))
  app.post('/api/interviews/:id/follow-up-answer', parseJson, (request, response) => submitPracticeAnswer(request, response, 'follow-up'))
  app.post('/api/interviews/:id/planned-answer', parseJson, (request, response) => submitPracticeAnswer(request, response, 'planned'))

  app.delete('/api/account', async (request, response) => {
    await auth.deleteAccount(bearerToken(request, true))
    response.status(204).end()
  })

  app.use('/api', (_request, response) => response.status(404).json({ detail: 'Not found.' }))
  app.use((error, _request, response, next) => {
    if (response.headersSent) return next(error)
    if (error instanceof HttpError) return response.status(error.status).json({ detail: error.message })
    if (error.type === 'entity.parse.failed') return response.status(400).json({ detail: 'Invalid JSON.' })
    if (error.type === 'encoding.unsupported') return response.status(415).json({ detail: 'Unsupported request encoding.' })
    if (error.type === 'entity.too.large') return response.status(413).json({ detail: 'Request is too large.' })
    console.error('Backend request failed:', error.code ?? error.name)
    return response.status(500).json({ detail: 'Something went wrong.' })
  })
  return app
}
