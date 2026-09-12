// Profile pictures.
//
// The avatars bucket is public, so a stored path becomes a URL with no network
// round trip — which is what lets the leaderboard render thirty members at once
// without thirty signed-URL requests. Anyone without a picture falls back to
// the first letter of their name on a tinted disc.

import { useRef, useState } from 'react';
import { Camera, Loader2, Trash2 } from 'lucide-react';
import { supabase } from '../../lib/supabase.js';
import { avatarUrl, uploadAvatar, removeAvatar } from '../../lib/plan.js';
import { cn } from '../../lib/utils';

const MAX_BYTES = 3 * 1024 * 1024; // matches the bucket's file_size_limit

export function Avatar({ name, path, url, size = 40, className }: {
  name?: string | null;
  path?: string | null;
  url?: string | null;
  size?: number;
  className?: string;
}) {
  const src = url ?? (path ? avatarUrl(supabase, path) : null);
  const letter = (name || '').trim().charAt(0) || '؟';

  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-accent font-bold text-primary',
        className,
      )}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.42) }}
    >
      {src
        ? <img src={src} alt="" className="size-full object-cover" loading="lazy" decoding="async" />
        : letter}
    </span>
  );
}

export function AvatarPicker({ userId, name, path, size = 72, onChange }: {
  userId: string;
  name?: string | null;
  path: string | null;
  size?: number;
  onChange: (path: string | null) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function pick(file: File | undefined) {
    if (!file) return;
    if (file.size > MAX_BYTES) { setError('عکس باید کمتر از ۳ مگابایت باشد.'); return; }
    setBusy(true);
    setError(null);
    const old = path;
    const { path: next, error: err } = await uploadAvatar(supabase, userId, file);
    setBusy(false);
    if (err || !next) { setError('آپلود نشد. دوباره تلاش کن.'); return; }
    onChange(next);
    // Only now is the old file unreferenced.
    if (old && old !== next) {
      await supabase.storage.from('avatars').remove([old]);
    }
  }

  async function drop() {
    setBusy(true);
    await removeAvatar(supabase, userId, path);
    setBusy(false);
    onChange(null);
  }

  return (
    <div className="flex items-center gap-3">
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ''; }}
      />

      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        disabled={busy}
        aria-label={path ? 'تغییر عکس پروفایل' : 'انتخاب عکس پروفایل'}
        className="group relative rounded-full ring-2 ring-transparent transition-all hover:ring-primary"
      >
        <Avatar name={name} path={path} size={size} />
        <span className="absolute -bottom-0.5 -end-0.5 flex size-7 items-center justify-center rounded-full border-2 border-card bg-primary text-white">
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Camera className="size-3.5" />}
        </span>
      </button>

      <div className="min-w-0">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={busy}
          className="block text-sm font-bold text-primary hover:underline"
        >
          {path ? 'تغییر عکس' : 'انتخاب عکس پروفایل'}
        </button>
        {path && (
          <button
            type="button"
            onClick={drop}
            disabled={busy}
            className="mt-0.5 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="size-3" />
            حذف
          </button>
        )}
        {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
      </div>
    </div>
  );
}
