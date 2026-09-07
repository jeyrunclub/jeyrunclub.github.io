import { useEffect, useState } from 'react';
import { ChevronRight, ChevronLeft, CalendarDays } from 'lucide-react';
import { supabase } from '../../lib/supabase.js';
import {
  addDays, thisWeekStart, weekLabel, weekRelativeLabel, loadWeekText,
} from '../../lib/plan.js';
import { AppHeader } from './AppHeader';
import { Card } from '../ui/card';
import { Button } from '../ui/button';
import { PlanText } from './PlanText';

type Profile = {
  id: string;
  role: string;
  status: string;
  full_name: string | null;
};

export function StudentPage() {
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [weekStart, setWeekStart] = useState(() => thisWeekStart());
  const [text, setText] = useState('');
  const [loadingText, setLoadingText] = useState(true);

  // Boot / auth
  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { window.location.replace('/app/login'); return; }
      const { data: p } = await supabase.from('profiles').select('*').eq('id', session.user.id).single();
      if (!p) { setLoading(false); return; }
      // Backfill full_name from localStorage if missing
      let profileFull = p as Profile;
      if (!profileFull.full_name) {
        let pending: string | null = null;
        try { pending = localStorage.getItem('jeyrun.pending_full_name'); } catch {}
        if (pending) {
          await supabase.from('profiles').update({ full_name: pending }).eq('id', profileFull.id);
          try { localStorage.removeItem('jeyrun.pending_full_name'); } catch {}
          profileFull = { ...profileFull, full_name: pending };
        }
      }
      if (profileFull.role === 'coach') { window.location.replace('/app/coach'); return; }
      if (profileFull.status !== 'approved') { window.location.replace('/app/pending'); return; }
      setProfile(profileFull);
      setLoading(false);
    })();
  }, []);

  // Load the week's text
  useEffect(() => {
    if (!profile) return;
    let alive = true;
    setLoadingText(true);
    loadWeekText(supabase, profile.id, weekStart).then((t) => {
      if (!alive) return;
      setText(t);
      setLoadingText(false);
    });
    return () => { alive = false; };
  }, [profile, weekStart]);

  if (loading) {
    return (
      <div className="min-h-screen">
        <AppHeader isCoach={false} />
        <div className="flex justify-center py-16">
          <div className="size-10 animate-spin rounded-full border-4 border-secondary border-t-primary" />
        </div>
      </div>
    );
  }
  if (!profile) return null;

  const isThisWeek = weekStart === thisWeekStart();

  return (
    <div className="min-h-screen">
      <AppHeader isCoach={false} />
      <main className="mx-auto flex max-w-2xl flex-col gap-5 px-5 pb-16 pt-6">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">
            سلام {profile.full_name || ''}
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            برنامه‌ای که سالار برای این هفته نوشته.
          </p>
        </div>

        {/* Week nav — in RTL, the right chevron goes back */}
        <Card className="flex items-center justify-between gap-2 p-2">
          <Button
            variant="ghost" size="icon" className="rounded-full"
            onClick={() => setWeekStart((w) => addDays(w, -7))}
            aria-label="هفته‌ی قبل"
          >
            <ChevronRight className="size-5" />
          </Button>
          <div className="text-center">
            <div className="text-sm font-bold leading-tight">{weekRelativeLabel(weekStart)}</div>
            <div className="mt-0.5 text-xs text-muted-foreground">{weekLabel(weekStart)}</div>
          </div>
          <Button
            variant="ghost" size="icon" className="rounded-full"
            onClick={() => setWeekStart((w) => addDays(w, 7))}
            aria-label="هفته‌ی بعد"
            disabled={isThisWeek}
          >
            <ChevronLeft className="size-5" />
          </Button>
        </Card>

        {loadingText ? (
          <Card className="flex justify-center p-10">
            <div className="size-7 animate-spin rounded-full border-4 border-secondary border-t-primary" />
          </Card>
        ) : text ? (
          <Card className="p-6">
            <PlanText text={text} />
          </Card>
        ) : (
          <Card className="flex flex-col items-center gap-3 p-10 text-center text-muted-foreground">
            <CalendarDays className="size-10 text-muted-foreground/60" />
            <h3 className="text-base font-bold text-foreground">هنوز برنامه‌ای نیست</h3>
            <p className="text-sm">برای این هفته چیزی ثبت نشده.</p>
          </Card>
        )}

        {!isThisWeek && (
          <div className="flex justify-center">
            <Button variant="outline" onClick={() => setWeekStart(thisWeekStart())}>
              برگشت به این هفته
            </Button>
          </div>
        )}
      </main>
    </div>
  );
}
