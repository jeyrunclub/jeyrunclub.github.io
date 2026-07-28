# Jeyrun member app — Supabase setup

One-time setup for the login / workout-plan area (`/app`).

## 1. Rotate the secret key (if you shared it)

If you ever pasted `SUPABASE_SECRET_KEY` in a chat, message, or file:

- Supabase dashboard → **Settings → API → Roll secret key**.

The **publishable key** and **URL** are safe to embed in the site (they're
already in `src/lib/supabase.js`). RLS is what protects the data.

## 2. Run the schema

- Supabase dashboard → **SQL Editor → New query**.
- Paste the contents of `supabase/schema.sql`.
- Run.

Creates: `profiles`, `plans`, RLS policies, `is_coach()` helper,
`set_profile_status()` RPC, auto-profile trigger on signup.

Safe to re-run; it's idempotent.

## 3. Configure magic-link email

- Dashboard → **Authentication → URL Configuration**.
  - **Site URL:** `https://jeyrun.com`
  - **Redirect URLs:** add `https://jeyrun.com/app/*` and (for local
    dev) `http://localhost:4321/app/*`.
- Dashboard → **Authentication → Providers → Email**.
  - Enable **Email**.
  - Enable **"Confirm email"** = on.
  - Enable **"Enable Magic Link"** = on.
  - Disable "Enable Signups" only if you want signup fully off. Leave on
    for the "open signup, coach approves" flow we chose.

Free tier limit: 4 auth-emails / hour from Supabase's built-in SMTP. If
that becomes a problem, wire in Resend / SendGrid under **Auth → SMTP**.

## 4. Coach accounts

`pjsofts@gmail.com` is already on the auto-coach list — the first time
that email signs in at `/app/login`, it's created as an approved coach
automatically.

**To add Salar (or anyone else) as coach:**

1. Open `supabase/schema.sql` and edit `_is_bootstrap_coach()` — add the
   email to the array (uncomment / duplicate the example line).
2. Re-run the whole `schema.sql` in the Supabase SQL editor. It's idempotent;
   existing coach accounts stay coach, and any account already created with
   the new email gets promoted immediately.

Coaches see `/app/coach` and can approve/reject pending signups and edit
weekly plans.

## 5. Done

- New students sign up at `/app/login`, land on `/app/pending` until Salar
  approves them from `/app/coach`.
- Once approved, they see their current week's plan at `/app`.
