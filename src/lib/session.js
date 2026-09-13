// Who is signed in, asked once per session rather than once per page.

import { swr, drop } from './cache.js';

export const PROFILE_KEY = 'profile';

export async function getSessionUser(supabase) {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.user || null;
}

// The signed-in member's profile row. Served from cache immediately and
// re-read in the background; `onFresh` fires only when something changed.
export async function getProfile(supabase, userId, onFresh) {
  return await swr(
    PROFILE_KEY,
    async () => {
      const { data } = await supabase.from('profiles').select('*').eq('id', userId).single();
      return data || null;
    },
    { maxAge: 60000, onFresh },
  );
}

// After anything that edits the signed-in member's own row.
export function forgetProfile() { drop(PROFILE_KEY); }
