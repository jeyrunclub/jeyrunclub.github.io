// Count everything on both sides and print them next to each other.
//
// A migration that "worked" and quietly dropped half the day logs looks exactly
// like one that worked, until somebody notices their streak is gone.

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';

const env = Object.fromEntries(
  readFileSync(new URL('./.env', import.meta.url), 'utf8')
    .split('\n')
    .filter((l) => l.trim() && !l.trim().startsWith('#'))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')];
    }),
);

const src = createClient(env.SOURCE_URL, env.SOURCE_SERVICE_KEY, { auth: { persistSession: false } });
const dst = createClient(env.TARGET_URL, env.TARGET_SERVICE_KEY, { auth: { persistSession: false } });

const TABLES = [
  'profiles', 'plans', 'day_logs',
  'announcements', 'announcement_comments', 'announcement_likes',
  'events', 'event_entries', 'personal_records',
  'push_subscriptions',
];

async function count(client, table) {
  const { count, error } = await client.from(table).select('*', { count: 'exact', head: true });
  return error ? `err: ${error.message.slice(0, 30)}` : count;
}

async function objects(client, bucket) {
  let total = 0;
  const walk = async (prefix = '') => {
    const { data, error } = await client.storage.from(bucket).list(prefix, { limit: 1000 });
    if (error) return;
    for (const i of data) {
      const p = prefix ? `${prefix}/${i.name}` : i.name;
      if (i.id === null) await walk(p); else total++;
    }
  };
  await walk();
  return total;
}

let bad = 0;
console.log('table                      source   target');
for (const t of TABLES) {
  const [a, b] = await Promise.all([count(src, t), count(dst, t)]);
  const ok = a === b;
  if (!ok) bad++;
  console.log(`${t.padEnd(26)} ${String(a).padStart(6)}   ${String(b).padStart(6)}  ${ok ? '' : '  ← differs'}`);
}
for (const b of ['avatars', 'session-photos', 'feed-photos']) {
  const [x, y] = await Promise.all([objects(src, b), objects(dst, b)]);
  const ok = x === y;
  if (!ok) bad++;
  console.log(`${('files: ' + b).padEnd(26)} ${String(x).padStart(6)}   ${String(y).padStart(6)}  ${ok ? '' : '  ← differs'}`);
}

// auth.users is not reachable through the REST API; ask the admin API instead.
const users = async (c) => {
  const { data, error } = await c.auth.admin.listUsers({ perPage: 1000 });
  return error ? `err` : data.users.length;
};
const [ua, ub] = await Promise.all([users(src), users(dst)]);
console.log(`${'auth users'.padEnd(26)} ${String(ua).padStart(6)}   ${String(ub).padStart(6)}  ${ua === ub ? '' : '  ← differs'}`);
if (ua !== ub) bad++;

console.log(bad ? `\n${bad} mismatch(es) — do not switch the client over yet.` : '\nall matched.');
process.exit(bad ? 1 : 0);
