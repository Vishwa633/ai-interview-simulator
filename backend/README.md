# InterviewLoop backend

The app uses Node.js 24 and Express. The Vite frontend sends `/api` requests to this server on port 8000.

```powershell
cd backend
npm ci
npm run dev
```

Use `npm start` to run without file watching. The server reads `backend/.env`. If you already configured the Python backend, keep the same database URL and Supabase keys. For a fresh Supabase project, copy `.env.example` to `.env` and apply `supabase_feedback.sql` in the Supabase SQL Editor. If `DATABASE_URL` is empty, the server uses the existing local SQLite database for reviews.

The bundled Supabase Root 2021 CA is used for hosted Supabase Postgres connections so Node can verify both the database certificate and hostname. See the [Supabase SSL documentation](https://supabase.com/docs/guides/platform/ssl-enforcement).

Login, registration and password changes use Supabase Auth from the frontend. Express handles public reviews, review ownership and account deletion. Account deletion requires the server-side secret key in `.env`.

The previous Python server files are kept for rollback. Run one server on port 8000. Future Python features can run as a separate service on another port, which Express can call when it needs that feature.
