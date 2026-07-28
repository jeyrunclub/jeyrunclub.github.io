import { useEffect, useMemo, useState } from 'react';
import {
  ChevronRight, ChevronLeft, Flame, Zap, Activity, Snowflake, Moon, StickyNote,
  Camera, X, CalendarDays, Check, Clock,
} from 'lucide-react';
import { supabase } from '../../lib/supabase.js';
import {
  TYPE_BY_ID, BLOCK_KIND_BY_ID,
  addDays, weekSaturdayOf, today, faNum, faDateLong,
  monthGrid, fetchSessionsForRange, loadOrInitPlan, savePlan,
  summariseSession, ensureSessionDate,
  uploadSessionPhoto, signedPhotoUrl, deleteSessionPhoto,
} from '../../lib/plan.js';
import {
  JALALI_MONTHS, gregDateToJalali, jalaliPrevMonth, jalaliNextMonth,
} from '../../lib/jalali.js';
import { AppHeader } from './AppHeader';
import { Card } from '../ui/card';
import { Button } from '../ui/button';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '../ui/dialog';
import { cn } from '../../lib/utils';

type Profile = {
  id: string;
  role: string;
  status: string;
  full_name: string | null;
};

type Session = any; // shape from plan.js

type SessionsByDate = Record<string, Session[]>;

const DOW_LABELS = ['شنبه','یک‌شنبه','دوشنبه','سه‌شنبه','چهارشنبه','پنج‌شنبه','جمعه'];

export function StudentPage() {
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<Profile | null>(null);

  // calendar state
  const [cal, setCal] = useState(() => {
    const j = gregDateToJalali(new Date());
    return { jy: j.jy, jm: j.jm };
  });
  const [sessionsByDate, setSessionsByDate] = useState<SessionsByDate>({});
  const [selectedDate, setSelectedDate] = useState<string>(today());
  const [reloadTick, setReloadTick] = useState(0);

  // viewer modal
  const [viewing, setViewing] = useState<{ dateIso: string; session: Session } | null>(null);

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

  // Load sessions whenever calendar month or reload tick changes
  const monthCells = useMemo(() => monthGrid(cal.jy, cal.jm), [cal.jy, cal.jm]);

  useEffect(() => {
    if (!profile) return;
    const from = monthCells[0].date;
    const to = monthCells[monthCells.length - 1].date;
    (async () => {
      const byStudent = await fetchSessionsForRange(supabase, [profile.id], from, to);
      setSessionsByDate(byStudent[profile.id] || {});
    })();
  }, [profile, monthCells, reloadTick]);

  const todayIso = today();

  // Stats + progress
  const monthSessions = useMemo(
    () => monthCells.filter((c) => c.inMonth).flatMap((c) => sessionsByDate[c.date] || []),
    [monthCells, sessionsByDate],
  );
  const monthDone = monthSessions.filter((s) => s.status === 'done').length;

  const weekProgress = useMemo(() => {
    const wkStart = weekSaturdayOf(todayIso);
    const wkDates = Array.from({ length: 7 }, (_, i) => addDays(wkStart, i));
    const wkSessions = wkDates.flatMap((d) => sessionsByDate[d] || []);
    const wkDone = wkSessions.filter((s) => s.status === 'done' || s.status === 'submitted').length;
    return { done: wkDone, total: wkSessions.length };
  }, [sessionsByDate, todayIso]);

  const todaySessions = sessionsByDate[todayIso] || [];
  const daySessions = sessionsByDate[selectedDate] || [];

  function prevMonth() { const n = jalaliPrevMonth(cal.jy, cal.jm); setCal(n); }
  function nextMonth() { const n = jalaliNextMonth(cal.jy, cal.jm); setCal(n); }

  function openViewer(dateIso: string, session: Session) {
    setViewing({ dateIso, session: JSON.parse(JSON.stringify(session)) });
  }
  function closeViewer() { setViewing(null); }

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

  const pctWeek = weekProgress.total ? Math.round((weekProgress.done / weekProgress.total) * 100) : 0;

  return (
    <div className="min-h-screen">
      <AppHeader isCoach={false} />
      <main className="mx-auto flex max-w-5xl flex-col gap-5 px-5 pb-16 pt-6">
        {/* Hero header + stats */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight">
              سلام {profile.full_name || ''}
            </h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
              در ادامه، تقویم تمرین‌های این ماه.
            </p>
          </div>
          <div className="flex gap-2.5">
            <StatPill n={monthDone} label="تیک‌خورده" accent />
            <StatPill n={monthSessions.length} label="جلسه‌ی ماه" />
          </div>
        </div>

        {/* Today hero */}
        {todaySessions.map((s: Session, i: number) => {
          const t = TYPE_BY_ID[s.type] || TYPE_BY_ID.easy;
          const statusLabel = s.status === 'done' ? 'انجام شد'
            : s.status === 'submitted' ? 'منتظر تأیید سالار' : 'برنامه‌ی امروز شما';
          return (
            <button
              key={i}
              type="button"
              onClick={() => openViewer(todayIso, s)}
              className="group rounded-3xl border-2 p-6 text-start shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-lg"
              style={{
                borderColor: `${t.color}55`,
                background: `linear-gradient(135deg, ${t.color}18 0%, transparent 70%)`,
              }}
            >
              <div className="mb-2 flex items-center gap-2.5">
                <span className="text-xs font-bold uppercase tracking-wide" style={{ color: t.color }}>
                  {s.status === 'done' && <Check className="me-1 inline size-3.5" />}
                  {statusLabel}
                </span>
                <span
                  className="ms-auto rounded-full px-3 py-1 text-xs font-bold text-white"
                  style={{ background: t.color }}
                >
                  {t.label}
                </span>
              </div>
              <h2 className="mb-3 text-xl font-extrabold tracking-tight sm:text-2xl">
                {s.title || t.label}
              </h2>
              <HeroBlocks blocks={s.blocks || []} />
              <div className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-gradient-to-b from-brand-400 to-brand-600 px-5 py-2 text-sm font-semibold text-white shadow-md shadow-brand-500/25">
                مشاهده و ثبت انجام
              </div>
            </button>
          );
        })}

        {/* Weekly progress */}
        <Card className="p-5">
          <div className="mb-2 flex items-center justify-between text-sm">
            <span className="text-muted-foreground">پیشرفت این هفته</span>
            <strong className="font-mono tabular-nums">
              {faNum(weekProgress.done)} از {faNum(weekProgress.total)}
            </strong>
          </div>
          <div className="h-2.5 rounded-full bg-secondary">
            <div
              style={{ width: `${pctWeek}%` }}
              className="h-full rounded-full bg-gradient-to-r from-brand-400 to-brand-600 shadow-md shadow-brand-500/25 transition-all"
            />
          </div>
        </Card>

        {/* Calendar */}
        <Card className="p-5">
          <div className="mb-3 flex items-center justify-between">
            <Button variant="ghost" size="icon" onClick={nextMonth} aria-label="ماه بعد" className="rounded-full">
              <ChevronRight className="size-5" />
            </Button>
            <div className="text-center">
              <div className="text-lg font-bold leading-tight">{JALALI_MONTHS[cal.jm - 1]}</div>
              <div className="mt-0.5 text-xs text-muted-foreground">{faNum(cal.jy)}</div>
            </div>
            <Button variant="ghost" size="icon" onClick={prevMonth} aria-label="ماه قبل" className="rounded-full">
              <ChevronLeft className="size-5" />
            </Button>
          </div>

          <div className="mb-1.5 grid grid-cols-7 gap-1 text-center text-[0.7rem] font-semibold text-muted-foreground">
            {DOW_LABELS.map((d) => (
              <span key={d} className="py-1.5">{d}</span>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1">
            {monthCells.map((c) => {
              const sessions = sessionsByDate[c.date] || [];
              const isSelected = c.date === selectedDate;
              return (
                <button
                  key={c.date}
                  type="button"
                  onClick={() => c.inMonth && setSelectedDate(c.date)}
                  disabled={!c.inMonth}
                  className={cn(
                    'group relative flex min-h-[72px] flex-col rounded-xl border p-1.5 text-start transition-all',
                    'border-transparent bg-muted/50',
                    c.inMonth && 'hover:border-primary hover:bg-accent',
                    !c.inMonth && 'cursor-default opacity-35',
                    c.isToday && 'bg-gradient-to-br from-accent to-muted/50 ring-2 ring-primary shadow-lg',
                    isSelected && c.inMonth && !c.isToday && 'border-primary bg-accent',
                    'max-sm:min-h-[62px] max-sm:p-1',
                  )}
                >
                  <div className={cn(
                    'mb-1 flex items-center text-sm font-bold max-sm:text-xs',
                    c.isToday && 'text-primary',
                  )}>
                    <span>{faNum(c.day)}</span>
                    {c.isToday && (
                      <span className="ms-1 rounded-full bg-gradient-to-b from-emerald-400 to-emerald-600 px-2 py-0.5 text-[0.6rem] font-extrabold text-white shadow-sm shadow-emerald-500/35">
                        امروز
                      </span>
                    )}
                  </div>
                  <div className="flex flex-col gap-0.5">
                    {sessions.map((s: Session, i: number) => {
                      const t = TYPE_BY_ID[s.type] || TYPE_BY_ID.easy;
                      const statusBg = s.status === 'done'
                        ? 'bg-emerald-500/15'
                        : s.status === 'submitted'
                          ? 'bg-amber-500/15'
                          : 'bg-card';
                      return (
                        <div
                          key={i}
                          className={cn(
                            'truncate rounded-md border-s-[3px] px-1.5 py-0.5 text-[0.68rem] leading-tight max-sm:text-[0.6rem] max-sm:px-1',
                            statusBg,
                          )}
                          style={{ borderInlineStartColor: t.color }}
                        >
                          {summariseSession(s)}
                        </div>
                      );
                    })}
                  </div>
                </button>
              );
            })}
          </div>
        </Card>

        {/* Day view */}
        <DayView
          dateIso={selectedDate}
          sessions={daySessions}
          todayIso={todayIso}
          onOpen={(s) => openViewer(selectedDate, s)}
        />
      </main>

      {/* Viewer / mark-done modal */}
      <ViewerDialog
        viewing={viewing}
        todayIso={todayIso}
        studentId={profile.id}
        onClose={closeViewer}
        onSaved={() => { closeViewer(); setReloadTick((n) => n + 1); }}
      />
    </div>
  );
}

// ---------- Small components ----------
function StatPill({ n, label, accent = false }: { n: number; label: string; accent?: boolean }) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-border bg-card px-4 py-2 shadow-sm">
      <span className={cn(
        'font-mono text-lg font-extrabold tabular-nums',
        accent && 'text-primary',
      )}>{faNum(n)}</span>
      <span className="text-[0.68rem] font-medium text-muted-foreground">{label}</span>
    </div>
  );
}

function HeroBlocks({ blocks }: { blocks: any[] }) {
  if (!blocks.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {blocks.map((b, i) => {
        const kind = BLOCK_KIND_BY_ID[b.kind]?.label ?? b.kind;
        const parts: string[] = [];
        if (b.kind === 'interval') {
          const r = b.repeat || 1;
          if (b.distance_m)       parts.push(`${faNum(r)}×${faNum(b.distance_m)}m`);
          else if (b.distance_km) parts.push(`${faNum(r)}×${faNum(b.distance_km)}km`);
          if (b.rest_sec)         parts.push(`استراحت ${faNum(b.rest_sec)}s`);
        } else {
          if (b.distance_km) parts.push(`${faNum(b.distance_km)}km`);
          if (b.minutes)     parts.push(`${faNum(b.minutes)}′`);
          if (b.pace)        parts.push(`ریتم ${b.pace}`);
        }
        return (
          <span key={i} className="inline-block rounded-full bg-card/80 px-3 py-1 text-sm text-muted-foreground">
            <strong className="me-1 text-foreground">{kind}</strong>
            {parts.length > 0 && <span>— {parts.join(' · ')}</span>}
          </span>
        );
      })}
    </div>
  );
}

function DayView({
  dateIso, sessions, todayIso, onOpen,
}: {
  dateIso: string;
  sessions: Session[];
  todayIso: string;
  onOpen: (s: Session) => void;
}) {
  const isToday = dateIso === todayIso;
  const heading = isToday ? 'امروز' : faDateLong(dateIso);

  if (!sessions.length) {
    return (
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold">{heading}</h2>
          {!isToday && <span className="text-sm text-muted-foreground">{faDateLong(dateIso)}</span>}
        </div>
        <Card className="flex flex-col items-center gap-3 p-10 text-center text-muted-foreground">
          <CalendarDays className="size-10 text-muted-foreground/60" />
          <h3 className="text-base font-bold text-foreground">بدون تمرین</h3>
          <p className="text-sm">برای این روز برنامه‌ای ثبت نشده.</p>
        </Card>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-bold">{heading}</h2>
        {isToday && <span className="text-sm text-muted-foreground">{faDateLong(dateIso)}</span>}
      </div>
      <div className="flex flex-col gap-3">
        {sessions.map((s: Session, i: number) => {
          const t = TYPE_BY_ID[s.type] || TYPE_BY_ID.easy;
          const statusLabel = s.status === 'done' ? 'انجام شد'
            : s.status === 'submitted' ? 'منتظر تأیید'
            : 'برنامه‌ریزی‌شده';
          const statusClasses = s.status === 'done'
            ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
            : s.status === 'submitted'
              ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
              : 'bg-muted text-muted-foreground';
          return (
            <Card
              key={i}
              onClick={() => onOpen(s)}
              className="cursor-pointer p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
            >
              <div className="mb-2 flex flex-wrap items-center gap-2.5">
                <span
                  className="inline-flex items-center rounded-full px-3 py-1 text-xs font-bold text-white"
                  style={{ background: t.color }}
                >
                  {t.label}
                </span>
                {s.title && <h3 className="text-base font-bold">{s.title}</h3>}
                <span className={cn('ms-auto rounded-full px-2.5 py-0.5 text-[0.72rem] font-semibold', statusClasses)}>
                  {statusLabel}
                </span>
              </div>
              {(s.blocks || []).length === 0 ? (
                <p className="m-0 text-sm text-muted-foreground">بدون مرحله‌ی تمرینی</p>
              ) : (
                <div className="flex flex-col">
                  {(s.blocks || []).map((b: any, bi: number) => (
                    <BlockLine key={bi} block={b} />
                  ))}
                </div>
              )}
              {s.notes && (
                <div className="mt-3 rounded-xl border border-border bg-secondary px-3.5 py-2.5 text-sm text-muted-foreground">
                  {s.notes}
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function BlockLine({ block }: { block: any }) {
  const label = BLOCK_KIND_BY_ID[block.kind]?.label ?? block.kind;
  return (
    <div className="flex items-start gap-2.5 border-t border-border py-2.5 first:border-t-0 first:pt-1.5">
      <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground">
        <BlockIcon kind={block.kind} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold">{label}</div>
        <div className="mt-0.5 text-sm text-muted-foreground">{formatBlockSub(block)}</div>
      </div>
    </div>
  );
}

function BlockIcon({ kind }: { kind: string }) {
  const cls = 'size-4';
  switch (kind) {
    case 'warmup':   return <Flame className={cls} />;
    case 'interval': return <Zap className={cls} />;
    case 'run':      return <Activity className={cls} />;
    case 'cooldown': return <Snowflake className={cls} />;
    case 'rest':     return <Moon className={cls} />;
    case 'note':     return <StickyNote className={cls} />;
    default:         return <StickyNote className={cls} />;
  }
}

function formatBlockSub(b: any): string {
  const parts: string[] = [];
  if (b.kind === 'interval') {
    const r = b.repeat || 1;
    if (b.distance_m)       parts.push(`${faNum(r)}×${faNum(b.distance_m)}m`);
    else if (b.distance_km) parts.push(`${faNum(r)}×${faNum(b.distance_km)}km`);
    else if (b.minutes)     parts.push(`${faNum(r)}×${faNum(b.minutes)} دقیقه`);
    if (b.rest_sec)         parts.push(`استراحت ${faNum(b.rest_sec)} ثانیه`);
    else if (b.rest_min)    parts.push(`استراحت ${faNum(b.rest_min)} دقیقه`);
  } else {
    if (b.distance_km) parts.push(`${faNum(b.distance_km)} کیلومتر`);
    if (b.minutes)     parts.push(`${faNum(b.minutes)} دقیقه`);
    if (b.pace)        parts.push(`ریتم ${b.pace}`);
  }
  if (b.description) parts.push(b.description);
  return parts.join(' · ');
}

// ---------- Viewer dialog ----------
function ViewerDialog({
  viewing, todayIso, studentId, onClose, onSaved,
}: {
  viewing: { dateIso: string; session: Session } | null;
  todayIso: string;
  studentId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const open = !!viewing;
  const [studentNote, setStudentNote] = useState('');
  const [pendingPhoto, setPendingPhoto] = useState<File | null>(null);
  const [pendingPhotoUrl, setPendingPhotoUrl] = useState<string | null>(null);
  const [existingPhotoUrl, setExistingPhotoUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset state when viewing changes
  useEffect(() => {
    if (!viewing) {
      setStudentNote('');
      setPendingPhoto(null);
      if (pendingPhotoUrl) URL.revokeObjectURL(pendingPhotoUrl);
      setPendingPhotoUrl(null);
      setExistingPhotoUrl(null);
      setError(null);
      setUploading(false);
      setBusy(false);
      return;
    }
    setStudentNote(viewing.session.student_note || '');
    setPendingPhoto(null);
    if (pendingPhotoUrl) URL.revokeObjectURL(pendingPhotoUrl);
    setPendingPhotoUrl(null);
    setError(null);
    setExistingPhotoUrl(null);
    // Load existing photo signed URL
    if (viewing.session.student_photo_path) {
      signedPhotoUrl(supabase, viewing.session.student_photo_path).then((url) => {
        if (url) setExistingPhotoUrl(url);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewing]);

  if (!viewing) {
    return <Dialog open={false} onOpenChange={(o) => { if (!o) onClose(); }} />;
  }

  const s = viewing.session;
  const dateIso = viewing.dateIso;
  const t = TYPE_BY_ID[s.type] || TYPE_BY_ID.easy;
  const isPastOrToday = dateIso <= todayIso;
  const isDone = s.status === 'done';
  const isSubmitted = s.status === 'submitted';
  const canSubmit = !isDone && !isSubmitted && isPastOrToday;
  const showForm = !isDone && (isSubmitted || isPastOrToday);

  function onPhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setPendingPhoto(f);
    if (pendingPhotoUrl) URL.revokeObjectURL(pendingPhotoUrl);
    setPendingPhotoUrl(URL.createObjectURL(f));
  }
  function clearPhoto() {
    setPendingPhoto(null);
    if (pendingPhotoUrl) URL.revokeObjectURL(pendingPhotoUrl);
    setPendingPhotoUrl(null);
  }

  async function markDone(newStatus: 'submitted' | 'planned') {
    setBusy(true);
    setError(null);
    const updated: Session = {
      ...s,
      status: newStatus,
      student_note: studentNote.trim(),
      submitted_at: newStatus === 'submitted' ? new Date().toISOString() : null,
    };
    // Upload photo if a new one was picked
    if (pendingPhoto) {
      setUploading(true);
      try {
        if (updated.student_photo_path) {
          await deleteSessionPhoto(supabase, updated.student_photo_path);
        }
        const path = await uploadSessionPhoto(supabase, studentId, s.id, pendingPhoto);
        updated.student_photo_path = path;
      } catch (e: any) {
        setError('آپلود عکس با خطا مواجه شد: ' + (e.message || e));
        setUploading(false);
        setBusy(false);
        return;
      }
      setUploading(false);
    }
    // Load plan for this week and update
    const weekStart = weekSaturdayOf(dateIso);
    const plan = await loadOrInitPlan(supabase, studentId, weekStart);
    const sessions = (plan.sessions || []).map((x: Session) => ensureSessionDate(x, weekStart));
    const idx = sessions.findIndex((x: Session) => x.date === dateIso);
    if (idx === -1) {
      setError('جلسه پیدا نشد');
      setBusy(false);
      return;
    }
    sessions[idx] = { ...sessions[idx], ...updated };
    plan.sessions = sessions;
    const { error: saveErr } = await savePlan(supabase, plan, null);
    if (saveErr) {
      setError('خطا: ' + saveErr.message);
      setBusy(false);
      return;
    }
    setBusy(false);
    onSaved();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{s.title || t.label}</DialogTitle>
          <DialogDescription>{faDateLong(dateIso)} · {t.label}</DialogDescription>
        </DialogHeader>

        <div>
          {(s.blocks || []).length === 0 ? (
            <p className="m-0 text-sm text-muted-foreground">بدون مرحله‌ی تمرینی</p>
          ) : (
            <div className="flex flex-col">
              {(s.blocks || []).map((b: any, bi: number) => (
                <BlockLine key={bi} block={b} />
              ))}
            </div>
          )}
          {s.notes && (
            <div className="mt-3 rounded-xl border border-border bg-secondary px-3.5 py-2.5 text-sm text-muted-foreground">
              {s.notes}
            </div>
          )}
        </div>

        {existingPhotoUrl && (
          <div>
            <Label className="mb-1.5 block">عکس ثبت‌شده</Label>
            <img
              src={existingPhotoUrl}
              alt="عکس تمرین"
              className="max-h-96 w-full rounded-xl border border-border object-contain"
            />
          </div>
        )}

        {showForm && (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="student-note">یادداشت برای مربی (اختیاری)</Label>
              <Textarea
                id="student-note"
                value={studentNote}
                onChange={(e) => setStudentNote(e.target.value)}
                placeholder="مثلاً: احساس خوبی داشتم، ریتم ۵:۱۰"
                rows={3}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="student-photo">
                عکس (اختیاری) — عکس اسکرین‌شات ساعت یا از تمرین
              </Label>
              <input
                id="student-photo"
                type="file"
                accept="image/*"
                capture="environment"
                hidden
                onChange={onPhotoChange}
              />
              {pendingPhotoUrl ? (
                <div className="flex flex-col items-start gap-2">
                  <img
                    src={pendingPhotoUrl}
                    alt="پیش‌نمایش"
                    className="max-h-48 max-w-60 rounded-xl border border-border"
                  />
                  <Button type="button" variant="outline" size="sm" onClick={clearPhoto}>
                    <X className="size-3.5" />
                    حذف عکس
                  </Button>
                </div>
              ) : (
                <label
                  htmlFor="student-photo"
                  className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border-[1.5px] border-dashed border-input bg-card px-4 py-5 text-sm font-medium text-muted-foreground transition-all hover:border-primary hover:bg-accent hover:text-primary"
                >
                  <Camera className="size-5" />
                  انتخاب یا گرفتن عکس
                </label>
              )}
              {uploading && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Clock className="size-3.5 animate-spin" />
                  در حال آپلود عکس…
                </div>
              )}
            </div>
          </div>
        )}

        {error && (
          <div className="rounded-xl border border-destructive/25 bg-destructive/10 px-3.5 py-2.5 text-sm text-destructive">
            {error}
          </div>
        )}

        <div className="flex items-center gap-2 pt-2">
          {isDone && (
            <Button variant="outline" onClick={onClose}>بستن</Button>
          )}
          {isSubmitted && (
            <>
              <Button variant="outline" disabled={busy} onClick={() => markDone('planned')}>
                لغو ثبت انجام
              </Button>
              <Button variant="outline" onClick={onClose} className="ms-auto">بستن</Button>
            </>
          )}
          {!isDone && !isSubmitted && (
            <>
              <Button variant="outline" onClick={onClose}>بستن</Button>
              {canSubmit && (
                <Button disabled={busy} onClick={() => markDone('submitted')} className="ms-auto">
                  ثبت انجام
                </Button>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
