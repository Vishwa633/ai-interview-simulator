import { readFileSync } from 'node:fs'
import pg from 'pg'
import { HttpError } from './http-error.js'

function publicId(value) {
  const number = Number(value)
  return Number.isSafeInteger(number) ? number : String(value)
}

function presentReview(row, canEdit = row.can_edit) {
  return { id: publicId(row.id), name: row.name, rating: Number(row.rating), comment: row.comment, can_edit: Boolean(canEdit) }
}

async function openDatabase({ databaseUrl, sqlitePath }) {
  if (databaseUrl) {
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
    pool.on('error', error => console.warn('Idle review database connection failed:', error.code ?? error.name))
    return {
      table: 'interviewloop.feedback',
      query: async (statement, parameters) => {
        try {
          const result = await pool.query(statement, parameters)
          return result.rows
        } catch (error) {
          console.warn('Review database query failed:', error.code ?? error.name)
          throw new HttpError(503, 'Reviews are temporarily unavailable.')
        }
      },
      close: () => pool.end(),
    }
  }

  const { DatabaseSync } = await import('node:sqlite')
  const database = new DatabaseSync(sqlitePath, { timeout: 5000 })
  try {
    database.exec(`
      BEGIN IMMEDIATE;
      CREATE TABLE IF NOT EXISTS feedback (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
        comment TEXT NOT NULL,
        author_id TEXT
      );
    `)
    const columns = database.prepare('PRAGMA table_info(feedback)').all()
    if (!columns.some(column => column.name === 'author_id')) database.exec('ALTER TABLE feedback ADD COLUMN author_id TEXT')
    database.exec('COMMIT')
  } catch (error) {
    database.close()
    throw error
  }
  return {
    table: 'feedback',
    query(statement, parameters) {
      const prepared = database.prepare(statement.replace(/\$\d+/g, '?'))
      prepared.setReadBigInts(true)
      return prepared.all(...parameters)
    },
    close: () => database.close(),
  }
}

export async function createReviewStore(config) {
  const database = await openDatabase(config)
  const { table } = database
  const query = (statement, parameters) => database.query(statement, parameters)
  return {
    async list(viewer) {
      const rows = await query(`
        SELECT id, name, rating, comment, COALESCE(author_id = $1, FALSE) AS can_edit
        FROM ${table} ORDER BY id DESC
      `, [viewer])
      return rows.map(row => presentReview(row))
    },
    async mine(author) {
      const rows = await query(`SELECT id FROM ${table} WHERE author_id = $1`, [author])
      return rows.map(row => publicId(row.id))
    },
    async create({ name, rating, comment }, author) {
      const [row] = await query(`
        INSERT INTO ${table} (name, rating, comment, author_id) VALUES ($1, $2, $3, $4)
        RETURNING id, name, rating, comment
      `, [name, rating, comment, author])
      return presentReview(row, true)
    },
    async update(id, { name, rating, comment }, author) {
      const [row] = await query(`
        UPDATE ${table} SET name = $1, rating = $2, comment = $3
        WHERE id = $4 AND author_id = $5 RETURNING id, name, rating, comment
      `, [name, rating, comment, id, author])
      return row ? presentReview(row, true) : null
    },
    async remove(id, author) {
      const rows = await query(`DELETE FROM ${table} WHERE id = $1 AND author_id = $2 RETURNING id`, [id, author])
      return rows.length === 1
    },
    close: database.close,
  }
}
