import { fileURLToPath } from 'node:url'
import { createApp } from './app.js'
import { createPostgresPool } from './database.js'
import { createInterviewer } from './interview.js'
import { createReviewStore } from './reviews.js'
import { createPracticeStore } from './practice-store.js'
import { createSupabaseAuth } from './supabase-auth.js'

try {
  process.loadEnvFile(fileURLToPath(new URL('../.env', import.meta.url)))
} catch (error) {
  if (error.code !== 'ENOENT') throw error
}

const port = Number(process.env.PORT ?? 8000)
const pool = createPostgresPool(process.env.DATABASE_URL?.trim())
const practices = createPracticeStore(pool)
const reviews = await createReviewStore({
  pool,
  sqlitePath: process.env.FEEDBACK_DATABASE || fileURLToPath(new URL('../feedback.sqlite3', import.meta.url)),
})
const auth = createSupabaseAuth({
  url: process.env.SUPABASE_URL?.trim(),
  publishableKey: process.env.SUPABASE_PUBLISHABLE_KEY?.trim(),
  secretKey: process.env.SUPABASE_SECRET_KEY?.trim(),
})

const interviewer = createInterviewer({
  apiKey: process.env.GEMINI_API_KEY?.trim(),
  model: process.env.GEMINI_MODEL?.trim() || undefined,
})

const server = createApp(reviews, auth, interviewer, practices).listen(port, '127.0.0.1')
server.once('listening', () => console.log(`InterviewLoop API listening at http://127.0.0.1:${port}`))
server.once('error', async error => {
  console.error('Backend could not start:', error.code ?? error.name)
  await reviews.close()
  process.exitCode = 1
})

function shutdown() {
  server.close(async () => {
    await reviews.close()
  })
}

process.once('SIGINT', shutdown)
process.once('SIGTERM', shutdown)
