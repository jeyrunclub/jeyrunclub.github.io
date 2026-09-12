import { useEffect, useMemo, useState } from 'react';
import { ChevronRight, ChevronLeft, CalendarDays } from 'lucide-react';
import { supabase } from '../../lib/supabase.js';
import {
  addDays, today, thisWeekStart, weekLabel, weekRelativeLabel, faDateLong,
  loadWeekPlan, emptyDays, daysAreEmpty, dayIsEmpty, dayIndexOf,
  DAYS_FA, faDayNum, faNum,
} from '../../lib/plan.js';
import { sessionType, typeClasses } from '../../lib/session-type.js';
import { AppHeader } from './AppHeader';
import { Card } from '../ui/card';
import { Button } from '../ui/button';
import { PlanText } from './PlanText';
import { DayCard, WeekList, type Day } from './PlanWeek';
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
  const isFuture = weekStart > thisWeekStart();
  const todayIndex = isThisWeek ? dayIndexOf(today(), weekStart) : -1;

  // Other weeks open on their first day; the current week opens on today.
  useEffect(() => {
    setSelected(isThisWeek ? dayIndexOf(today(), weekStart) : 0);
  }, [weekStart, isThisWeek]);

  const empty = useMemo(() => daysAreEmpty(days) && !text.trim(), [days, text]);
  const legacy = daysAreEmpty(days) && !!text.trim();
  const sessionCount = days.filter((d) => !dayIsEmpty(d)).length;
  const firstName = (profile?.full_name || '').trim().split(/\s+/)[0] || '';

  if (loading) {
    return (
      <div className="min-h-screen">
        <AppHeader isCoach={false} />
        <main className="mx-auto flex max-w-2xl flex-col gap-5 px-5 pb-16 pt-6">
          <div className="h-32 animate-pulse rounded-3xl bg-muted" />
          <div className="h-16 animate-pulse rounded-2xl bg-muted" />
          <div className="h-56 animate-pulse rounded-2xl bg-muted" />
        </main>
      </div>
    );
  }
  if (!profile) return null;

  return (
    <div className="min-h-screen">
      <AppHeader isCoach={false} />
      <main className="mx-auto flex max-w-2xl flex-col gap-5 px-5 pb-20 pt-6">
        {/* HERO */}
        <section className="rise relative overflow-hidden rounded-3xl bg-gradient-to-bl from-brand-400 via-brand-500 to-brand-700 p-6 text-white shadow-lg shadow-brand-500/25">
          <span aria-hidden className="pointer-events-none absolute -top-20 -start-12 size-52 rounded-full bg-white/15 blur-3xl" />
          <span aria-hidden className="pointer-events-none absolute -bottom-24 -end-10 size-48 rounded-full bg-black/15 blur-3xl" />
          <img
            src="/images/logo.png" alt="" aria-hidden
            className="pointer-events-none absolute -bottom-6 end-4 h-28 w-36 object-contain opacity-15 brightness-0 invert"
          />
          <div className="relative">
            <p className="figures text-xs font-semibold text-white/75">{faDateLong(today())}</p>
            <h1 className="mt-1.5 text-2xl font-extrabold tracking-tight">سلام {firstName}</h1>
            <p className="mt-1 text-sm text-white/85">
              {isThisWeek
                ? sessionCount > 0
                  ? `این هفته ${faNum(sessionCount)} روز تمرین داری.`
                  : 'برنامه‌ی این هفته هنوز نوشته نشده.'
                : `${weekRelativeLabel(weekStart)} را می‌بینی.`}
            </p>
          </div>
        </section>

        {/* WEEK NAV — in RTL, the right chevron goes back */}
        <Card className="flex items-center justify-between gap-2 p-2">
          <Button
            variant="ghost" size="icon" className="rounded-full"
            onClick={() => setWeekStart((w) => addDays(w, -7))}
            aria-label="هفته‌ی قبل"
          >
            <ChevronRight className="size-5" />
          </Button>
          <button
            type="button"
            onClick={() => setWeekStart(thisWeekStart())}
            disabled={isThisWeek}
            title={isThisWeek ? undefined : 'برگشت به این هفته'}
            className="rounded-xl px-3 py-1 text-center transition-colors enabled:hover:bg-accent disabled:cursor-default"
          >
            <div className="text-sm font-bold leading-tight">{weekRelativeLabel(weekStart)}</div>
            <div className="figures mt-0.5 text-xs text-muted-foreground">{weekLabel(weekStart)}</div>
          </button>
          <Button
            variant="ghost" size="icon" className="rounded-full"
            onClick={() => setWeekStart((w) => addDays(w, 7))}
            aria-label="هفته‌ی بعد"
          >
            <ChevronLeft className="size-5" />
          </Button>
        </Card>

        {loadingPlan ? (
          <>
            <div className="h-20 animate-pulse rounded-2xl bg-muted" />
            <div className="h-56 animate-pulse rounded-2xl bg-muted" />
          </>
        ) : empty ? (
          <Card className="flex flex-col items-center gap-3 p-12 text-center text-muted-foreground">
            <CalendarDays className="size-10 text-muted-foreground/50" />
            <h3 className="text-base font-bold text-foreground">هنوز برنامه‌ای نیست</h3>
            <p className="text-sm">
              {isFuture
                ? 'سالار هنوز برنامه‌ی این هفته را ننوشته.'
                : 'برای این هفته چیزی ثبت نشده.'}
            </p>
          </Card>
        ) : legacy ? (
          // A week written before the day table existed
          <Card className="p-6">
            <PlanText text={text} />
          </Card>
        ) : (
          <>
            {/* روزانه / هفتگی */}
            <div className="flex gap-1 self-center rounded-full border border-border bg-card p-1 shadow-sm">
              {([['day', 'روزانه'], ['week', 'هفتگی']] as const).map(([v, label]) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setView(v)}
                  className={cn(
                    'rounded-full px-6 py-1.5 text-sm font-bold transition-all',
                    view === v
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {label}
                </button>
              ))}
            </div>

            {view === 'day' ? (
              <>
                {/* Day strip */}
                <div className="no-scrollbar -mx-5 flex gap-2 overflow-x-auto px-5 py-1">
                  {days.map((d, i) => {
                    const active = i === selected;
                    const type = sessionType(d.workout);
                    const c = typeClasses(type);
                    return (
                      <button
                        key={i}
                        type="button"
                        onClick={() => setSelected(i)}
                        aria-current={active ? 'true' : undefined}
                        className={cn(
                          'flex w-17 shrink-0 flex-col items-center gap-1 rounded-2xl border py-2.5 transition-all',
                          active
                            ? '-translate-y-0.5 border-primary bg-card shadow-md'
                            : 'border-border bg-card/60 hover:bg-card',
                          i === todayIndex && !active && 'border-primary/40',
                        )}
                      >
                        <span className={cn(
                          'text-[0.7rem] font-bold',
                          active ? 'text-primary' : 'text-muted-foreground',
                        )}>
                          {DAYS_FA[i]}
                        </span>
                        <span className="figures text-base font-extrabold leading-none">
                          {faDayNum(addDays(weekStart, i))}
                        </span>
                        <span className={cn('size-1.5 rounded-full', type ? c.dot : 'bg-transparent')} />
                      </button>
                    );
                  })}
                </div>

                <div key={selected} className="rise">
                  <DayCard
                    day={days[selected]}
                    index={selected}
                    weekStart={weekStart}
                    isToday={selected === todayIndex}
                  />
                </div>
              </>
            ) : (
              <Card className="rise p-3 sm:p-4">
                <WeekList days={days} weekStart={weekStart} todayIndex={todayIndex} />
              </Card>
            )}
          </>
        )}
      </main>
    </div>
  );
}
