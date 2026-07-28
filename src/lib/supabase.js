// URL + publishable key are safe to embed in the client — Supabase's docs
// call them public credentials. Row-Level Security protects the data.
// The SECRET key never goes in this file (or anywhere in the client).
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://nkctjiylwdwyluvipegi.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_Wv_Wp27np6L0O2YE7exqeQ_qxA2OEfA';

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: 'pkce',
  },
});
