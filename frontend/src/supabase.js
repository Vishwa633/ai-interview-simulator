import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL?.trim()
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim()

export const supabase = /^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(url ?? '') && key?.startsWith('sb_publishable_')
  ? createClient(url, key, { auth: { detectSessionInUrl: false } })
  : null
