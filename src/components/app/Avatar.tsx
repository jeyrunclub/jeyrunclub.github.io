// Profile pictures.
//
// The avatars bucket is public, so a stored path becomes a URL with no network
// round trip — which is what lets the leaderboard render thirty members at once
// without thirty signed-URL requests. Anyone without a picture falls back to
// the first letter of their name on a tinted disc.

import { useEffect, useRef, useState } from 'react';
import { Camera, Loader2, Trash2, ZoomIn } from 'lucide-react';
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
  const [pending, setPending] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // A photo goes to the cropper first. A centre crop of a running photo is
  // almost never the person's face — they are thirty metres down a road, off
  // to one side — so the circle showed a stranger-sized figure on a street.
  function pick(file: File | undefined) {
    if (!file) return;
    if (file.size > MAX_BYTES) { setError('عکس باید کمتر از ۳ مگابایت باشد.'); return; }
    setError(null);
    setPending(file);
  }

  async function upload(file: File) {
    setPending(null);
    setBusy(true);
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

      {pending && (
        <AvatarCropper
          file={pending}
          onCancel={() => setPending(null)}
          onDone={upload}
        />
      )}
    </div>
  );
}

// Choose what the circle shows.
//
// Drag to move, the slider to zoom, and what is inside the ring is exactly
// what gets uploaded — cropped to a 512px square, which also turns a 3MB phone
// photo into about 60KB. The frame is square while the preview is round
// because the stored file is square: every other place an avatar appears
// masks it differently.
const OUT = 512;

function AvatarCropper({ file, onCancel, onDone }: {
  file: File;
  onCancel: () => void;
  onDone: (file: File) => void;
}) {
  const [src, setSrc] = useState<string | null>(null);
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [box, setBox] = useState(280);
  const [working, setWorking] = useState(false);
  const frameRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);

  useEffect(() => {
    const url = URL.createObjectURL(file);
    setSrc(url);
    const el = new Image();
    el.onload = () => setImg(el);
    el.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);

  // The frame is however wide it ends up on this screen; every number below is
  // in frame pixels, so measuring it once is what keeps the maths honest.
  useEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    const measure = () => setBox(el.clientWidth || 280);
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [src]);

  // Scale at which the photo exactly covers the frame — zoom 1 is "no gaps".
  const base = img ? box / Math.min(img.naturalWidth, img.naturalHeight) : 1;
  const dispW = img ? img.naturalWidth * base * zoom : 0;
  const dispH = img ? img.naturalHeight * base * zoom : 0;

  function clamp(p: { x: number; y: number }) {
    const mx = Math.max(0, (dispW - box) / 2);
    const my = Math.max(0, (dispH - box) / 2);
    return {
      x: Math.min(mx, Math.max(-mx, p.x)),
      y: Math.min(my, Math.max(-my, p.y)),
    };
  }

  useEffect(() => { setPos((p) => clamp(p)); }, [zoom, img, box]);

  function onDown(e: React.PointerEvent) {
    (e.target as Element).setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, ox: pos.x, oy: pos.y };
  }
  function onMove(e: React.PointerEvent) {
    const d = drag.current;
    if (!d) return;
    setPos(clamp({ x: d.ox + (e.clientX - d.x), y: d.oy + (e.clientY - d.y) }));
  }
  function onUp() { drag.current = null; }

  async function confirm() {
    if (!img) return;
    setWorking(true);
    const canvas = document.createElement('canvas');
    canvas.width = OUT;
    canvas.height = OUT;
    const ctx = canvas.getContext('2d');
    if (!ctx) { setWorking(false); return; }

    // The frame, expressed in the source image's own pixels.
    const view = box / (base * zoom);
    const cx = img.naturalWidth / 2 - pos.x / (base * zoom);
    const cy = img.naturalHeight / 2 - pos.y / (base * zoom);
    ctx.drawImage(img, cx - view / 2, cy - view / 2, view, view, 0, 0, OUT, OUT);

    const blob: Blob | null = await new Promise((res) =>
      canvas.toBlob(res, 'image/jpeg', 0.88));
    setWorking(false);
    if (!blob) return;
    onDone(new File([blob], 'avatar.jpg', { type: 'image/jpeg' }));
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-5">
      <div className="nib w-full max-w-sm bg-card p-5 shadow-xl">
        <h3 className="display mb-1 text-xl">عکس را تنظیم کن</h3>
        <p className="mb-4 text-xs text-muted-foreground">
          با انگشت جابه‌جا کن و با نوار زیر بزرگ‌نمایی را تغییر بده.
        </p>

        <div
          ref={frameRef}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          className="relative aspect-square w-full touch-none overflow-hidden rounded-2xl bg-muted"
          style={{ cursor: 'grab' }}
        >
          {src && (
            <img
              src={src}
              alt=""
              draggable={false}
              className="pointer-events-none absolute left-1/2 top-1/2 max-w-none select-none"
              style={{
                width: dispW || undefined,
                height: dispH || undefined,
                transform: `translate(calc(-50% + ${pos.x}px), calc(-50% + ${pos.y}px))`,
              }}
            />
          )}
          {/* The circle the picture will actually live in. The dim is one
              black layer masked with a hole the size of the frame's shortest
              side — closest-side, so the hole is exactly the circle and not
              whatever radius a default radial gradient would pick. */}
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-black/45"
            style={{
              WebkitMaskImage: 'radial-gradient(circle closest-side, transparent 99%, #000 100%)',
              maskImage: 'radial-gradient(circle closest-side, transparent 99%, #000 100%)',
            }}
          />
          <span aria-hidden className="pointer-events-none absolute inset-0 rounded-full ring-2 ring-white/80" />
        </div>

        <div className="mt-4 flex items-center gap-3">
          <ZoomIn className="size-4 shrink-0 text-muted-foreground" />
          <input
            type="range"
            min={1} max={3} step={0.01}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            aria-label="بزرگ‌نمایی"
            className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-secondary accent-primary"
          />
        </div>

        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={confirm}
            disabled={!img || working}
            className="nib-pill flex-1 bg-primary py-2 text-sm font-bold text-primary-foreground shadow-sm disabled:opacity-60"
          >
            {working ? '…' : 'ذخیره'}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="nib-pill flex-1 border border-border py-2 text-sm font-bold text-muted-foreground hover:bg-secondary"
          >
            انصراف
          </button>
        </div>
      </div>
    </div>
  );
}
