// Turning on notifications that arrive with the app closed.
//
// The public VAPID key is public by design — it is handed to the push service
// so it can verify who is sending. The private half lives only in the Edge
// Function's secrets and is never in this repository.

export const VAPID_PUBLIC =
  'BDRdT2KTCFPBCANPTdx05cXTi45IKlDvs4Dut-sXN2SBgF4YFP5-FeAT8RAauA1csPeKW0Zym3Lz3FRVOrrLb_U';

export function pushSupported() {
  return typeof window !== 'undefined'
    && 'serviceWorker' in navigator
    && 'PushManager' in window
    && 'Notification' in window;
}

// iOS only delivers Web Push to a PWA that was added to the Home Screen —
// in a Safari tab the subscribe call fails with no useful error.
export function isIOS() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

export function isInstalled() {
  return window.matchMedia('(display-mode: standalone)').matches
    || window.navigator.standalone === true;
}

function urlBase64ToUint8Array(base64) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

export async function currentSubscription() {
  if (!pushSupported()) return null;
  const reg = await navigator.serviceWorker.ready;
  return await reg.pushManager.getSubscription();
}

export async function enablePush(supabase, userId) {
  if (!pushSupported()) return { error: 'مرورگرت از اعلان پشتیبانی نمی‌کند.' };
  if (isIOS() && !isInstalled()) {
    return { error: 'روی آیفون اول باید اپ را به صفحه‌ی اصلی اضافه کنی.' };
  }

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return { error: 'اجازه‌ی اعلان داده نشد.' };

  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC),
    });
  }

  const json = sub.toJSON();
  const { error } = await supabase.from('push_subscriptions').upsert({
    user_id: userId,
    endpoint: json.endpoint,
    p256dh: json.keys.p256dh,
    auth: json.keys.auth,
    user_agent: navigator.userAgent.slice(0, 200),
  }, { onConflict: 'endpoint' });

  if (error) return { error: 'ثبت نشد. دوباره تلاش کن.' };
  return { error: null };
}

export async function disablePush(supabase) {
  const sub = await currentSubscription();
  if (!sub) return { error: null };
  const endpoint = sub.endpoint;
  await sub.unsubscribe().catch(() => {});
  await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint);
  return { error: null };
}
