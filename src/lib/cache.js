// A tiny stale-while-revalidate cache for the app's per-page reads.
//
// With client-side routing the module scope survives a page change, so the
// profile that every page asks for — and which changes about once a season —
// no longer costs a round trip on each switch. Measured: a switch was
// 400–800ms of Supabase calls after the document had already arrived.
//
// sessionStorage backs it so a hard reload is warm too. Nothing here is a
// source of truth: every hit still revalidates in the background, and a write
// elsewhere in the app calls drop().

const mem = new Map();

// Whose data is in here.
//
// Without this, signing out and signing in as someone else left the previous
// member's profile, week, streak and feed sitting in sessionStorage under the
// same key names — and the next person to use the phone read them. Every
// entry is stamped, every read checks, and both sign-in and sign-out wipe the
// lot. Three defences because one of them being wrong is somebody seeing
// another member's training.
let owner = '';

export function setCacheOwner(id) {
  const next = String(id || '');
  if (next === owner) return;
  owner = next;
  mem.clear();
}

export function clearAll() {
  owner = '';
  mem.clear();
  try {
    for (const k of Object.keys(sessionStorage)) {
      if (k.startsWith('jeyrun.c.')) sessionStorage.removeItem(k);
    }
  } catch {}
}

function read(key) {
  const hit = mem.get(key);
  if (hit) return hit.owner === owner ? hit : null;
  try {
    const raw = sessionStorage.getItem('jeyrun.c.' + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed.owner !== owner) return null;   // somebody else's
    mem.set(key, parsed);
    return parsed;
  } catch { return null; }
}

function write(key, value) {
  const entry = { at: Date.now(), owner, value };
  mem.set(key, entry);
  try { sessionStorage.setItem('jeyrun.c.' + key, JSON.stringify(entry)); } catch {}
}

export function drop(key) {
  mem.delete(key);
  try { sessionStorage.removeItem('jeyrun.c.' + key); } catch {}
}

// Returns [value, revalidating]. `onFresh` is called if the background read
// produced something different from what was handed back.
export async function swr(key, loader, { maxAge = 30000, onFresh } = {}) {
  const hit = read(key);
  const fresh = hit && Date.now() - hit.at < maxAge;

  if (hit) {
    // Hand back what we have, then check behind the reader's back.
    if (!fresh) {
      loader().then((value) => {
        if (value === undefined || value === null) return;
        write(key, value);
        if (onFresh && JSON.stringify(value) !== JSON.stringify(hit.value)) onFresh(value);
      }).catch(() => {});
    }
    return hit.value;
  }

  const value = await loader();
  if (value !== undefined && value !== null) write(key, value);
  return value;
}
