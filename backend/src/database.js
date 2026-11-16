import { readFileSync } from 'node:fs'
import pg from 'pg'

export function createPostgresPool(databaseUrl) {
  if (!databaseUrl) return null
  const endpoint = new URL(databaseUrl)
  const ssl = { rejectUnauthorized: true }
  const managedHost = /^(?:[^.]+\.pooler\.supabase\.com|db\.[^.]+\.supabase\.co)$/i
  if (managedHost.test(endpoint.hostname) && !endpoint.searchParams.has('sslrootcert')) {
    // pg lets the URI's sslmode override the CA passed in the Pool options.
    endpoint.searchParams.delete('sslmode')
    ssl.ca = readFileSync(new URL('./supabase-root-ca.pem', import.meta.url))
  }
  const pool = new pg.Pool({
    connectionString: endpoint.toString(),
    ssl,
    max: 4,
    min: 1,
    connectionTimeoutMillis: 10000,
    query_timeout: 12000,
    idleTimeoutMillis: 60000,
  })
  pool.on('error', error => console.warn('Idle database connection failed:', error.code ?? error.name))
  return pool
}
