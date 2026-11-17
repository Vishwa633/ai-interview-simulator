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

Set `GEMINI_API_KEY` in `backend/.env` using a key from [Google AI Studio](https://aistudio.google.com/apikey). The default model is `gemini-3.5-flash-lite`. Set `GEMINI_MODEL` to override it. Apply `supabase_interviews.sql` in the Supabase SQL Editor to enable or upgrade practice history.

New interviews adapt after each submitted answer and have no fixed question count. The user can pause and save a draft, resume from Practice history, or finish for an English summary. Each session privately stores the optional CV PDF (up to 4 MB), GitHub profile and portfolio links, job description, project notes, questions, answers, and summary. The first Gemini request reads the PDF, public portfolio page, and GitHub project context. Later requests use the saved source notes and conversation history. Setup opens the most recent interview that can still be resumed, or the latest completed interview as a fallback. Start fresh opens a blank setup and creates a new interview using only the new inputs. Use past feedback opts into relevant coaching notes from completed sessions under the same account. Notes are matched against the role and the same CV PDF (or sessions without a CV when none is uploaded). Previously saved interviews remain accessible from Practice history. Long conversations use the saved coverage notes and recent answers. Earlier practice sessions keep their original format.

Set `ELEVENLABS_API_KEY` in `backend/.env` to enable microphone transcription. The key needs access to Speech to Text. Restart the backend after changing it. `ELEVENLABS_VOICE_ID` is optional and defaults to Talia. The user reviews the transcript in the answer field before submitting. InterviewLoop sends audio to ElevenLabs for transcription and saves the submitted text in its history.

Interview questions use Gemini 3.8 Flash-Lite TTS with the Leda voice and the existing Gemini API key. The backend sends only the current question for speech generation and reuses recently generated audio. If Gemini TTS is unavailable or reaches its quota, the browser can read the question with a built-in voice. The robot’s mouth moves during audio playback.

The previous Python server files are kept for rollback. Run one server on port 8000. Future Python features can run as a separate service on another port, which Express can call when it needs that feature.
