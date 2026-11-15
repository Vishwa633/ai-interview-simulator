import express from 'express'
import { HttpError } from './http-error.js'

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

function reviewId(value) {
  if (!/^[1-9]\d{0,18}$/.test(value) || BigInt(value) > 9223372036854775807n) {
    throw new HttpError(422, 'Invalid review ID.')
  }
  return value
}

export function createApp(reviews, auth) {
  const app = express()
  app.disable('x-powered-by')
  app.use(express.json({ limit: '24kb' }))

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

  app.post('/api/feedback', async (request, response) => {
    const author = await auth.verifyUser(bearerToken(request, true))
    response.status(201).json(await reviews.create(reviewInput(request.body), author))
  })

  app.patch('/api/feedback/:id', async (request, response) => {
    const author = await auth.verifyUser(bearerToken(request, true))
    const review = await reviews.update(reviewId(request.params.id), reviewInput(request.body), author)
    if (!review) throw new HttpError(404, 'Review not found.')
    response.json(review)
  })

  app.delete('/api/feedback/:id', async (request, response) => {
    const author = await auth.verifyUser(bearerToken(request, true))
    const removed = await reviews.remove(reviewId(request.params.id), author)
    if (!removed) throw new HttpError(404, 'Review not found.')
    response.status(204).end()
  })

  app.delete('/api/account', async (request, response) => {
    await auth.deleteAccount(bearerToken(request, true))
    response.status(204).end()
  })

  app.use('/api', (_request, response) => response.status(404).json({ detail: 'Not found.' }))
  app.use((error, _request, response, next) => {
    if (response.headersSent) return next(error)
    if (error instanceof HttpError) return response.status(error.status).json({ detail: error.message })
    if (error.type === 'entity.parse.failed') return response.status(400).json({ detail: 'Invalid JSON.' })
    if (error.type === 'entity.too.large') return response.status(413).json({ detail: 'Request is too large.' })
    console.error('Backend request failed:', error.code ?? error.name)
    return response.status(500).json({ detail: 'Something went wrong.' })
  })
  return app
}
