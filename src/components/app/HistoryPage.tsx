// The streak, on a page of its own.
//
// It lived at the foot of the plan page, under the week and the goal, which
// is the part of the page nobody reaches. A streak only does its work if it
// is somewhere you can go and look at it.

import { useEffect, useState } from 'react';
import { Flame } from 'lucide-react';
import { supabase } from '../../lib/supabase.js';
import { getProfile } from '../../lib/session.js';
import { AppHeader } from './AppHeader';
import { TrainingHistory } from './TrainingHistory';

export function HistoryPage() {
  const [loading, setLoading] = useState(true);
  const [id, setId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { window.location.replace('/app/login'); return; }
      const p = await getProfile(supabase, session.user.id);
      if (!p) { setLoading(false); return; }
      if (p.role === 'coach') { window.location.replace('/app/coach'); return; }
      if (p.status !== 'approved') { window.location.replace('/app/pending'); return; }
      setId(p.id);
      setLoading(false);
    })();
  }, []);

  return (
    <div className="min-h-screen">
      <AppHeader isCoach={false} />
      <main className="mx-auto flex max-w-2xl flex-col gap-5 px-5 pb-28 pt-6 sm:pb-20">
        <div className="flex items-center gap-2 px-1">
          <Flame className="size-5 text-primary" />
          <h1 className="display text-3xl">استمرار</h1>
        </div>
        <p className="-mt-2 px-1 text-sm text-muted-foreground">
          هر مربعِ پر، یک تمرینی است که ثبت کرده‌ای.
        </p>

        {loading || !id
          ? <div className="h-72 animate-pulse rounded-2xl bg-muted" />
          : <TrainingHistory studentId={id} />}
      </main>
    </div>
  );
}
