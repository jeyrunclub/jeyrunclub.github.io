// Salar's page. It is the only page in the product that *has* to be used every
// week, and it was the plainest: an undifferentiated stack of cards with a
// dense seven-row table in the middle and no answer to the question he
// actually opens it with — who still needs a plan, and who has gone quiet.
//
// So: a hero that states the week's job, one roster where every student shows
// their plan state and their week of ticks at a glance, and the editor below
// it. The goal and record moved inside the editor's header, folded away, since
// they are touched once a season and the table is touched every week.

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ChevronLeft, ChevronRight, Check, Camera, Target, Timer, ChevronDown,
} from 'lucide-react';
import { supabase } from '../../lib/supabase.js';
import {
  addDays, today, thisWeekStart, weekLabel, weekRelativeLabel,
  faNum, faDateShort, DAYS_FA, dayIndexOf,
  emptyDays, normalizeDays, daysAreEmpty, trimDays,
  fetchWeekPlansForStudents, fetchWeekLogsForStudents, loadWeekPlan, saveWeekPlan,
  signedPhotoUrl, splitPr, joinPr,
} from '../../lib/plan.js';
import { getProfile } from '../../lib/session.js';
import { EventCard } from '../app/EventCard';
import { AppHeader } from '../app/AppHeader';
import { PlanText } from '../app/PlanText';
import { WeekList, TypeBadge, type Day } from '../app/PlanWeek';
import { Avatar as Photo, AvatarPicker } from '../app/Avatar';
import { Card } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import { Badge } from '../ui/badge';
import { cn } from '../../lib/utils';

type Profile = {
  id: string; full_name: string | null; phone: string | null;
  role: 'coach' | 'student'; status: 'pending' | 'approved' | 'rejected';
  email?: string;
  training_goal?: string | null; pr_10k?: string | null;
};
type Log = { done: boolean; note: string | null; photo_path: string | null };
type Runner = { training_goal: string | null; pr_10k: string | null; avatar_path: string | null };
type Plan = { days: Day[]; text: string };

const WORKOUT_PLACEHOLDER = '2k گرم کردن\n8*(6min @3:30 / 1min rest)\n2k سرد کردن';

export function CoachPage() {
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [allUsers, setAllUsers] = useState<Profile[]>([]);
  const [currentStudentId, setCurrentStudentId] = useState<string | null>(null);
  const [weekStart, setWeekStart] = useState(() => thisWeekStart());
  const [planByStudent, setPlanByStudent] = useState<Record<string, Plan>>({});
  const [draft, setDraft] = useState<Day[]>(() => emptyDays());
  const [baseline, setBaseline] = useState('');
  const [legacyText, setLegacyText] = useState('');
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState(false);
  const [logsByStudent, setLogsByStudent] = useState<Record<string, Record<string, Log>>>({});
  const [runners, setRunners] = useState<Record<string, Runner>>({});
  const [coachAvatar, setCoachAvatar] = useState<string | null>(null);
  const [goal, setGoal] = useState('');
  const [prMins, setPrMins] = useState('');
  const [prSecs, setPrSecs] = useState('');
  const [savingGoal, setSavingGoal] = useState(false);

  // The coach's "profiles: coach read" policy covers every row, so read the
  // goal and record here rather than through list_all_users() — that function
  // only carries them if it was dropped and recreated after the columns landed.
  const refreshRunners = useCallback(async () => {
    const { data, error: err } = await supabase.from('profiles')
      .select('id, training_goal, pr_10k, avatar_path');
    if (err) { console.error(err); return; }
    setRunners(Object.fromEntries((data || []).map((r: any) => [
      r.id, {
        training_goal: r.training_goal ?? null,
        pr_10k: r.pr_10k ?? null,
        avatar_path: r.avatar_path ?? null,
      },
    ])));
  }, []);

  const refreshUsers = useCallback(async () => {
    const { data } = await supabase.rpc('list_all_users');
    const users: Profile[] = data || [];
    setAllUsers(users);
    setCurrentStudentId((prev) => {
      const approved = users.filter((u) => u.status === 'approved' && u.role !== 'coach');
      if (prev && approved.find((s) => s.id === prev)) return prev;
      return approved[0]?.id || null;
    });
  }, []);

  // Boot
  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { window.location.replace('/app/login'); return; }
      const p = await getProfile(supabase, session.user.id);
      if (!p || p.role !== 'coach') { setDenied(true); setLoading(false); return; }
      setProfile(p);
      setCoachAvatar(p.avatar_path ?? null);
      await Promise.all([refreshUsers(), refreshRunners()]);
      setLoading(false);
    })();
  }, [refreshUsers, refreshRunners]);

  // Load every student's plan for the shown week
  const refreshWeek = useCallback(async () => {
    const [plans, logs] = await Promise.all([
      fetchWeekPlansForStudents(supabase, weekStart),
      fetchWeekLogsForStudents(supabase, weekStart),
    ]);
    setPlanByStudent(plans);
    setLogsByStudent(logs);
  }, [weekStart]);

  useEffect(() => { if (profile) refreshWeek(); }, [profile, refreshWeek]);

  // Load the draft fresh whenever the student or week changes
  useEffect(() => {
    setSavedAt(0);
    setError(null);
    setPreview(false);
    if (!currentStudentId) { setDraft(emptyDays()); setBaseline(''); setLegacyText(''); return; }
    const r = runners[currentStudentId];
    setGoal(r?.training_goal || '');
    const { minutes, seconds } = splitPr(r?.pr_10k);
    setPrMins(minutes);
    setPrSecs(seconds);
    let alive = true;
    loadWeekPlan(supabase, currentStudentId, weekStart).then((plan) => {
      if (!alive) return;
      setDraft(plan.days);
      setBaseline(fingerprint(plan.days));
      setLegacyText(daysAreEmpty(plan.days) ? plan.text : '');
    });
    return () => { alive = false; };
  }, [currentStudentId, weekStart, runners]);

  const students = useMemo(
    () => allUsers.filter((u) => u.status === 'approved' && u.role !== 'coach'),
    [allUsers],
  );
  const pendingUsers = useMemo(
    () => allUsers.filter((u) => u.status === 'pending'),
    [allUsers],
  );
  const rejectedUsers = useMemo(
    () => allUsers.filter((u) => u.status === 'rejected'),
    [allUsers],
  );
  const currentStudent = students.find((s) => s.id === currentStudentId) || null;
  const studentLogs = logsByStudent[currentStudentId || ''] || {};
  const hasPlan = (id: string) => {
    const p = planByStudent[id];
    return !!p && (!daysAreEmpty(p.days) || !!p.text.trim());
  };
  const doneCount = (id: string) =>
    Object.values(logsByStudent[id] || {}).filter((l) => l.done).length;
  const writtenCount = students.filter((s) => hasPlan(s.id)).length;
  const missing = students.length - writtenCount;
  const dirty = fingerprint(draft) !== baseline;
  const isThisWeek = weekStart === thisWeekStart();
  const todayIndex = isThisWeek ? dayIndexOf(today(), weekStart) : -1;

  async function saveGoal() {
    if (!currentStudentId) return;
    setSavingGoal(true);
    setError(null);
    const next = {
      training_goal: goal.trim() || null,
      pr_10k: joinPr(prMins, prSecs) || null,
    };
    const { error: err } = await supabase.from('profiles')
      .update(next).eq('id', currentStudentId);
    setSavingGoal(false);
    if (err) { setError('خطا در ذخیره: ' + err.message); return; }
    setRunners((prev) => ({
      ...prev,
      [currentStudentId]: { ...prev[currentStudentId], ...next },
    }));
  }

  function setDay(i: number, field: 'workout' | 'note', value: string) {
    setDraft((prev) => prev.map((d, j) => (j === i ? { ...d, [field]: value } : d)));
  }

  async function approveOrReject(id: string, status: 'approved' | 'rejected') {
    const { error: err } = await supabase.rpc('set_profile_status',
      { target: id, new_status: status, new_role: null });
    if (err) { setError(err.message); return; }
    await refreshUsers();
  }

  // Start from last week's table instead of an empty one.
  async function copyPreviousWeek() {
    if (!currentStudentId) return;
    const prev = await loadWeekPlan(supabase, currentStudentId, addDays(weekStart, -7));
    if (daysAreEmpty(prev.days)) { setError('هفته‌ی قبل جدولی ندارد.'); return; }
    setError(null);
    setDraft(prev.days);
  }

  async function save() {
    if (!currentStudentId || !profile) return;
    setSaving(true);
    setError(null);
    const { error: err } = await saveWeekPlan(
      supabase, currentStudentId, weekStart, draft, profile.id,
    );
    setSaving(false);
    if (err) { setError('خطا در ذخیره: ' + err.message); return; }
    const saved = normalizeDays(draft);
    setBaseline(fingerprint(saved));
    setPlanByStudent((p) => ({ ...p, [currentStudentId]: { days: saved, text: '' } }));
    setLegacyText('');
    setSavedAt(Date.now());
  }

  // Jump to the next student who has no plan for this week — the loop the
  // whole page exists for, which used to mean scrolling and hunting.
  function nextUnwritten() {
    const from = students.findIndex((s) => s.id === currentStudentId);
    const order = [...students.slice(from + 1), ...students.slice(0, from + 1)];
    const next = order.find((s) => !hasPlan(s.id));
    if (next) {
      setCurrentStudentId(next.id);
      document.getElementById('editor')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen">
        <AppHeader isCoach />
        <div className="flex justify-center py-16">
          <div className="size-10 animate-spin rounded-full border-4 border-secondary border-t-primary" />
        </div>
      </div>
    );
  }

  if (denied) return (
    <div className="min-h-screen">
      <AppHeader />
      <main className="mx-auto max-w-lg px-5 py-20 text-center">
        <h2 className="display text-2xl">دسترسی ندارد</h2>
        <p className="mt-2 text-muted-foreground">این صفحه فقط برای مربی است.</p>
      </main>
    </div>
  );

  return (
    <div className="min-h-screen">
      <AppHeader isCoach />
      <main className="mx-auto flex max-w-4xl flex-col gap-5 px-5 pb-28 pt-6 sm:pb-20">

        {/* HERO — the same material as the student's, so the two halves of the
            product look like one product. */}
        <section className="rise nib relative overflow-hidden bg-gradient-to-bl from-brand-500 via-brand-500 to-brand-700 p-6 text-white shadow-lg shadow-brand-600/25">
          <span aria-hidden className="strokes pointer-events-none absolute inset-0" />
          <span aria-hidden className="pointer-events-none absolute -top-20 -start-12 size-52 rounded-full bg-white/15 blur-3xl" />
          <span aria-hidden className="pointer-events-none absolute -bottom-24 -end-10 size-48 rounded-full bg-black/15 blur-3xl" />
          <img
            src="/images/logo.png" alt="" aria-hidden
            className="pointer-events-none absolute -bottom-6 end-4 h-28 w-36 object-contain opacity-15 brightness-0 invert"
          />
          <div className="relative flex items-start gap-3">
            {profile && (
              <Photo
                name={profile.full_name || 'م'} path={coachAvatar} size={52}
                className="mt-0.5 bg-white/20 text-white ring-2 ring-white/30"
              />
            )}
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-white/75">پنل مربی</p>
              <h1 className="display mt-1 text-3xl">
                {profile?.full_name ? `سلام ${profile.full_name.trim().split(/\s+/)[0]}` : 'خوش آمدی'}
              </h1>
              <p className="mt-1 text-sm text-white/85">
                {students.length === 0
                  ? 'هنوز شاگردی تأیید نشده.'
                  : missing === 0
                    ? `${weekRelativeLabel(weekStart)}: برنامه‌ی همه نوشته شده.`
                    : `${weekRelativeLabel(weekStart)}: ${faNum(missing)} شاگرد هنوز برنامه ندارند.`}
              </p>

              {/* One segment per student, solid once their week is written. */}
              {students.length > 0 && (
                <div className="mt-4 flex gap-1.5" aria-hidden>
                  {students.map((s) => (
                    <span
                      key={s.id}
                      className={cn(
                        'h-1.5 flex-1 rounded-full transition-colors',
                        hasPlan(s.id) ? 'bg-white' : 'bg-white/25',
                      )}
                    />
                  ))}
                </div>
              )}

              {missing > 0 && (
                <button
                  type="button"
                  onClick={nextUnwritten}
                  className="nib-pill mt-4 bg-white px-4 py-1.5 text-xs font-bold text-brand-600 shadow-sm transition hover:bg-white/90"
                >
                  شاگرد بعدی بدون برنامه
                </button>
              )}
            </div>
          </div>
        </section>

        <EventCard />

        {/* PENDING APPROVALS */}
        {pendingUsers.length > 0 && (
          <Card className="border-primary/30 bg-accent/40 p-5">
            <h2 className="display mb-3 text-xl">
              درخواست‌های در انتظار
              <span className="figures ms-2 text-base text-primary">{faNum(pendingUsers.length)}</span>
            </h2>
            <div className="divide-y divide-border">
              {pendingUsers.map((u) => (
                <div key={u.id} className="flex items-center gap-3 py-3">
                  <Photo name={u.full_name || u.email || '?'} size={36} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold">{u.full_name || '(بدون نام)'}</div>
                    <div className="truncate text-xs text-muted-foreground" dir="ltr">
                      {u.email}{u.phone ? ' · ' + u.phone : ''}
                    </div>
                  </div>
                  <Button size="sm" onClick={() => approveOrReject(u.id, 'approved')}>تأیید</Button>
                  <Button variant="outline" size="sm" onClick={() => approveOrReject(u.id, 'rejected')}>رد</Button>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* WEEK NAV — in RTL, the right chevron goes back */}
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
        </Card>

        {/* ROSTER — picker and register in one. Every row carries the two
            things worth knowing: is their week written, and are they showing
            up. The old page had a flat row of name pills for the first and a
            separate list at the bottom for neither. */}
        <Card className="overflow-hidden">
          <div className="flex items-center gap-2 border-b border-border px-5 py-3.5">
            <h2 className="display text-xl">شاگردان</h2>
            <span className="figures text-xs text-muted-foreground">
              {faNum(writtenCount)} از {faNum(students.length)} برنامه دارند
            </span>
          </div>

          {students.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-muted-foreground">
              هنوز شاگردی تأیید نشده.
            </p>
          ) : (
            <div className="divide-y divide-border">
              {students.map((s) => {
                const active = s.id === currentStudentId;
                const written = hasPlan(s.id);
                const r = runners[s.id];
                const logs = logsByStudent[s.id] || {};
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => {
                      setCurrentStudentId(s.id);
                      document.getElementById('editor')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }}
                    aria-current={active ? 'true' : undefined}
                    className={cn(
                      'relative flex w-full items-center gap-3 px-5 py-3 text-start transition-colors',
                      active ? 'bg-accent/60' : 'hover:bg-secondary/60',
                    )}
                  >
                    {active && <span className="absolute inset-y-0 start-0 w-1 bg-primary" />}
                    <Photo name={s.full_name || s.email || '?'} path={r?.avatar_path} size={38} />

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className={cn('truncate text-sm font-bold', active && 'text-primary')}>
                          {s.full_name || s.email || '—'}
                        </span>
                        {written ? (
                          <span className="inline-flex items-center gap-0.5 text-[0.65rem] font-bold text-easy">
                            <Check className="size-3" strokeWidth={3} />
                            برنامه دارد
                          </span>
                        ) : (
                          <span className="text-[0.65rem] font-bold text-muted-foreground">
                            بدون برنامه
                          </span>
                        )}
                      </div>
                      {(r?.training_goal || r?.pr_10k) && (
                        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 text-[0.68rem] text-muted-foreground">
                          {r?.training_goal && (
                            <span className="inline-flex min-w-0 items-center gap-1">
                              <Target className="size-3 shrink-0" />
                              <span dir="auto" className="truncate">{r.training_goal}</span>
                            </span>
                          )}
                          {r?.pr_10k && (
                            <span className="inline-flex items-center gap-1">
                              <Timer className="size-3" />
                              ۱۰k
                              <span dir="ltr" className="figures font-bold text-foreground">{r.pr_10k}</span>
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    {/* The week as seven marks: solid where they ticked. */}
                    <span className="flex shrink-0 gap-[3px]" aria-hidden>
                      {Array.from({ length: 7 }, (_, i) => (
                        <span
                          key={i}
                          className={cn(
                            'h-4 w-[5px] rounded-full',
                            logs[addDays(weekStart, i)]?.done ? 'bg-easy' : 'bg-muted',
                          )}
                        />
                      ))}
                    </span>
                    <span className="figures w-4 shrink-0 text-end text-xs font-bold text-muted-foreground">
                      {faNum(doneCount(s.id))}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </Card>

        {/* EDITOR */}
        {currentStudent && (
          <Card id="editor" className="scroll-mt-4 space-y-3 p-5">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="display text-xl">
                برنامه‌ی {currentStudent.full_name || currentStudent.email}
              </h2>
              <span className="figures text-xs text-muted-foreground">{weekLabel(weekStart)}</span>
              {dirty && <Badge variant="warning" className="ms-auto">ذخیره نشده</Badge>}
              {!dirty && savedAt > 0 && (
                <Badge className="ms-auto bg-emerald-500/15 text-emerald-700">ذخیره شد</Badge>
              )}
            </div>

            {/* Touched once a season; folded away so the table owns the card. */}
            <details className="group nib-sm border border-border bg-secondary/40">
              <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-2.5 text-sm font-bold">
                <Target className="size-4 text-primary" />
                هدف و رکورد
                <span className="truncate text-xs font-normal text-muted-foreground" dir="auto">
                  {runners[currentStudent.id]?.training_goal || 'ثبت نشده'}
                </span>
                <ChevronDown className="ms-auto size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
              </summary>
              <div className="flex flex-wrap items-end gap-3 border-t border-border px-4 pb-4 pt-3">
                <div className="min-w-48 flex-1">
                  <Label className="mb-1.5 block">هدف</Label>
                  <Input
                    value={goal}
                    onChange={(e) => setGoal(e.target.value)}
                    dir="auto"
                    placeholder="مثلاً ماراتن استانبول ۲۰۲۶"
                  />
                </div>
                <div className="min-w-36">
                  <Label className="mb-1.5 block">رکورد ۱۰ کیلومتر</Label>
                  {/* Minutes and seconds separately — a numeric keypad has no colon. */}
                  <div className="flex items-center gap-1.5">
                    <Input
                      value={prMins}
                      onChange={(e) => setPrMins(e.target.value.replace(/[^\d]/g, '').slice(0, 3))}
                      dir="ltr" inputMode="numeric" placeholder="46"
                      aria-label="دقیقه"
                      className="figures text-center"
                    />
                    <span className="figures text-lg font-bold text-muted-foreground">:</span>
                    <Input
                      value={prSecs}
                      onChange={(e) => setPrSecs(e.target.value.replace(/[^\d]/g, '').slice(0, 2))}
                      dir="ltr" inputMode="numeric" placeholder="20"
                      aria-label="ثانیه"
                      className="figures text-center"
                    />
                  </div>
                </div>
                <Button
                  onClick={saveGoal}
                  disabled={savingGoal
                    || (goal.trim() === (runners[currentStudent.id]?.training_goal || '')
                        && joinPr(prMins, prSecs) === (runners[currentStudent.id]?.pr_10k || ''))}
                >
                  <Check className="size-4" />
                  {savingGoal ? 'در حال ذخیره…' : 'ذخیره'}
                </Button>
                <p className="w-full text-xs text-muted-foreground">
                  شاگرد هم می‌تواند این را در صفحه‌ی خودش بنویسد.
                </p>
              </div>
            </details>

            {legacyText && (
              <div className="rounded-xl border border-border bg-secondary/50 p-4">
                <Label className="mb-2 block">متن قبلی این هفته</Label>
                <PlanText text={legacyText} />
                <p className="mt-3 text-xs text-muted-foreground">
                  این هفته قبلاً به‌صورت متن نوشته شده. تا وقتی جدول را پر نکنی، شاگرد همین متن را می‌بیند.
                </p>
              </div>
            )}

            {/* Header row — the table only reads as a table on wider screens */}
            <div className="hidden gap-3 px-3 pb-1 text-xs font-bold text-muted-foreground sm:grid sm:grid-cols-[4.5rem_1fr_13rem]">
              <span>روز</span><span>تمرین</span><span>یادداشت</span>
            </div>

            <div className="nib divide-y divide-border overflow-hidden border border-border">
              {draft.map((d, i) => (
                <div
                  key={i}
                  className={cn(
                    'grid gap-2 p-3 sm:grid-cols-[4.5rem_1fr_13rem] sm:items-start sm:gap-x-3 sm:gap-y-2 sm:[&>*:last-child]:col-span-3',
                    i === todayIndex && 'bg-accent/40',
                  )}
                >
                  <div className="flex flex-wrap items-baseline gap-2 sm:flex-col sm:items-start sm:gap-1 sm:pt-2">
                    <span className={cn('text-sm font-bold', i === todayIndex && 'text-primary')}>
                      {DAYS_FA[i]}
                    </span>
                    <span className="figures text-[0.68rem] text-muted-foreground">
                      {faDateShort(addDays(weekStart, i))}
                    </span>
                    <TypeBadge workout={d.workout} />
                  </div>
                  <Textarea
                    value={d.workout}
                    onChange={(e) => setDay(i, 'workout', e.target.value)}
                    rows={3}
                    dir="auto"
                    placeholder={WORKOUT_PLACEHOLDER}
                    className="field-sizing-content min-h-20 text-sm leading-7"
                  />
                  <Textarea
                    value={d.note}
                    onChange={(e) => setDay(i, 'note', e.target.value)}
                    rows={2}
                    dir="auto"
                    placeholder="یادداشت"
                    className="field-sizing-content min-h-20 text-sm leading-7"
                  />
                  <StudentLog log={studentLogs[addDays(weekStart, i)]} />
                </div>
              ))}
            </div>

            {error && (
              <div className="rounded-xl border border-destructive/25 bg-destructive/10 px-3.5 py-2.5 text-sm text-destructive">
                {error}
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" onClick={copyPreviousWeek}>
                کپی از هفته‌ی قبل
              </Button>
              <Button variant="outline" size="sm" onClick={() => setPreview((p) => !p)}>
                {preview ? 'بستن پیش‌نمایش' : 'پیش‌نمایش'}
              </Button>
              <Button onClick={save} disabled={saving || !dirty} className="ms-auto">
                <Check className="size-4" />
                {saving ? 'در حال ذخیره…' : 'ذخیره'}
              </Button>
            </div>

            {preview && (
              <div className="border-t border-border pt-4">
                <Label className="mb-2 block">آنچه شاگرد می‌بیند</Label>
                <div className="rounded-xl border border-border bg-secondary/50 p-4">
                  <WeekList days={draft} weekStart={weekStart} todayIndex={todayIndex} />
                </div>
              </div>
            )}
          </Card>
        )}

        {/* The coach's own picture, and anyone who was turned away. Both are
            housekeeping, so they sit at the far end of the page. */}
        {profile && (
          <Card className="p-4">
            <AvatarPicker
              userId={profile.id}
              name={profile.full_name}
              path={coachAvatar}
              onChange={setCoachAvatar}
            />
          </Card>
        )}

        {rejectedUsers.length > 0 && (
          <details className="nib border border-border bg-card/60 px-5 py-3 text-sm">
            <summary className="cursor-pointer font-bold text-muted-foreground">
              رد شده‌ها ({faNum(rejectedUsers.length)})
            </summary>
            <div className="mt-2 divide-y divide-border">
              {rejectedUsers.map((u) => (
                <div key={u.id} className="flex items-center gap-3 py-2.5">
                  <Photo name={u.full_name || u.email || '?'} size={32} className="bg-muted text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm">{u.full_name || '(بدون نام)'}</div>
                    <div className="truncate text-xs text-muted-foreground" dir="ltr">{u.email}</div>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => approveOrReject(u.id, 'approved')}>
                    تأیید
                  </Button>
                </div>
              ))}
            </div>
          </details>
        )}
      </main>
    </div>
  );
}

// Trimmed shape of a week, for the "unsaved changes" comparison. trimDays()
// collapses an all-empty table to [], so clearing every cell of a week that
// was already empty doesn't count as a change.
function fingerprint(days: Day[]) {
  return JSON.stringify(trimDays(days));
}

// Read-only: what the student recorded for this day. The coach cannot edit it.
function StudentLog({ log }: { log?: Log }) {
  const [url, setUrl] = useState<string | null>(null);
  const photo = log?.photo_path || null;

  useEffect(() => {
    let alive = true;
    if (!photo) { setUrl(null); return; }
    signedPhotoUrl(supabase, photo).then((u) => { if (alive) setUrl(u); });
    return () => { alive = false; };
  }, [photo]);

  if (!log || (!log.done && !log.note && !photo)) return null;

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg bg-secondary/60 px-3 py-2 text-xs">
      <span className={cn(
        'inline-flex items-center gap-1 font-bold',
        log.done ? 'text-easy' : 'text-muted-foreground',
      )}>
        <Check className="size-3.5" strokeWidth={3} />
        {log.done ? 'انجام شد' : 'ثبت نشده'}
      </span>
      {log.note && (
        <span dir="auto" className="min-w-0 flex-1 text-muted-foreground">{log.note}</span>
      )}
      {url && (
        <a href={url} target="_blank" rel="noopener" className="inline-flex items-center gap-1 text-primary hover:underline">
          <Camera className="size-3.5" />
          عکس
        </a>
      )}
    </div>
  );
}
