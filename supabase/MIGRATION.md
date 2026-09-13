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
