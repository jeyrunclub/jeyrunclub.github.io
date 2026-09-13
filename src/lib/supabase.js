// URL + publishable key are safe to embed in the client — Supabase's docs
// call them public credentials. Row-Level Security protects the data.
// The SECRET key never goes in this file (or anywhere in the client).
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://uddcfcacobobsbswzkev.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable__d1biZ5rju3S7f38RYx4gA_aDz0xN7r';

// Implicit flow: tokens land directly in the URL fragment on the callback.
// Works across devices / webviews (iPhone Mail → Safari, desktop → phone, etc.)
// PKCE breaks that flow because the code_verifier lives in the originating
// browser's storage — the device that opens the email link doesn't have it.
export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: 'implicit',
  },
});
