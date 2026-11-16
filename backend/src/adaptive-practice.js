import { HttpError } from './http-error.js'

function publicState(record) {
  const { sourceContext, coverage, practiceMemory, ...adaptive } = record.state
  return { id: record.id, adaptive: { ...adaptive, usesPracticeMemory: Boolean(practiceMemory?.length) }, summary: record.summary }
}

function interviewContext(record, withPracticeMemory = false) {
  const { sourceContext, coverage, turns, practiceMemory } = record.state
  const answers = turns.filter(turn => turn.answer).map(({ question, answer }) => ({ question, answer }))
  const longInterview = answers.reduce((size, turn) => size + turn.question.length + turn.answer.length, 0) > 60_000
  return {
    jobDescription: record.jobDescription,
    projectNotes: record.projectNotes,
    githubUrl: record.githubUrl,
    portfolioUrl: record.portfolioUrl,
    sourceContext,
    coverage,
    ...(withPracticeMemory && practiceMemory?.length && { practiceMemory }),
    answers: longInterview ? answers.slice(-12) : answers,
    ...(longInterview && { earlierQuestions: answers.slice(-132, -12).map(turn => turn.question) }),
  }
}

const clarification = 'I couldn’t identify an answer to this question. Please rewrite it in clear sentences and explain your approach.'
const normalizeEvidence = text => text.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim()

const emptySummary = {
  overview: 'This interview was ended before any answers were submitted.',
  strengths: 'There were no answers to assess.',
  gaps: 'The projects and role requirements were not assessed.',
  nextStep: 'Start another practice interview and answer the opening question with a concrete example.',
}

export function createAdaptivePractice(practices, interviewer) {
  const active = new Set()

  async function finish(userId, record) {
    if (!record.state.readyForSummary) {
      record = await practices.updateAdaptive(userId, record, { ...record.state, readyForSummary: true })
    }
    const input = interviewContext(record)
    try {
      const summary = input.answers.length ? await interviewer.summarizeAdaptive(input, userId) : emptySummary
      return { record: publicState(await practices.updateAdaptive(userId, record, record.state, summary)) }
    } catch (error) {
      if (!(error instanceof HttpError)) throw error
      return { record: publicState(record), error }
    }
  }

  return async function perform(userId, id, action, { turn, text } = {}) {
    const key = userId + ':' + id
    if (active.has(key)) throw new HttpError(409, 'This interview is still updating. Try again in a moment.')
    active.add(key)
    try {
      let record = await practices.getAdaptive(userId, id)
      if (!record) throw new HttpError(404, 'Practice session not found.')
      if (record.summary) return { record: publicState(record) }
      if (action === 'finish') return await finish(userId, record)

      const { turns, readyForSummary } = record.state
      const currentIndex = turns.length - 1
      const current = turns[currentIndex]
      if (turn !== currentIndex || readyForSummary) {
        if (action === 'answer' && turns[turn]?.answer === text) return { record: publicState(record) }
        throw new HttpError(409, 'This question has changed. Reopen your interview from Practice history.')
      }

      if (action === 'pause') {
        if (current.answer || (current.draft ?? '') === text) return { record: publicState(record) }
        const state = { ...record.state, turns: [...turns.slice(0, -1), { ...current, draft: text }] }
        return { record: publicState(await practices.updateAdaptive(userId, record, state)) }
      }

      if (current.answer && current.answer !== text) throw new HttpError(409, 'This question already has a saved answer.')
      if (!current.answer) {
        const state = { ...record.state, turns: [...turns.slice(0, -1), { question: current.question, answer: text }] }
        record = await practices.updateAdaptive(userId, record, state)
      }

      try {
        const { answers, ...context } = interviewContext(record, true)
        const latestAnswer = answers.at(-1)
        const result = await interviewer.nextQuestion({ ...context, previousAnswers: answers.slice(0, -1), latestAnswer }, userId)
        const { assessment, evidence, nextQuestion, coverage, strength, improvement } = result
        const turns = [...record.state.turns]
        if (assessment === 'needs_clarification') {
          turns[turns.length - 1] = { question: current.question, draft: text, clarification }
          return { record: publicState(await practices.updateAdaptive(userId, record, { ...record.state, turns })) }
        }
        const excerpt = normalizeEvidence(evidence)
        if (assessment !== 'assessable' || excerpt.length < 5 || !strength || !coverage ||
          !normalizeEvidence(latestAnswer.answer).includes(excerpt)) {
          throw new HttpError(502, 'Could not verify the feedback against your latest answer. Your answer is saved. Try again.')
        }
        turns[turns.length - 1] = { ...turns.at(-1), feedback: { strength, improvement } }
        const state = { ...record.state, turns, coverage }
        if (!nextQuestion) {
          record = await practices.updateAdaptive(userId, record, { ...state, readyForSummary: true })
          return await finish(userId, record)
        }
        const normalize = question => question.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
        if (state.turns.some(turn => normalize(turn.question) === normalize(nextQuestion))) {
          throw new HttpError(502, 'The AI repeated a question. Your answer is saved. Try again for a different question.')
        }
        turns.push({ question: nextQuestion })
        return { record: publicState(await practices.updateAdaptive(userId, record, state)) }
      } catch (error) {
        if (!(error instanceof HttpError)) throw error
        return { record: publicState(record), error }
      }
    } finally {
      active.delete(key)
    }
  }
}
