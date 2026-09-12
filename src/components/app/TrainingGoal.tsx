// What the runner is training for, in their own words.
//
// Free text on purpose: a goal is usually a race — «ماراتن استانبول», «صعود
// دماوند» — not a time. The student writes it; Salar can also set it from the
// panel. The profiles column grant is role-wide and the self-edit policy is
// `id = auth.uid()`, so a student only ever writes their own row.

import { useState } from 'react';
import { Check, Pencil, Target, X, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase.js';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { cn } from '../../lib/utils';

const PLACEHOLDER = 'مثلاً ماراتن استانبول ۲۰۲۶';

export function TrainingGoal({ studentId, goal, onSave }: {
  studentId: string;
  goal: string | null;
  onSave: (goal: string | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(goal || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function open() {
    setDraft(goal || '');
    setError(null);
    setEditing(true);
  }

  async function save() {
    setSaving(true);
    setError(null);
    const next = draft.trim() || null;
    const { error: err } = await supabase.from('profiles')
      .update({ training_goal: next }).eq('id', studentId);
    setSaving(false);
    if (err) { setError('ذخیره نشد. دوباره تلاش کن.'); return; }
    onSave(next);
    setEditing(false);
  }

  return (
    <div className="nib border border-border bg-card p-4 shadow-sm">
      <div className="flex items-center gap-1.5 text-[0.7rem] font-semibold text-muted-foreground">
        <Target className="size-3.5" />
        هدف تمرینی
        {!editing && (
          <button
            type="button"
            onClick={open}
            aria-label={goal ? 'ویرایش هدف' : 'ثبت هدف'}
            className="ms-auto rounded-full p-1 text-muted-foreground transition-colors hover:text-primary"
          >
            <Pencil className="size-3.5" />
          </button>
        )}
      </div>

      {editing ? (
        <>
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') save(); }}
            dir="auto"
            autoFocus
            placeholder={PLACEHOLDER}
            className="mt-2"
          />
          {error && (
            <p className="nib-sm mt-2 border border-destructive/25 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {error}
            </p>
          )}
          <div className="mt-3 flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => setEditing(false)} className="ms-auto">
              <X className="size-4" />
              انصراف
            </Button>
            <Button size="sm" onClick={save} disabled={saving}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
              ذخیره
            </Button>
          </div>
        </>
      ) : goal ? (
        <p dir="auto" className="display mt-1.5 text-2xl text-primary">{goal}</p>
      ) : (
        <button
          type="button"
          onClick={open}
          className={cn(
            'mt-1.5 block w-full text-start text-sm font-semibold text-primary hover:underline',
          )}
        >
          هدفت را بنویس — برای چی تمرین می‌کنی؟
        </button>
      )}
    </div>
  );
}
