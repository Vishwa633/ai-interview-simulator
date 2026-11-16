import { HttpError } from './http-error.js'

const unavailable = 'Could not read the GitHub profile. Try again or remove the link.'
const readmeLimit = 3000

export function githubProfileInput(value) {
  if (value === undefined || (typeof value === 'string' && !value.trim())) return undefined
  const profile = typeof value === 'string' && /^https:\/\/(?:www\.)?github\.com\/([a-z\d](?:[a-z\d-]{0,37}[a-z\d])?)\/?$/i.exec(value.trim())
  if (!profile) throw new HttpError(422, 'Enter a GitHub profile URL, such as https://github.com/your-name.')
  return profile[1].toLowerCase()
}

function words(text) {
  return text.toLowerCase().match(/[a-z0-9][a-z0-9+#]{2,}/g) ?? []
}

async function readExcerpt(body) {
  if (!body) return ''
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let text = ''
  let remaining = readmeLimit
  try {
    while (remaining > 0) {
      const { value, done } = await reader.read()
      if (done) break
      const chunk = value.subarray(0, remaining)
      text += decoder.decode(chunk, { stream: true })
      remaining -= chunk.length
    }
    return (text + (remaining > 0 ? decoder.decode() : '')).trim()
  } finally {
    await reader.cancel().catch(() => {})
  }
}

export async function readGithubProjects(username, jobDescription, fetchGitHub = fetch) {
  const signal = AbortSignal.timeout(9000)
  async function request(path, accept = 'application/vnd.github+json') {
    return fetchGitHub('https://api.github.com' + path, {
      headers: { Accept: accept, 'X-GitHub-Api-Version': '2026-03-10', 'User-Agent': 'InterviewLoop' },
      redirect: 'error',
      signal,
    })
  }

  try {
    const response = await request('/users/' + encodeURIComponent(username) + '/repos?type=owner&sort=pushed&per_page=30')
    if (!response.ok) {
      await response.body?.cancel()
      if (response.status === 404) throw new HttpError(422, 'GitHub could not find this profile. Check the link.')
      if (response.status === 429 || (response.status === 403 &&
        (response.headers.get('x-ratelimit-remaining') === '0' || response.headers.has('retry-after')))) {
        throw new HttpError(503, 'GitHub has reached its usage limit. Try again later or continue without the GitHub link.')
      }
      throw new HttpError(502, unavailable)
    }

    const repos = await response.json()
    const roleWords = new Set(words(jobDescription))
    const ranked = repos.filter(repo =>
      repo.private === false && !repo.fork && !repo.archived && !repo.disabled &&
      repo.size > 0 && repo.owner?.login?.toLowerCase() === username &&
      typeof repo.name === 'string' && repo.name.toLowerCase() !== username
    ).map(repo => {
      const terms = new Set(words([repo.name, repo.description, repo.language, ...(repo.topics ?? [])].join(' ')))
      const score = [...terms].filter(term => roleWords.has(term)).length
      return { repo, score }
    }).sort((a, b) => b.score - a.score)

    if (!ranked.length) {
      throw new HttpError(422, 'No public, non-fork projects were found on this GitHub profile. Remove the link or add project notes.')
    }

    return Promise.all(ranked.map(async ({ repo }, index) => {
      const project = {
        name: repo.name,
        language: repo.language ?? '',
        description: repo.description?.slice(0, 400) ?? '',
      }
      if (index >= 3) return project
      try {
        const path = '/repos/' + encodeURIComponent(username) + '/' + encodeURIComponent(repo.name) + '/readme'
        const readme = await request(path, 'application/vnd.github.raw+json')
        if (readme.ok) return { ...project, readme: await readExcerpt(readme.body) }
        await readme.body?.cancel()
      } catch {
        // Repository metadata still provides context when a README is unavailable.
      }
      return project
    }))
  } catch (error) {
    if (error instanceof HttpError) throw error
    throw new HttpError(502, unavailable)
  }
}
