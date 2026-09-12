// The student's own record of one day: did it, how it went, and a photo.
//
// The coach owns the plan and can only read this back. Saves are immediate for
// the tick and the photo (one gesture, one result) and explicit for the note,
// so a half-typed sentence is never written.

import { useEffect, useRef, useState } from 'react';
import { Check, Camera, Loader2, Trash2, X } from 'lucide-react';
import { supabase } from '../../lib/supabase.js';
import {
  saveDayLog, uploadDayPhoto, signedPhotoUrl, removeDayPhoto,
} from '../../lib/plan.js';
import { Button } from '../ui/button';
import { Textarea } from '../ui/textarea';
import { cn } from '../../lib/utils';

export type Log = {
  day?: string;
  done: boolean;
  note: string | null;
  photo_path: string | null;
};

const MAX_BYTES = 10 * 1024 * 1024; // matches the bucket's file_size_limit

export function DayLog({ studentId, day, log, onChange, bare }: {
  studentId: string;
  day: string;
  log: Log | undefined;
  onChange: (day: string, log: Log) => void;
  /** Drop the card chrome so this can sit inside the day's card. */
  bare?: boolean;
}) {
  const done = !!log?.done;
  const photoPath = log?.photo_path || null;

  const [note, setNote] = useState(log?.note || '');
  const [busy, setBusy] = useState<'' | 'done' | 'note' | 'photo'>('');
  const [error, setError] = useState<string | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Reset the draft when the day changes under us
  useEffect(() => { setNote(log?.note || ''); setError(null); }, [day, log?.note]);

  // The bucket is private: every render needs a fresh signed URL.
  useEffect(() => {
    let alive = true;
    if (!photoPath) { setPhotoUrl(null); return; }
    signedPhotoUrl(supabase, photoPath).then((u) => { if (alive) setPhotoUrl(u); });
    return () => { alive = false; };
  }, [photoPath]);

  const noteDirty = note.trim() !== (log?.note || '').trim();

  async function write(fields: Partial<Log>, kind: 'done' | 'note' | 'photo') {
    setBusy(kind);
    setError(null);
    const { data, error: err } = await saveDayLog(supabase, studentId, day, fields);
    setBusy('');
    if (err) { setError('ذخیره نشد. دوباره تلاش کن.'); return false; }
    onChange(day, {
      done: data?.done ?? false,
      note: data?.note ?? null,
      photo_path: data?.photo_path ?? null,
    });
    return true;
  }

  async function pickPhoto(file: File | undefined) {
    if (!file) return;
    if (file.size > MAX_BYTES) { setError('عکس باید کمتر از ۱۰ مگابایت باشد.'); return; }
    setBusy('photo');
    setError(null);
    const { path, error: upErr } = await uploadDayPhoto(supabase, studentId, day, file);
    if (upErr || !path) { setBusy(''); setError('آپلود نشد. دوباره تلاش کن.'); return; }
    const old = photoPath;
    const ok = await write({ photo_path: path }, 'photo');
    if (ok && old && old !== path) await removeDayPhoto(supabase, old);
  }

  async function dropPhoto() {
    if (!photoPath) return;
    const old = photoPath;
    const ok = await write({ photo_path: null }, 'photo');
    if (ok) await removeDayPhoto(supabase, old);
  }

  return (
    <div className={cn(
      bare
        ? 'border-t border-border px-6 pb-5 pt-4'
        : 'nib mt-4 border border-border bg-card p-4 shadow-sm',
    )}>
      {/* Did it */}
      <button
        type="button"
        onClick={() => write({ done: !done }, 'done')}
        disabled={busy === 'done'}
        aria-pressed={done}
        className={cn(
          'nib-sm flex w-full items-center gap-3 border px-4 py-3 text-start transition-all',
          done
            ? 'border-easy/40 bg-easy/10'
            : 'border-border hover:border-primary/50 hover:bg-accent/40',
        )}
      >
        <span className={cn(
          'flex size-7 shrink-0 items-center justify-center rounded-full border-2 transition-colors',
          done ? 'border-easy bg-easy text-white tick-pop' : 'border-muted-foreground/40',
        )}>
          {busy === 'done'
            ? <Loader2 className="size-4 animate-spin" />
            : done && <Check className="size-4" />}
        </span>
        <span className="min-w-0 flex-1">
          <span className={cn('block text-sm font-bold', done && 'text-easy')}>
            {done ? 'انجام شد' : 'انجامش دادی؟'}
          </span>
          <span className="block text-xs text-muted-foreground">
            {done ? 'برای سالار ثبت شد.' : 'بعد از تمرین اینجا را بزن.'}
          </span>
        </span>
      </button>

      {/* How it went */}
      <div className="mt-3">
        <Textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          dir="auto"
          placeholder="چطور بود؟ (اختیاری)"
          className="field-sizing-content min-h-16 text-sm leading-7"
        />
        {noteDirty && (
          <div className="mt-2 flex justify-end">
            <Button
              size="sm"
              onClick={() => write({ note: note.trim() || null }, 'note')}
              disabled={busy === 'note'}
            >
              {busy === 'note' ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
              ذخیره‌ی یادداشت
            </Button>
          </div>
        )}
      </div>

      {/* Photo */}
      <div className="mt-3">
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(e) => { pickPhoto(e.target.files?.[0]); e.target.value = ''; }}
        />
        {photoUrl ? (
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setLightbox(true)}
              className="nib-sm size-16 overflow-hidden border border-border"
            >
              <img src={photoUrl} alt="عکس تمرین" className="size-full object-cover" />
            </button>
            <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={busy === 'photo'}>
              <Camera className="size-4" />
              تعویض
            </Button>
            <Button
              variant="ghost" size="sm" onClick={dropPhoto} disabled={busy === 'photo'}
              className="text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="size-4" />
              حذف
            </Button>
          </div>
        ) : (
          <Button
            variant="outline" size="sm"
            onClick={() => fileRef.current?.click()}
            disabled={busy === 'photo'}
          >
            {busy === 'photo'
              ? <Loader2 className="size-4 animate-spin" />
              : <Camera className="size-4" />}
            افزودن عکس
          </Button>
        )}
      </div>

      {error && (
        <p className="mt-3 rounded-xl border border-destructive/25 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {error}
        </p>
      )}

      {lightbox && photoUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-6"
          onClick={() => setLightbox(false)}
        >
          <button
            type="button"
            aria-label="بستن"
            className="absolute end-5 top-5 rounded-full bg-white/15 p-2 text-white"
          >
            <X className="size-5" />
          </button>
          <img src={photoUrl} alt="عکس تمرین" className="max-h-full max-w-full rounded-2xl object-contain" />
        </div>
      )}
    </div>
  );
}
