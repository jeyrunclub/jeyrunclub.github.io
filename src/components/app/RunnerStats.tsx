// The runner's goal and their 10k record, in one card with one edit mode.
//
// The goal carries the weight — it's what the training is for — so it gets the
// display face and the top of the card. The record is a number underneath it.
// Both belong to the runner: the student writes them here, Salar can also set
// them from the panel. The profiles column grant is role-wide and the self-edit
// policy is `id = auth.uid()`, so a student only ever writes their own row.

import { useState } from 'react';
import { Check, Pencil, Target, Timer, X, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase.js';
import { splitPr, joinPr } from '../../lib/plan.js';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';

export function RunnerStats({ studentId, goal, pr, onSave }: {
  studentId: string;
  goal: string | null;
  pr: string | null;
  onSave: (goal: string | null, pr: string | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [goalDraft, setGoalDraft] = useState(goal || '');
  const [mins, setMins] = useState('');
  const [secs, setSecs] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function open() {
    setGoalDraft(goal || '');
    const { minutes, seconds } = splitPr(pr);
    setMins(minutes);
    setSecs(seconds);
    setError(null);
    setEditing(true);
  }

  async function save() {
    setSaving(true);
    setError(null);
    const next = {
      training_goal: goalDraft.trim() || null,
      pr_10k: joinPr(mins, secs) || null,
    };
    const { error: err } = await supabase.from('profiles').update(next).eq('id', studentId);
    setSaving(false);
    if (err) { setError('ذخیره نشد. دوباره تلاش کن.'); return; }
    onSave(next.training_goal, next.pr_10k);
    setEditing(false);
  }

  if (editing) {
    return (
      <div className="nib border border-border bg-card p-4 shadow-sm">
        <div className="space-y-3">
          <div>
            <Label className="mb-1.5 block text-[0.7rem]">هدف تمرینی</Label>
            <Input
              value={goalDraft}
              onChange={(e) => setGoalDraft(e.target.value)}
              dir="auto"
              autoFocus
              placeholder="مثلاً ماراتن استانبول ۲۰۲۶"
            />
          </div>
          <div>
            <Label className="mb-1.5 block text-[0.7rem]">رکورد ۱۰ کیلومتر</Label>
            {/* Two plain number fields instead of one "46:20" box: a phone's
                numeric keypad has no colon, and hunting for one in the symbol
                layer is not something to ask of anyone. */}
            <div className="flex items-center gap-2">
              <TimePart
                value={mins} onChange={setMins} onEnter={save}
                label="دقیقه" placeholder="46" max={3}
              />
              <span className="figures pt-5 text-lg font-bold text-muted-foreground">:</span>
              <TimePart
                value={secs} onChange={setSecs} onEnter={save}
                label="ثانیه" placeholder="20" max={2}
              />
            </div>
          </div>
        </div>

        {error && (
          <p className="nib-sm mt-3 border border-destructive/25 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {error}
          </p>
        )}

        <div className="mt-3 flex items-center gap-2">
          <p className="text-xs text-muted-foreground">مثلاً ۴۶ دقیقه و ۲۰ ثانیه.</p>
          <Button variant="ghost" size="sm" onClick={() => setEditing(false)} className="ms-auto">
            <X className="size-4" />
            انصراف
          </Button>
          <Button size="sm" onClick={save} disabled={saving}>
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
            ذخیره
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="nib border border-border bg-card p-4 shadow-sm">
      <div className="flex items-center gap-1.5 text-[0.7rem] font-semibold text-muted-foreground">
        <Target className="size-3.5" />
        هدف تمرینی
        <button
          type="button"
          onClick={open}
          aria-label="ویرایش هدف و رکورد"
          className="ms-auto rounded-full p-1 text-muted-foreground transition-colors hover:text-primary"
        >
          <Pencil className="size-3.5" />
        </button>
      </div>

      {goal ? (
        <p dir="auto" className="display mt-1.5 text-2xl text-primary">{goal}</p>
      ) : (
        <button
          type="button"
          onClick={open}
          className="mt-1.5 block w-full text-start text-sm font-semibold text-primary hover:underline"
        >
          هدفت را بنویس — برای چی تمرین می‌کنی؟
        </button>
      )}

      <div className="mt-3 flex items-center gap-2 border-t border-border pt-3">
        <span className="flex items-center gap-1.5 text-[0.7rem] font-semibold text-muted-foreground">
          <Timer className="size-3.5" />
          رکورد ۱۰ کیلومتر
        </span>
        {pr ? (
          <span dir="ltr" className="figures ms-auto text-xl font-extrabold tabular-nums">
            {pr}
          </span>
        ) : (
          <button
            type="button"
            onClick={open}
            className="ms-auto text-xs font-semibold text-primary hover:underline"
          >
            ثبت رکورد
          </button>
        )}
      </div>
    </div>
  );
}

function TimePart({ value, onChange, onEnter, label, placeholder, max }: {
  value: string;
  onChange: (v: string) => void;
  onEnter: () => void;
  label: string;
  placeholder: string;
  max: number;
}) {
  return (
    <label className="flex-1">
      <span className="mb-1 block text-[0.65rem] text-muted-foreground">{label}</span>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/[^\d]/g, '').slice(0, max))}
        onKeyDown={(e) => { if (e.key === 'Enter') onEnter(); }}
        dir="ltr"
        inputMode="numeric"
        placeholder={placeholder}
        className="figures text-center"
      />
    </label>
  );
}
