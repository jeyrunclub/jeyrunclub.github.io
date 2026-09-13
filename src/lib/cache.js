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

function read(key) {
  const hit = mem.get(key);
  if (hit) return hit;
  try {
    const raw = sessionStorage.getItem('jeyrun.c.' + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    mem.set(key, parsed);
    return parsed;
  } catch { return null; }
}

function write(key, value) {
  const entry = { at: Date.now(), value };
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
