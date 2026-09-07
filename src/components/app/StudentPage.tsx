import { useEffect, useMemo, useState } from 'react';
import { ChevronRight, ChevronLeft, CalendarDays } from 'lucide-react';
import { supabase } from '../../lib/supabase.js';
import {
  addDays, today, thisWeekStart, weekLabel, weekRelativeLabel,
  loadWeekPlan, emptyDays, daysAreEmpty, dayIsEmpty, dayIndexOf,
  DAYS_FA, faDateShort,
} from '../../lib/plan.js';
import { AppHeader } from './AppHeader';
import { Card } from '../ui/card';
import { Button } from '../ui/button';
import { PlanText } from './PlanText';
import { DayBlock, WeekList, type Day } from './PlanWeek';
import { cn } from '../../lib/utils';

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
  const [days, setDays] = useState<Day[]>(() => emptyDays());
  const [text, setText] = useState('');
  const [loadingPlan, setLoadingPlan] = useState(true);
  const [view, setView] = useState<'day' | 'week'>('day');
  const [selected, setSelected] = useState(() => dayIndexOf(today(), thisWeekStart()));

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

  // Load the week's plan
  useEffect(() => {
    if (!profile) return;
    let alive = true;
    setLoadingPlan(true);
    loadWeekPlan(supabase, profile.id, weekStart).then((plan) => {
      if (!alive) return;
      setDays(plan.days);
      setText(plan.text);
      setLoadingPlan(false);
    });
    return () => { alive = false; };
  }, [profile, weekStart]);

  const isThisWeek = weekStart === thisWeekStart();
  const todayIndex = isThisWeek ? dayIndexOf(today(), weekStart) : -1;

  // Past weeks open on their first day; the current week opens on today.
  useEffect(() => {
    setSelected(isThisWeek ? dayIndexOf(today(), weekStart) : 0);
  }, [weekStart, isThisWeek]);

  const empty = useMemo(() => daysAreEmpty(days) && !text.trim(), [days, text]);
  const legacy = daysAreEmpty(days) && !!text.trim();

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

  return (
    <div className="min-h-screen">
      <AppHeader isCoach={false} />
      <main className="mx-auto flex max-w-2xl flex-col gap-5 px-5 pb-16 pt-6">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">
            سلام {profile.full_name || ''}
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            برنامه‌ای که سالار برایت نوشته.
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

        {loadingPlan ? (
          <Card className="flex justify-center p-10">
            <div className="size-7 animate-spin rounded-full border-4 border-secondary border-t-primary" />
          </Card>
        ) : empty ? (
          <Card className="flex flex-col items-center gap-3 p-10 text-center text-muted-foreground">
            <CalendarDays className="size-10 text-muted-foreground/60" />
            <h3 className="text-base font-bold text-foreground">هنوز برنامه‌ای نیست</h3>
            <p className="text-sm">برای این هفته چیزی ثبت نشده.</p>
          </Card>
        ) : legacy ? (
          // A week written before the day table existed
          <Card className="p-6">
            <PlanText text={text} />
          </Card>
        ) : (
          <>
            {/* روزانه / هفتگی */}
            <div className="flex gap-1 self-center rounded-full border border-border bg-card p-1">
              {([['day', 'روزانه'], ['week', 'هفتگی']] as const).map(([v, label]) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setView(v)}
                  className={cn(
                    'rounded-full px-5 py-1.5 text-sm font-semibold transition-colors',
                    view === v ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {label}
                </button>
              ))}
            </div>

            {view === 'day' ? (
              <>
                {/* Day strip */}
                <div className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1">
                  {days.map((d, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setSelected(i)}
                      className={cn(
                        'flex min-w-16 shrink-0 flex-col items-center gap-0.5 rounded-2xl border px-3 py-2 transition-colors',
                        i === selected
                          ? 'border-primary bg-accent text-primary'
                          : 'border-border bg-card text-muted-foreground hover:bg-accent/50',
                      )}
                    >
                      <span className="text-xs font-bold">{DAYS_FA[i]}</span>
                      <span className="text-[0.68rem]">{faDateShort(addDays(weekStart, i))}</span>
                      <span className={cn(
                        'mt-0.5 size-1.5 rounded-full',
                        dayIsEmpty(d) ? 'bg-transparent' : i === selected ? 'bg-primary' : 'bg-primary/40',
                      )} />
                    </button>
                  ))}
                </div>

                <Card className="p-6">
                  <DayBlock
                    day={days[selected]}
                    index={selected}
                    weekStart={weekStart}
                    isToday={selected === todayIndex}
                  />
                </Card>
              </>
            ) : (
              <Card className="p-6">
                <WeekList days={days} weekStart={weekStart} todayIndex={todayIndex} />
              </Card>
            )}
          </>
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
