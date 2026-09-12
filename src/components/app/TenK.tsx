// The student's own 10k record and goal.
//
// The coach can set these from the panel, but they belong to the runner, so
// the student edits them here too. The column grant on profiles is role-wide
// and the RLS policy is `id = auth.uid()`, so a student can only ever write
// their own row — no extra SQL was needed for this.

import { useState } from 'react';
import { Check, Pencil, Target, Timer, X, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase.js';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { cn } from '../../lib/utils';

export function TenK({ studentId, pr, goal, onSave }: {
  studentId: string;
  pr: string | null;
  goal: string | null;
  onSave: (pr: string | null, goal: string | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [prDraft, setPrDraft] = useState(pr || '');
  const [goalDraft, setGoalDraft] = useState(goal || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function open() {
    setPrDraft(pr || '');
    setGoalDraft(goal || '');
    setError(null);
    setEditing(true);
  }

  async function save() {
    setSaving(true);
    setError(null);
    const next = { pr_10k: prDraft.trim() || null, goal_10k: goalDraft.trim() || null };
    const { error: err } = await supabase.from('profiles').update(next).eq('id', studentId);
    setSaving(false);
    if (err) { setError('ذخیره نشد. دوباره تلاش کن.'); return; }
    onSave(next.pr_10k, next.goal_10k);
    setEditing(false);
  }

  if (editing) {
    return (
      <div className="nib border border-border bg-card p-4 shadow-sm">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-28 flex-1">
            <Label className="mb-1.5 block text-[0.7rem]">رکورد ۱۰ کیلومتر</Label>
            <Input
              value={prDraft} onChange={(e) => setPrDraft(e.target.value)}
              dir="ltr" inputMode="numeric" placeholder="46:20"
              className="figures text-right"
            />
          </div>
          <div className="min-w-28 flex-1">
            <Label className="mb-1.5 block text-[0.7rem]">هدف</Label>
            <Input
              value={goalDraft} onChange={(e) => setGoalDraft(e.target.value)}
              dir="ltr" inputMode="numeric" placeholder="44:00"
              className="figures text-right"
            />
          </div>
        </div>
        {error && (
          <p className="mt-3 nib-sm border border-destructive/25 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {error}
          </p>
        )}
        <div className="mt-3 flex items-center gap-2">
          <p className="text-xs text-muted-foreground">مثلاً ۴۶:۲۰ — دقیقه و ثانیه.</p>
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

  const empty = !pr && !goal;

  return (
    <div className="relative">
      <div className="grid grid-cols-2 gap-3">
        <Box icon={<Timer className="size-3.5" />} label="رکورد ۱۰ کیلومتر" value={pr} />
        <Box icon={<Target className="size-3.5" />} label="هدف ۱۰ کیلومتر" value={goal} goal />
      </div>
      <button
        type="button"
        onClick={open}
        aria-label={empty ? 'ثبت رکورد و هدف' : 'ویرایش رکورد و هدف'}
        className="absolute -top-2 left-1/2 -translate-x-1/2 rounded-full border border-border bg-card p-1.5 text-muted-foreground shadow-sm transition-colors hover:border-primary hover:text-primary"
      >
        <Pencil className="size-3.5" />
      </button>
      {empty && (
        <button
          type="button"
          onClick={open}
          className="mt-2 w-full text-center text-xs font-semibold text-primary hover:underline"
        >
          رکورد و هدفت را ثبت کن
        </button>
      )}
    </div>
  );
}

function Box({ icon, label, value, goal }: {
  icon: React.ReactNode; label: string; value: string | null; goal?: boolean;
}) {
  return (
    <div className="nib border border-border bg-card p-4 shadow-sm">
      <div className="flex items-center gap-1.5 text-[0.7rem] font-semibold text-muted-foreground">
        {icon}
        {label}
      </div>
      <div
        dir="ltr"
        className={cn(
          'figures mt-1 text-right text-2xl font-extrabold tabular-nums',
          goal ? 'text-primary' : 'text-foreground',
          !value && 'text-muted-foreground/40',
        )}
      >
        {value || '—'}
      </div>
    </div>
  );
}
