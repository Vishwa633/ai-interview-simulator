import { HttpError } from './http-error.js'
import { selectPracticeMemory } from './practice-memory.js'

const table = 'interviewloop.practice_sessions'
const visible = 'id::text AS id, question, answer, feedback, follow_up_answer AS "followUpAnswer", summary, planned_questions AS "plannedQuestions", planned_answers AS "plannedAnswers", created_at AS "createdAt"'
const context = 'job_description AS "jobDescription", project_notes AS "projectNotes"'
const adaptivePublic = `(adaptive_state - 'sourceContext' - 'coverage' - 'practiceMemory') ||
  jsonb_build_object('usesPracticeMemory', COALESCE(jsonb_array_length(adaptive_state->'practiceMemory'), 0) > 0) AS adaptive`
const adaptivePrivate = `id::text AS id, ${context}, github_url AS "githubUrl", portfolio_url AS "portfolioUrl",
  adaptive_state AS state, adaptive_revision AS revision, summary`

export function createPracticeStore(pool) {
  async function query(statement, parameters) {
    if (!pool) throw new HttpError(503, 'Practice history requires a database connection.')
    try {
      return (await pool.query(statement, parameters)).rows
    } catch (error) {
      console.warn('Practice database query failed:', error.code ?? error.name)
      throw new HttpError(503, 'Practice history is temporarily unavailable. Please try again.')
    }
  }

  async function get(userId, id) {
    const [record] = await query(`SELECT ${visible}, ${adaptivePublic} FROM ${table} WHERE user_id = $1 AND id = $2`, [userId, id])
    return record
  }

  return {
    async resumeSetup(userId) {
      const [record] = await query(`
        SELECT id::text AS id, ${context}, github_url AS "githubUrl", portfolio_url AS "portfolioUrl",
          cv_pdf IS NOT NULL AS "hasCv", adaptive_state->>'cvName' AS "cvName",
          summary IS NOT NULL AS completed
        FROM ${table}
        WHERE user_id = $1
        ORDER BY (summary IS NULL) DESC, id DESC
        LIMIT 1
      `, [userId])
      return record ?? null
    },
    async relevantMemory(userId, { jobDescription, projectNotes }, cvPdf) {
      const rows = await query(`
        SELECT job_description AS "jobDescription", summary
        FROM ${table}
        WHERE user_id = $1 AND summary IS NOT NULL
          AND cv_pdf IS NOT DISTINCT FROM $2::bytea
          AND (answer IS NOT NULL OR COALESCE(adaptive_state->'turns'->0 ? 'answer', FALSE))
        ORDER BY id DESC LIMIT 24
      `, [userId, cvPdf ? Buffer.from(cvPdf, 'base64') : null])
      return selectPracticeMemory(rows, jobDescription, projectNotes)
    },
    async createAdaptive(userId, input, sources, { question, sourceContext, practiceMemory = [], requestedPracticeMemory = false }) {
      const state = {
        sourceContext, practiceMemory, coverage: '', readyForSummary: false, turns: [{ question }],
        ...(sources.cvName && { cvName: sources.cvName }),
        ...(requestedPracticeMemory && { requestedPracticeMemory }),
      }
      const [record] = await query(`
        INSERT INTO ${table} (user_id, job_description, project_notes, question, cv_pdf, github_url, portfolio_url, adaptive_state)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb) RETURNING ${visible}, ${adaptivePublic}
      `, [userId, input.jobDescription, input.projectNotes, question,
        sources.cvPdf ? Buffer.from(sources.cvPdf, 'base64') : null, sources.githubUrl, sources.portfolioUrl, JSON.stringify(state)])
      return record
    },
    async getAdaptive(userId, id) {
      const [record] = await query(`
        SELECT ${adaptivePrivate} FROM ${table} WHERE user_id = $1 AND id = $2 AND adaptive_state IS NOT NULL
      `, [userId, id])
      return record
    },
    async updateAdaptive(userId, record, state, summary = null) {
      const [updated] = await query(`
        UPDATE ${table}
        SET adaptive_state = $4::jsonb, adaptive_revision = adaptive_revision + 1, summary = $5::jsonb
        WHERE user_id = $1 AND id = $2 AND adaptive_revision = $3 AND summary IS NULL
        RETURNING ${adaptivePrivate}
      `, [userId, record.id, record.revision, JSON.stringify(state), summary ? JSON.stringify(summary) : null])
      if (!updated) throw new HttpError(409, 'This interview changed in another tab. Reopen it from Practice history.')
      return updated
    },
    async create(userId, { jobDescription, projectNotes, question, plannedQuestions = [] }) {
      const [record] = await query(`
        INSERT INTO ${table} (user_id, job_description, project_notes, question, planned_questions)
        VALUES ($1, $2, $3, $4, $5::jsonb) RETURNING ${visible}
      `, [userId, jobDescription, projectNotes, question, JSON.stringify(plannedQuestions)])
      return record
    },
    async list(userId, before) {
      const rows = await query(`
        SELECT id::text AS id, question,
          (answer IS NOT NULL OR COALESCE(adaptive_state->'turns'->0 ? 'answer', FALSE)) AS answered,
          summary IS NOT NULL AS completed,
          created_at AS "createdAt"
        FROM ${table} AS session
        WHERE user_id = $1 AND ($2::bigint IS NULL OR session.id < $2)
        ORDER BY session.id DESC LIMIT 21
      `, [userId, before])
      const records = rows.slice(0, 20)
      return { records, nextCursor: rows.length > 20 ? records.at(-1).id : null }
    },
    get,
    async saveAnswer(userId, id, answer, followUp) {
      const column = followUp ? 'follow_up_answer' : 'answer'
      const [record] = await query(`
        UPDATE ${table} SET ${column} = COALESCE(${column}, $3)
        WHERE user_id = $1 AND id = $2 AND adaptive_state IS NULL AND (NOT $4::boolean OR feedback ? 'followUpQuestion')
        RETURNING ${visible}, ${context}
      `, [userId, id, answer, Boolean(followUp)])
      if (!record) {
        if (followUp && await get(userId, id)) {
          throw new HttpError(409, 'Get feedback on your first answer to unlock the follow-up question.')
        }
        throw new HttpError(404, 'Practice session not found.')
      }
      if ((followUp ? record.followUpAnswer : record.answer) !== answer) throw new HttpError(409, 'This question already has a saved answer. Reopen it from Practice history.')
      return record
    },
    async savePlannedAnswer(userId, id, index, answer) {
      const [record] = await query(`
        UPDATE ${table}
        SET planned_answers = CASE WHEN jsonb_array_length(planned_answers) = $3::integer
          THEN planned_answers || jsonb_build_array($4::text) ELSE planned_answers END
        WHERE user_id = $1 AND id = $2 AND adaptive_state IS NULL AND follow_up_answer IS NOT NULL
          AND jsonb_array_length(planned_questions) > $3 AND jsonb_array_length(planned_answers) >= $3
        RETURNING ${visible}, ${context}
      `, [userId, id, index, answer])
      if (!record) {
        if (!await get(userId, id)) throw new HttpError(404, 'Practice session not found.')
        throw new HttpError(409, 'Answer the practice questions in order.')
      }
      if (record.plannedAnswers[index] !== answer) {
        throw new HttpError(409, 'This question already has a saved answer. Reopen it from Practice history.')
      }
      return record
    },
    async saveFeedback(userId, id, feedback, followUp) {
      const column = followUp ? 'summary' : 'feedback'
      const answerColumn = followUp ? 'follow_up_answer' : 'answer'
      const [record] = await query(`
        UPDATE ${table} SET ${column} = COALESCE(${column}, $3::jsonb)
        WHERE user_id = $1 AND id = $2 AND adaptive_state IS NULL AND ${answerColumn} IS NOT NULL
          AND (NOT $4::boolean OR jsonb_array_length(planned_questions) = jsonb_array_length(planned_answers))
        RETURNING ${visible}
      `, [userId, id, JSON.stringify(feedback), Boolean(followUp)])
      if (!record) throw new HttpError(404, 'Practice session not found.')
      return record
    },
  }
}
