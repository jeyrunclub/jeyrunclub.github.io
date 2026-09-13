// Copy every stored file to the new project.
//
// The database rows in storage.objects are deliberately not restored: uploading
// recreates them, and at the same paths, which is all the app depends on —
// profiles.avatar_path, day_logs.photo_path and announcements.photo_path are
// the only things that point at a file.
//
// Re-runnable. Anything already on the far side at the same size is skipped, so
// an interrupted copy can simply be started again.

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

const BUCKETS = ['avatars', 'session-photos', 'feed-photos'];
const CONCURRENCY = 4;

// Supabase returns folders as entries with a null id, so this walks rather
// than assuming one flat level of user-id directories.
async function listAll(client, bucket, prefix = '') {
  const out = [];
  let offset = 0;
  for (;;) {
    const { data, error } = await client.storage.from(bucket)
      .list(prefix, { limit: 1000, offset });
    if (error) throw new Error(`${bucket}/${prefix}: ${error.message}`);
    if (!data.length) break;
    for (const item of data) {
      const path = prefix ? `${prefix}/${item.name}` : item.name;
      if (item.id === null) out.push(...await listAll(client, bucket, path));
      else out.push({ path, size: item.metadata?.size ?? 0 });
    }
    if (data.length < 1000) break;
    offset += data.length;
  }
  return out;
}

async function copyOne(bucket, file, existing) {
  if (existing.get(file.path) === file.size) return 'skip';

  const { data: blob, error: dErr } = await src.storage.from(bucket).download(file.path);
  if (dErr) throw new Error(`download ${bucket}/${file.path}: ${dErr.message}`);

  const { error: uErr } = await dst.storage.from(bucket).upload(
    file.path,
    Buffer.from(await blob.arrayBuffer()),
    { contentType: blob.type || 'application/octet-stream', upsert: true },
  );
  if (uErr) throw new Error(`upload ${bucket}/${file.path}: ${uErr.message}`);
  return 'copied';
}

for (const bucket of BUCKETS) {
  const files = await listAll(src, bucket);
  const there = await listAll(dst, bucket).catch(() => []);
  const existing = new Map(there.map((f) => [f.path, f.size]));

  let copied = 0, skipped = 0;
  const queue = [...files];
  await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
    for (;;) {
      const file = queue.shift();
      if (!file) return;
      const r = await copyOne(bucket, file, existing);
      if (r === 'copied') copied++; else skipped++;
      process.stdout.write(`\r  ${bucket}: ${copied + skipped}/${files.length}`);
    }
  }));
  process.stdout.write(`\r  ${bucket}: ${copied} copied, ${skipped} already there (of ${files.length})\n`);
}
console.log('✓ storage copied');
