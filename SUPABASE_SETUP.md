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

## 3. Configure email + password auth

- Dashboard → **Authentication → URL Configuration**.
  - **Site URL:** `https://jeyrun.com`
  - **Redirect URLs:** add `https://jeyrun.com/app/*` and (for local
    dev) `http://localhost:4321/app/*`.
- Dashboard → **Authentication → Providers → Email**.
  - Enable **Email**.
  - **"Confirm email"** = **OFF** — users can sign in immediately after
    registering. This avoids the "confirmation link doesn't open" problem
    on some networks / mail apps.
  - Leave "Enable Signups" ON (open signup, coach approves).
  - Magic link no longer required; can leave on or off.

Password reset still uses email (the "Forgot password?" link on the
login page calls `resetPasswordForEmail`). If your users can't receive
Supabase emails at all, tell them to contact the coach for a manual
reset instead.

## 3b. Turnstile captcha (recommended, blocks spam signups)

Because signup no longer requires clicking an email link, add a captcha
so bots can't create garbage accounts.

1. Cloudflare dashboard → **Turnstile → Add site**. Domain: `jeyrun.com`.
   Widget mode: Managed. Grab the **Site key** and **Secret key**.
2. In `src/components/app/LoginPage.tsx`, set:
   ```ts
   const TURNSTILE_SITE_KEY = 'PASTE_SITE_KEY_HERE';
   ```
3. Supabase dashboard → **Authentication → Attack Protection → Captcha**.
   - Enable, provider = **Cloudflare Turnstile**, paste the **secret key**.
4. Redeploy the site. The captcha widget appears above the signup button
   and the token is passed to `supabase.auth.signUp({ options: { captchaToken } })`.

Signin is not gated (no spam risk — credentials must already be valid).
Leave `TURNSTILE_SITE_KEY` empty during local dev to skip the widget.

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
