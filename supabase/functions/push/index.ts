// Sends one notification to every device a member has registered.
//
// Called by a trigger on public.notifications, which posts the row here and
// does not wait for the answer. Everything secret lives in the function's
// environment: the VAPID private key, the service-role key used to read the
// subscriptions, and the shared secret that proves the caller is our trigger.
//
// Deploy:  supabase functions deploy push --no-verify-jwt
// Secrets: supabase secrets set VAPID_PUBLIC=... VAPID_PRIVATE=... \
//            VAPID_SUBJECT=mailto:you@example.com PUSH_SECRET=...

import webpush from 'npm:web-push@3.6.7';
import { createClient } from 'npm:@supabase/supabase-js@2';

const VAPID_PUBLIC  = Deno.env.get('VAPID_PUBLIC')!;
const VAPID_PRIVATE = Deno.env.get('VAPID_PRIVATE')!;
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:admin@jeyrun.com';
const PUSH_SECRET   = Deno.env.get('PUSH_SECRET')!;

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);

const admin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('method', { status: 405 });
  if (req.headers.get('x-push-secret') !== PUSH_SECRET) {
    return new Response('forbidden', { status: 403 });
  }

  const { user_id, title, body, href, image_path } = await req.json();
  if (!user_id || !title) return new Response('bad request', { status: 400 });

  const { data: subs, error } = await admin
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .eq('user_id', user_id);
  if (error) return new Response(error.message, { status: 500 });

  // The bucket is private, so the picture travels as a signed URL. A day is
  // long enough for a notification that is read late and short enough that the
  // link is not a lasting key to the file.
  let image: string | undefined;
  if (image_path) {
    const { data } = await admin.storage.from('feed-photos')
      .createSignedUrl(image_path, 60 * 60 * 24);
    image = data?.signedUrl;
  }

  const payload = JSON.stringify({ title, body, href, image });
  let sent = 0;
  const dead: string[] = [];

  await Promise.all((subs ?? []).map(async (s) => {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        payload,
      );
      sent++;
    } catch (e) {
      // 404/410 mean the browser threw the subscription away; anything else
      // is transient and the row stays.
      const code = (e as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) dead.push(s.id);
    }
  }));

  if (dead.length) {
    await admin.from('push_subscriptions').delete().in('id', dead);
  }
  return Response.json({ sent, removed: dead.length });
});
