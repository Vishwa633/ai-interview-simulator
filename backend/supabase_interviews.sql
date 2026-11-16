BEGIN;

CREATE SCHEMA IF NOT EXISTS interviewloop;

CREATE TABLE IF NOT EXISTS interviewloop.practice_sessions (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  question text NOT NULL,
  job_description text NOT NULL,
  project_notes text NOT NULL,
  answer text,
  feedback jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE interviewloop.practice_sessions
  ADD COLUMN IF NOT EXISTS follow_up_answer text,
  ADD COLUMN IF NOT EXISTS summary jsonb,
  ADD COLUMN IF NOT EXISTS planned_questions jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS planned_answers jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS cv_pdf bytea,
  ADD COLUMN IF NOT EXISTS github_url text,
  ADD COLUMN IF NOT EXISTS portfolio_url text,
  ADD COLUMN IF NOT EXISTS adaptive_state jsonb,
  ADD COLUMN IF NOT EXISTS adaptive_revision integer NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS practice_sessions_user_history_idx
  ON interviewloop.practice_sessions (user_id, id DESC);

ALTER TABLE interviewloop.practice_sessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE interviewloop.practice_sessions FROM PUBLIC, anon, authenticated;

COMMIT;
