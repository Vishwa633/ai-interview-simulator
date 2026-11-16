import { HttpError } from './http-error.js'

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function createSupabaseAuth({ url, publishableKey, secretKey, fetchAuth = fetch }) {
  const project = /^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(url ?? '') ? url.replace(/\/$/, '') : null

  async function request(path, options, attempts = 1) {
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      let response
      try {
        response = await fetchAuth(`${project}/auth/v1${path}`, {
          ...options, redirect: 'error', signal: AbortSignal.timeout(12_000),
        })
      } catch (error) {
        if (attempt < attempts) continue
        console.error('Supabase Auth connection failed:', error.cause?.code ?? error.name)
        throw new HttpError(502, 'The account service is unavailable. Please try again.')
      }

      if (attempt < attempts && [502, 503, 504].includes(response.status)) {
        await response.body?.cancel()
        continue
      }
      return response
    }
  }

  async function verifyUser(token) {
    if (!project || !publishableKey?.startsWith('sb_publishable_')) {
      throw new HttpError(503, 'Sign-in verification is not configured.')
    }
    const response = await request('/user', {
      headers: { apikey: publishableKey, Authorization: `Bearer ${token}` },
    }, 2)
    if (!response.ok) {
      await response.body?.cancel()
      if ([400, 401, 403, 404].includes(response.status)) throw new HttpError(401, 'Please log in again.')
      console.error('Supabase Auth verification failed:', response.status)
      throw new HttpError(502, 'The account service is unavailable. Please try again.')
    }
    const user = await response.json().catch(() => null)
    if (typeof user?.id !== 'string' || !uuidPattern.test(user.id)) {
      throw new HttpError(502, 'The account service returned an invalid user.')
    }
    return user.id.toLowerCase()
  }

  async function deleteAccount(token) {
    if (!project || !secretKey?.startsWith('sb_secret_')) {
      throw new HttpError(503, 'Account deletion is not configured.')
    }
    const id = await verifyUser(token)
    const response = await request(`/admin/users/${id}`, {
      method: 'DELETE',
      headers: { apikey: secretKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ should_soft_delete: false }),
    })
    await response.body?.cancel()
    if (!response.ok && response.status !== 404) throw new HttpError(502, 'Your account could not be deleted.')
  }

  return { verifyUser, deleteAccount }
}
