# InterviewLoop account setup

1. Copy `.env.example` to `.env.local` in the frontend directory.
2. In the Supabase project's **Connect** dialog or API Keys settings, find the Project URL and **Publishable key**. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` respectively. Never put a database password or a secret/service-role key in a frontend environment file.
3. In **Authentication → Sign In / Providers → User Signups**, leave **Allow new users to sign up** on, turn **Confirm email** off, and click **Save changes**. Set the minimum password length to 8 under the project's Auth settings to enforce the same minimum on the server.
4. Restart Vite if you changed the environment file. Register using a new email address and check that you land on the Account page immediately. Refresh to check that the session stays active, log out, and log back in.

See [Supabase Auth with React](https://supabase.com/docs/guides/auth/quickstarts/react) and [Auth configuration](https://supabase.com/docs/guides/auth/general-configuration).

## Account deletion

In `backend/.env`, set `SUPABASE_URL` to the same project URL as the frontend, `SUPABASE_PUBLISHABLE_KEY` to the same publishable key, and `SUPABASE_SECRET_KEY` to the project's `sb_secret_…` key from **Settings → API Keys**. Restart the Node.js backend. The endpoint verifies the caller's access token and deletes only the authenticated user's account. Public reviews are stored separately and remain visible.
