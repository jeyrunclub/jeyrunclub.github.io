// Set a user's password directly, and confirm their email.
//
// For when Supabase's outbound mail isn't working and someone is locked out:
// the admin API writes the password server-side, so no email is involved.
//
// Needs the SECRET key (service_role), which bypasses RLS entirely. Never put
// it in src/, never commit it, never paste it anywhere shared. Get it from
// Supabase → Project Settings → API → service_role, and pass it as an env var
// for the one command:
//
//   SUPABASE_SECRET_KEY='...' node scripts/set-password.mjs someone@example.com 'NewPassw0rd!'
//
// Add --no-confirm to skip marking the email confirmed.

import { createClient } from '@supabase/supabase-js';

const URL = 'https://nkctjiylwdwyluvipegi.supabase.co';
const KEY = process.env.SUPABASE_SECRET_KEY;

const args = process.argv.slice(2).filter((a) => a !== '--no-confirm');
const confirm = !process.argv.includes('--no-confirm');
const [email, password] = args;

if (!KEY) {
  console.error('Set SUPABASE_SECRET_KEY (Project Settings → API → service_role).');
  process.exit(1);
}
if (!email || !password) {
  console.error('Usage: SUPABASE_SECRET_KEY=... node scripts/set-password.mjs <email> <password> [--no-confirm]');
  process.exit(1);
}
if (password.length < 8) {
  console.error('Password must be at least 8 characters.');
  process.exit(1);
}

const admin = createClient(URL, KEY, { auth: { persistSession: false } });

// There's no "get user by email", so page through until we find them.
async function findByEmail(target) {
  const wanted = target.trim().toLowerCase();
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const hit = data.users.find((u) => (u.email || '').toLowerCase() === wanted);
    if (hit) return hit;
    if (data.users.length < 200) return null;
  }
  return null;
}

const user = await findByEmail(email);
if (!user) {
  console.error(`No user with email ${email}`);
  process.exit(1);
}

const { error } = await admin.auth.admin.updateUserById(user.id, {
  password,
  ...(confirm ? { email_confirm: true } : {}),
});
if (error) {
  console.error('Failed:', error.message);
  process.exit(1);
}

console.log(`✓ ${email}`);
console.log(`  id            ${user.id}`);
console.log(`  password      set`);
console.log(`  email         ${confirm ? 'confirmed' : 'left as-is'}`);
console.log(`  was confirmed ${user.email_confirmed_at || 'no'}`);
console.log('\nThey can now sign in at https://jeyrun.com/app/login');
console.log('Salar still has to approve them in the coach panel.');
