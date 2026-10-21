import { createClient } from '@supabase/supabase-js';

// Accept common copy-paste variants: trailing slash, "/rest/v1", stray spaces or quotes.
const url = (import.meta.env.VITE_SUPABASE_URL || '')
  .trim()
  .replace(/^["']|["']$/g, '')
  .replace(/\/(rest|auth)\/v1\/?.*$/, '')
  .replace(/\/+$/, '');
const anonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim().replace(/^["']|["']$/g, '');

export const isConfigured = Boolean(url && anonKey);

// The anon key is public by design; Row Level Security in the database
// decides what each signed-in user may read or change.
export const supabase = isConfigured
  ? createClient(url, anonKey, {
      // 'implicit' so an emailed link works on any device, not only the one that sent it.
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'implicit' },
    })
  : null;

/** Throws the Supabase error (if any) and returns data. */
export function unwrap({ data, error }) {
  if (error) throw error;
  return data;
}
