# Moving the project to eu-central-1

Measured from Tehran, TCP connect to AWS regional endpoints:

| region                    | connect |
|---------------------------|---------|
| ap-south-1 (Mumbai, now)  | 454ms   |
| eu-central-1 (Frankfurt)  | 195ms   |
| eu-west-1 (Ireland)       | 210ms   |

About 260ms per request, and roughly three round trips before the first byte
of a cold connection — most of a second, on every login and every save.

## What moves and what does not

- **Passwords move.** `auth.users` carries the hashes, so nobody resets anything.
- **Sessions do not.** Tokens are signed per project: everyone signs in once more.
- **Push subscriptions survive.** They are bound to our VAPID key, not the project.
- **Storage files are copied by hand.** The database rows describing them are
  not restored; the uploads recreate them, at the same paths, which is what the
  `avatar_path` and `photo_path` columns point at.
- **Notifications are left behind.** They are a log of things already read.

## Order

Nothing here is destructive to the old project. It keeps running until the
last step, and the last step is a one-line revert if anything is wrong.

1. **Create the project** in the dashboard, region `eu-central-1`. Keep the
   database password — it is shown once.
2. **Build the schema**: paste `supabase/schema.sql` into the new project's SQL
   editor and run it. It is the whole thing — tables, policies, functions,
   triggers, buckets — and it is idempotent.
3. **Fill `scripts/migrate/.env`** from `.env.example`. It is gitignored; the
   keys in it never belong in a commit.
4. **Dump**: `./scripts/migrate/01-dump.sh` → writes `out/auth.sql` and `out/public.sql`.
5. **Restore**: `./scripts/migrate/02-restore.sh`. Runs inside one transaction
   with `session_replication_role = replica`, so a failure leaves nothing
   behind and the notification triggers do not fire on a decade of history.
6. **Storage**: `node scripts/migrate/03-storage.mjs`. Re-runnable; it skips
   files already there.
7. **Verify**: `node scripts/migrate/04-verify.mjs`. Compares row counts and
   object counts between the two projects.
8. **Edge Function**:
   `npx supabase functions deploy push --project-ref <new-ref> --no-verify-jwt`,
   then `npx supabase secrets set --project-ref <new-ref> …` with the same four
   values, and in the new project's SQL editor:
   `select public.set_push_config('https://<new-ref>.functions.supabase.co/push', '<same secret>');`
9. **Point the app at it**: change the URL and publishable key in
   `src/lib/supabase.js`, deploy, done.

## The window

Between the dump (4) and the client swap (9), a write to the old project is a
write that gets left behind. It is a few minutes of work; do it when nobody is
mid-session — not at 6am, and not on a رکوردگیری morning.

## Rollback

Revert the commit from step 9 and deploy. The old project was never touched.

---

# Log — 2026-09-13

Data moved from `nkctjiylwdwyluvipegi` (ap-south-1) to `uddcfcacobobsbswzkev`
(eu-central-1). The old project was left running and untouched throughout.

## What happened

**Direct connections were unreachable.** `db.<ref>.supabase.co` resolves to
IPv6 only now, and the machine doing the work had no IPv6 route. The session
pooler is IPv4: `aws-1-ap-south-1` for the old project, `aws-0-eu-central-1`
for the new one. Note the differing `aws-N` — the wrong one answers
"tenant/user not found", which reads like a credentials problem and is not.

**schema.sql had drifted.** `push.sql`, `push-rich.sql`,
`notifications-clear.sql` and `likers.sql` had been written as standalone files
and never folded in, so a project built from schema.sql came out with 10 tables
where the source had 12. Applied separately at the time; now merged in, so the
next project built from that file is whole.

**One service key was a duplicate.** `SOURCE_SERVICE_KEY` held a second copy of
the *new* project's key — both keys authenticated against the new project and
neither against the old. The symptom was "signature verification failed" from
the storage copy, which says nothing about which key is wrong. Testing each key
against both projects is the quick way to see it.

## Result

    profiles 22 · auth users 22 · plans 22 · day_logs 15
    announcements 4 · comments 1 · likes 12
    events 1 · entries 2 · personal_records 2 · push_subscriptions 6
    files: avatars 4 · session-photos 4 · feed-photos 1
    buckets: avatars public, the other two private, limits identical

`04-verify.mjs` reported every count matching.

## Still to do

The new project belongs to a different Supabase account, so the tooling here
could reach its database but not its platform API.

1. Deploy the Edge Function to the new ref and set the same four secrets,
   choosing a fresh `PUSH_SECRET`.
2. `select public.set_push_config('https://uddcfcacobobsbswzkev.functions.supabase.co/push', '<that secret>');`
3. Put the new URL and publishable key into `src/lib/supabase.js` and deploy.

Until step 3 the app is still talking to Mumbai, and anything written there
after the dump will not be in Frankfurt. Re-running `01-dump.sh` and
`02-restore.sh` is safe but would collide on primary keys — clear the target's
public tables first, or accept the gap and move quickly.
