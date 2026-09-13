import { useEffect, useMemo, useState } from 'react';
import { ChevronRight, ChevronLeft, CalendarDays, Check } from 'lucide-react';
import { supabase } from '../../lib/supabase.js';
import {
  addDays, today, thisWeekStart, weekLabel, weekRelativeLabel, faDateLong,
  loadWeekPlan, loadWeekLogs, emptyDays, daysAreEmpty, dayIsEmpty, dayIndexOf,
  DAYS_FA, faDayNum, faNum,
} from '../../lib/plan.js';
import { sessionType, typeClasses } from '../../lib/session-type.js';
import { getProfile, forgetProfile } from '../../lib/session.js';
import { swr, drop } from '../../lib/cache.js';
import { AppHeader } from './AppHeader';
import { Card } from '../ui/card';
import { Button } from '../ui/button';
import { PlanText } from './PlanText';
import { DayCard, WeekList, type Day } from './PlanWeek';
import { DayLog, type Log } from './DayLog';
import { RunnerStats } from './RunnerStats';
import { EventCard } from './EventCard';
import { Avatar } from './Avatar';
import { cn } from '../../lib/utils';

type Profile = {
  id: string;
  role: string;
  status: string;
  full_name: string | null;
  training_goal: string | null;
  pr_10k: string | null;
  avatar_path: string | null;
};

export function StudentPage() {
  const [loading, setLoading] = useState(true);
  const [uid, setUid] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [weekStart, setWeekStart] = useState(() => thisWeekStart());
  const [days, setDays] = useState<Day[]>(() => emptyDays());
  const [text, setText] = useState('');
  const [loadingPlan, setLoadingPlan] = useState(true);
  const [logs, setLogs] = useState<Record<string, Log>>({});
  const [view, setView] = useState<'day' | 'week'>('day');
  const [selected, setSelected] = useState(() => dayIndexOf(today(), thisWeekStart()));

  // Boot / auth
  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { window.location.replace('/app/login'); return; }
      // Publishing the id here lets the week load in parallel with the
      // profile: a student's own row is keyed by exactly this id, so there is
      // nothing in the profile the plan query needs to wait for.
      setUid(session.user.id);
      const p = await getProfile(supabase, session.user.id);
      if (!p) { setLoading(false); return; }
      // Backfill full_name from localStorage if missing
      let profileFull = p as Profile;
      if (!profileFull.full_name) {
        let pending: string | null = null;
        try { pending = localStorage.getItem('jeyrun.pending_full_name'); } catch {}
        if (pending) {
          await supabase.from('profiles').update({ full_name: pending }).eq('id', profileFull.id);
          forgetProfile();
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
    if (!uid) return;
    let alive = true;
    setLoadingPlan(true);

    // The week a student is looking at changes when the coach writes it, which
    // is once a week — so show what we had and check behind them. Ticking a
    // day drops the entry, so the reader never sees their own change undone.
    const key = `week:${uid}:${weekStart}`;
    const apply = (w: any) => {
      if (!alive || !w) return;
      setDays(w.days);
      setText(w.text);
      setLogs(w.logs);
      setLoadingPlan(false);
    };

    swr(key, async () => {
      const [plan, weekLogs] = await Promise.all([
        loadWeekPlan(supabase, uid, weekStart),
        loadWeekLogs(supabase, uid, weekStart),
      ]);
      return { days: plan.days, text: plan.text, logs: weekLogs };
    }, { maxAge: 30000, onFresh: apply }).then(apply);

    return () => { alive = false; };
  }, [uid, weekStart]);

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
  const doneCount = Object.values(logs).filter((l) => l.done).length;
  const selectedIso = addDays(weekStart, selected);
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
      <main className="mx-auto flex max-w-2xl flex-col gap-5 px-5 pb-28 pt-6 sm:pb-20">
        {/* HERO */}
        <section className="rise nib relative overflow-hidden bg-gradient-to-bl from-brand-500 via-brand-500 to-brand-700 p-6 text-white shadow-lg shadow-brand-600/25">
          <span aria-hidden className="strokes pointer-events-none absolute inset-0" />
          <span aria-hidden className="pointer-events-none absolute -top-20 -start-12 size-52 rounded-full bg-white/15 blur-3xl" />
          <span aria-hidden className="pointer-events-none absolute -bottom-24 -end-10 size-48 rounded-full bg-black/15 blur-3xl" />
          <img
            src="/images/logo.png" alt="" aria-hidden
            className="pointer-events-none absolute -bottom-6 end-4 h-28 w-36 object-contain opacity-15 brightness-0 invert"
          />
          <div className="relative flex items-start gap-3">
            <a
              href="/app/leaderboard"
              aria-label="عکس پروفایل — رفتن به قهرمان‌ها"
              className="mt-0.5 flex shrink-0 rounded-full ring-2 ring-white/30 transition hover:ring-white/70"
            >
              <Avatar name={profile.full_name} path={profile.avatar_path} size={52} className="bg-white/20 text-white" />
            </a>
            <div className="min-w-0 flex-1">
            <p className="figures text-xs font-semibold text-white/75">{faDateLong(today())}</p>
            <h1 className="display mt-1 text-3xl">سلام {firstName}</h1>
            <p className="mt-1 text-sm text-white/85">
              {isThisWeek
                ? sessionCount > 0
                  ? doneCount > 0
                    ? `${faNum(doneCount)} از ${faNum(sessionCount)} تمرین این هفته انجام شده.`
                    : `این هفته ${faNum(sessionCount)} روز تمرین داری.`
                  : 'برنامه‌ی این هفته هنوز نوشته نشده.'
                : `${weekRelativeLabel(weekStart)} را می‌بینی.`}
            </p>

            {/* The week at a glance: one segment per day — faint where nothing
                is planned, half where there is a session, solid once ticked. */}
            {sessionCount > 0 && (
              <div className="mt-4 flex gap-1.5" aria-hidden>
                {days.map((d, i) => (
                  <span
                    key={i}
                    className={cn(
                      'h-1.5 flex-1 rounded-full transition-colors',
                      dayIsEmpty(d)
                        ? 'bg-white/20'
                        : logs[addDays(weekStart, i)]?.done
                          ? 'bg-white'
                          : 'bg-white/45',
                    )}
                  />
                ))}
              </div>
            )}
            </div>
          </div>
        </section>

        <EventCard />

        {/* The goal sits under the hero: it is the reason the week exists, and
            at the foot of the page nobody scrolled to it. */}
        <RunnerStats
          studentId={profile.id}
          goal={profile.training_goal}
          pr={profile.pr_10k}
          onSave={(training_goal, pr_10k) =>
            setProfile((p) => (p ? { ...p, training_goal, pr_10k } : p))}
        />

        {/* Week nav and the day/week switch share one slim bar rather than
            taking a card each — they were carrying the same visual weight as
            the workout itself. */}
        <Card className="flex items-center gap-1 p-1.5">
          <Button
            variant="ghost" size="icon" className="size-9 rounded-full"
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
            className="min-w-0 flex-1 rounded-xl px-2 py-1 text-center transition-colors enabled:hover:bg-accent disabled:cursor-default"
          >
            <div className="truncate text-sm font-bold leading-tight">{weekRelativeLabel(weekStart)}</div>
            <div className="figures mt-0.5 truncate text-[0.7rem] text-muted-foreground">{weekLabel(weekStart)}</div>
          </button>
          <Button
            variant="ghost" size="icon" className="size-9 rounded-full"
            onClick={() => setWeekStart((w) => addDays(w, 7))}
            aria-label="هفته‌ی بعد"
          >
            <ChevronLeft className="size-5" />
          </Button>

          {!empty && !legacy && (
            <div className="ms-1 flex shrink-0 gap-0.5 rounded-full bg-secondary p-1">
              {([['day', 'روزانه'], ['week', 'هفتگی']] as const).map(([v, label]) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setView(v)}
                  className={cn(
                    'nib-pill px-3 py-1 text-xs font-bold transition-all',
                    view === v
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
        </Card>

        {loadingPlan ? (
          <>
            <div className="h-20 animate-pulse rounded-2xl bg-muted" />
            <div className="h-56 animate-pulse rounded-2xl bg-muted" />
          </>
        ) : empty ? (
          <Card className="flex flex-col items-center gap-3 p-12 text-center text-muted-foreground">
            <CalendarDays className="size-10 text-muted-foreground/50" />
            <h3 className="display text-xl text-foreground">هنوز برنامه‌ای نیست</h3>
            <p className="text-sm">
              {isFuture
                ? 'سالار هنوز برنامه‌ی این هفته را ننوشته.'
                : 'برای این هفته چیزی ثبت نشده.'}
            </p>
          </Card>
        ) : legacy ? (
          <Card className="p-6">
            <PlanText text={text} />
          </Card>
        ) : view === 'day' ? (
          <>
            {/* Day strip, masked at both edges so it is obvious it scrolls. */}
            <div className="day-strip no-scrollbar -mx-5 flex gap-2 overflow-x-auto px-5 py-1">
              {days.map((d, i) => {
                const active = i === selected;
                const type = sessionType(d.workout);
                const c = typeClasses(type);
                const isDone = logs[addDays(weekStart, i)]?.done;
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setSelected(i)}
                    aria-current={active ? 'true' : undefined}
                    className={cn(
                      'nib-sm flex w-17 shrink-0 flex-col items-center gap-1 border py-2.5 transition-all',
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
                    {isDone ? (
                      <Check className="size-3 text-easy" strokeWidth={3} />
                    ) : type ? (
                      <span className={cn('size-1.5 rounded-full', c.dot)} />
                    ) : (
                      /* A day with nothing on it left a hole in the row; a dash
                         says "nothing here" rather than nothing at all. */
                      <span className="h-[2px] w-2 rounded-full bg-border" />
                    )}
                  </button>
                );
              })}
            </div>

            {/* The session and its log in one card. */}
            <div key={selected} className="rise nib overflow-hidden border border-border bg-card shadow-sm">
              <DayCard
                day={days[selected]}
                index={selected}
                weekStart={weekStart}
                isToday={selected === todayIndex}
                bare
              />
              <DayLog
                studentId={profile.id}
                day={selectedIso}
                log={logs[selectedIso]}
                onChange={(d, l) => {
                  setLogs((prev) => ({ ...prev, [d]: l }));
                  drop(`week:${profile.id}:${weekStart}`);
                }}
                bare
              />
            </div>
          </>
        ) : (
          <Card className="rise p-3 sm:p-4">
            <WeekList days={days} weekStart={weekStart} todayIndex={todayIndex} />
          </Card>
        )}


      </main>
    </div>
  );
}
