import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ChevronLeft, ChevronRight, Trash2, Plus, Check, X,
  Flame, Activity, Zap, Snowflake, Moon, StickyNote,
  Minus, Camera as CameraIcon, ImageIcon, Pencil,
} from 'lucide-react';
import { supabase } from '../../lib/supabase.js';
import {
  TYPES, TYPE_BY_ID, BLOCK_KIND_BY_ID,
  weekSaturdayOf, addDays, today as todayIso, faNum, faDateLong,
  monthGrid, fetchSessionsForRange, loadOrInitPlan, savePlan,
  summariseSession, newSession, newBlock, ensureSessionDate,
  signedPhotoUrl,
} from '../../lib/plan.js';
import {
  JALALI_MONTHS, gregDateToJalali, jalaliPrevMonth, jalaliNextMonth,
} from '../../lib/jalali.js';
import { AppHeader } from '../app/AppHeader';
import { Card } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import { Badge } from '../ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '../ui/dialog';
import { cn } from '../../lib/utils';

type Profile = {
  id: string; full_name: string | null; phone: string | null;
  role: 'coach' | 'student'; status: 'pending' | 'approved' | 'rejected';
  email?: string;
};

type Block = {
  kind: 'warmup' | 'run' | 'interval' | 'cooldown' | 'rest' | 'note';
  repeat?: number; distance_km?: number; distance_m?: number;
  minutes?: number; rest_sec?: number; rest_min?: number;
  pace?: string; description?: string;
};

type Session = {
  id: string; date: string;
  type: string; title?: string; blocks: Block[]; notes?: string;
  status?: 'planned' | 'submitted' | 'done';
  student_note?: string; student_photo_path?: string;
  submitted_at?: string | null; done_at?: string | null;
};

const BLOCK_ICONS: Record<Block['kind'], React.ComponentType<{ className?: string }>> = {
  warmup: Flame, run: Activity, interval: Zap,
  cooldown: Snowflake, rest: Moon, note: StickyNote,
};
const BLOCK_STRIPE: Record<Block['kind'], string> = {
  warmup: 'border-s-amber-500', run: 'border-s-emerald-500',
  interval: 'border-s-primary', cooldown: 'border-s-blue-500',
  rest: 'border-s-slate-500', note: 'border-s-purple-500',
};
const BLOCK_ICON_BG: Record<Block['kind'], string> = {
  warmup: 'bg-amber-500/15 text-amber-600',
  run: 'bg-emerald-500/15 text-emerald-600',
  interval: 'bg-primary/15 text-primary',
  cooldown: 'bg-blue-500/15 text-blue-600',
  rest: 'bg-slate-500/15 text-slate-600',
  note: 'bg-purple-500/15 text-purple-600',
};

const PRESETS: Record<string, Record<string, number[]>> = {
  warmup:   { distance_km: [1, 2, 3] },
  cooldown: { distance_km: [1, 2, 3] },
  run:      { distance_km: [5, 8, 10, 15, 20], minutes: [30, 45, 60, 90] },
  interval: {
    repeat: [4, 5, 6, 8, 10, 12],
    distance_m: [200, 400, 600, 800, 1000, 1600],
    rest_sec: [30, 60, 90, 120, 180],
  },
  rest: { minutes: [1, 2, 5, 10] },
};

export function CoachPage() {
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [allUsers, setAllUsers] = useState<Profile[]>([]);
  const [currentStudentId, setCurrentStudentId] = useState<string | null>(null);
  const [cal, setCal] = useState({ jy: 0, jm: 0 });
  const [sessionsByStudent, setSessionsByStudent] = useState<Record<string, Record<string, Session[]>>>({});
  const [editing, setEditing] = useState<{ dateIso: string; session: Session; isNew: boolean } | null>(null);

  // Boot
  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { window.location.replace('/app/login'); return; }
      const { data: p } = await supabase.from('profiles').select('*').eq('id', session.user.id).single();
      if (!p || p.role !== 'coach') { setDenied(true); setLoading(false); return; }
      setProfile(p);
      const j = gregDateToJalali(new Date());
      setCal({ jy: j.jy, jm: j.jm });
      await refreshUsers();
      setLoading(false);
    })();
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

  const refreshCalendar = useCallback(async () => {
    if (!cal.jy) return;
    const cells = monthGrid(cal.jy, cal.jm);
    const from = cells[0].date, to = cells[cells.length - 1].date;
    const sids = allUsers.filter((u) => u.status === 'approved' && u.role !== 'coach').map((u) => u.id);
    const map = await fetchSessionsForRange(supabase, sids, from, to);
    setSessionsByStudent(map);
  }, [cal.jy, cal.jm, allUsers]);

  useEffect(() => { refreshCalendar(); }, [refreshCalendar]);

  const pendingUsers = useMemo(() => allUsers.filter((u) => u.status === 'pending'), [allUsers]);
  const students = useMemo(
    () => allUsers.filter((u) => u.status === 'approved' && u.role !== 'coach'),
    [allUsers],
  );
  const totalSessions = useMemo(
    () => Object.values(sessionsByStudent).reduce(
      (n, per) => n + Object.values(per).reduce((m, arr) => m + arr.length, 0), 0),
    [sessionsByStudent],
  );

  async function approveOrReject(id: string, status: 'approved' | 'rejected') {
    const { error } = await supabase.rpc('set_profile_status',
      { target: id, new_status: status, new_role: null });
    if (error) { alert(error.message); return; }
    await refreshUsers();
  }

  function openEditor(dateIso: string, existing: Session | null) {
    if (!currentStudentId) { alert('اول یک شاگرد را از بالای صفحه انتخاب کن.'); return; }
    const session: Session = existing
      ? JSON.parse(JSON.stringify(existing))
      : newSession(dateIso);
    setEditing({ dateIso, session, isNew: !existing });
  }

  async function saveSession() {
    if (!editing) return;
    const weekStart = weekSaturdayOf(editing.dateIso);
    const plan = await loadOrInitPlan(supabase, currentStudentId!, weekStart);
    const sessions = (plan.sessions || []).map((x: Session) => ensureSessionDate(x, weekStart));
    const idx = sessions.findIndex((x: Session) => x.date === editing.dateIso);
    if (idx >= 0) sessions[idx] = editing.session;
    else sessions.push(editing.session);
    plan.sessions = sessions;
    const { error } = await savePlan(supabase, plan, profile!.id);
    if (error) { alert('خطا: ' + error.message); return; }
    setEditing(null);
    await refreshCalendar();
  }

  async function deleteSession() {
    if (!editing) return;
    if (!confirm('این جلسه حذف شود؟')) return;
    const weekStart = weekSaturdayOf(editing.dateIso);
    const plan = await loadOrInitPlan(supabase, currentStudentId!, weekStart);
    const sessions = (plan.sessions || [])
      .map((x: Session) => ensureSessionDate(x, weekStart))
      .filter((x: Session) => x.date !== editing.dateIso);
    plan.sessions = sessions;
    await savePlan(supabase, plan, profile!.id);
    setEditing(null);
    await refreshCalendar();
  }

  async function decideSubmission(newStatus: 'done' | 'planned') {
    if (!editing) return;
    setEditing({
      ...editing,
      session: {
        ...editing.session,
        status: newStatus,
        done_at: newStatus === 'done' ? new Date().toISOString() : null,
      },
    });
    // save immediately with the updated status
    const weekStart = weekSaturdayOf(editing.dateIso);
    const plan = await loadOrInitPlan(supabase, currentStudentId!, weekStart);
    const sessions = (plan.sessions || []).map((x: Session) => ensureSessionDate(x, weekStart));
    const idx = sessions.findIndex((x: Session) => x.date === editing.dateIso);
    if (idx >= 0) {
      sessions[idx] = {
        ...sessions[idx],
        status: newStatus,
        done_at: newStatus === 'done' ? new Date().toISOString() : null,
      };
    }
    plan.sessions = sessions;
    await savePlan(supabase, plan, profile!.id);
    setEditing(null);
    await refreshCalendar();
  }

  if (loading) return <FullBleedLoader />;
  if (denied) return (
    <div className="min-h-screen">
      <AppHeader />
      <main className="mx-auto max-w-lg px-5 py-20 text-center">
        <h2 className="text-xl font-bold">دسترسی ندارد</h2>
        <p className="mt-2 text-muted-foreground">این صفحه فقط برای مربی است.</p>
      </main>
    </div>
  );

  return (
    <div className="min-h-screen">
      <AppHeader isCoach />
      <main className="mx-auto max-w-5xl space-y-5 px-5 py-8 pb-20">
        {/* HERO */}
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight">پنل مربی</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {profile?.full_name ? `سلام ${profile.full_name}` : 'خوش آمدی'}
            </p>
          </div>
          <div className="flex gap-2">
            <StatCard n={pendingUsers.length} label="درخواست" accent />
            <StatCard n={students.length} label="شاگرد" />
            <StatCard n={totalSessions} label="جلسه‌ی ماه" />
          </div>
        </div>

        {/* STUDENT PICKER */}
        <Card className="p-4">
          <Label htmlFor="student-picker" className="mb-2 block">شاگرد فعال</Label>
          <select
            id="student-picker"
            value={currentStudentId || ''}
            onChange={(e) => setCurrentStudentId(e.target.value)}
            className="flex h-11 w-full rounded-xl border-[1.5px] border-input bg-card px-4 py-2 text-base ring-offset-background transition-all hover:border-muted-foreground focus-visible:outline-none focus-visible:border-primary focus-visible:ring-4 focus-visible:ring-accent"
          >
            {students.length ? (
              students.map((s) => (
                <option key={s.id} value={s.id}>{s.full_name || s.email || '—'}</option>
              ))
            ) : (
              <option value="" disabled>هیچ شاگردی هنوز تأیید نشده</option>
            )}
          </select>
          <p className="mt-2 text-xs text-muted-foreground">
            شاگرد را انتخاب کن، سپس روی روزی از تقویم بزن.
          </p>
        </Card>

        {/* PENDING APPROVALS */}
        {pendingUsers.length > 0 && (
          <Card className="p-5">
            <h2 className="mb-3 text-base font-bold">درخواست‌های در انتظار</h2>
            <div className="divide-y divide-border">
              {pendingUsers.map((u) => (
                <div key={u.id} className="flex items-center gap-3 py-3">
                  <Avatar name={u.full_name || u.email || '?'} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold text-sm">{u.full_name || '(بدون نام)'}</div>
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

        {/* CALENDAR */}
        <Card className="p-4">
          <div className="mb-3 flex items-center justify-between">
            <Button variant="ghost" size="icon"
              onClick={() => setCal(jalaliPrevMonth(cal.jy, cal.jm))} aria-label="ماه قبل">
              <ChevronRight className="size-5" />
            </Button>
            <div className="text-center">
              <div className="text-lg font-bold">{JALALI_MONTHS[cal.jm - 1]}</div>
              <div className="text-xs text-muted-foreground mt-0.5">{faNum(cal.jy)}</div>
            </div>
            <Button variant="ghost" size="icon"
              onClick={() => setCal(jalaliNextMonth(cal.jy, cal.jm))} aria-label="ماه بعد">
              <ChevronLeft className="size-5" />
            </Button>
          </div>
          <div className="mb-1.5 grid grid-cols-7 gap-1 text-center text-[11px] font-semibold text-muted-foreground">
            {['شنبه','یک‌شنبه','دوشنبه','سه‌شنبه','چهارشنبه','پنج‌شنبه','جمعه']
              .map((d) => <span key={d} className="py-1.5">{d}</span>)}
          </div>
          <CalendarGrid
            jy={cal.jy} jm={cal.jm}
            sessions={currentStudentId ? (sessionsByStudent[currentStudentId] || {}) : {}}
            onDayClick={(iso, list) => openEditor(iso, list[0] || null)}
          />
        </Card>

        {/* STUDENT LIST */}
        <Card className="p-5">
          <h2 className="mb-3 text-base font-bold">همه‌ی شاگردان</h2>
          {allUsers.filter((u) => u.status !== 'pending').length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">هنوز شاگردی نیست.</p>
          ) : (
            <div className="divide-y divide-border">
              {allUsers.filter((u) => u.status !== 'pending').map((r) => {
                const per = sessionsByStudent[r.id] || {};
                const flat = Object.values(per).flat();
                const submittedCount = flat.filter((s) => s.status === 'submitted').length;
                const total = flat.length;
                const isCoachRow = r.role === 'coach';
                return (
                  <div key={r.id} className="flex items-center gap-3 py-3">
                    <Avatar name={r.full_name || r.email || '?'} muted={isCoachRow} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="truncate text-sm font-semibold">{r.full_name || '(بدون نام)'}</span>
                        {isCoachRow && <Badge variant="destructive" className="bg-primary/15 text-primary">مربی</Badge>}
                        {r.status === 'rejected' && <Badge variant="destructive">رد شده</Badge>}
                        {submittedCount > 0 && <Badge variant="warning">{faNum(submittedCount)} منتظر تأیید</Badge>}
                      </div>
                      <div className="mt-0.5 truncate text-xs text-muted-foreground" dir="ltr">
                        {r.email}{r.phone ? ' · ' + r.phone : ''}
                      </div>
                    </div>
                    {!isCoachRow && (
                      <Button variant="outline" size="sm" onClick={() => {
                        setCurrentStudentId(r.id);
                        document.querySelector('.grid-cols-7')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                      }}>
                        این ماه: {faNum(total)}
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </main>

      {/* SESSION EDITOR DIALOG */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        {editing && (
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editing.isNew ? 'جلسه‌ی جدید' : 'ویرایش جلسه'}</DialogTitle>
              <DialogDescription>{faDateLong(editing.dateIso)}</DialogDescription>
            </DialogHeader>

            <SessionEditor
              session={editing.session}
              onChange={(s) => setEditing({ ...editing, session: s })}
            />

            {editing.session.status === 'submitted' && (
              <SubmittedPanel
                session={editing.session}
                onApprove={() => decideSubmission('done')}
                onReject={() => decideSubmission('planned')}
              />
            )}

            <DialogFooter>
              {!editing.isNew && (
                <Button variant="outline" onClick={deleteSession} className="me-auto text-destructive hover:text-destructive hover:border-destructive">
                  <Trash2 className="size-4" />
                  حذف
                </Button>
              )}
              <Button variant="outline" onClick={() => setEditing(null)}>لغو</Button>
              <Button onClick={saveSession}>
                <Check className="size-4" />
                ذخیره
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}

/* ============================== */
/*  Calendar Grid                 */
/* ============================== */
function CalendarGrid({ jy, jm, sessions, onDayClick }: {
  jy: number; jm: number;
  sessions: Record<string, Session[]>;
  onDayClick: (iso: string, list: Session[]) => void;
}) {
  const cells = useMemo(() => monthGrid(jy, jm), [jy, jm]);
  return (
    <div className="grid grid-cols-7 gap-1">
      {cells.map((c) => {
        const list = sessions[c.date] || [];
        const clickable = c.inMonth;
        return (
          <button
            key={c.date}
            type="button"
            onClick={() => clickable && onDayClick(c.date, list)}
            disabled={!clickable}
            className={cn(
              'group flex min-h-[70px] flex-col rounded-xl border p-1.5 text-start transition-all',
              c.inMonth ? 'bg-secondary/40 border-transparent hover:bg-accent hover:border-primary cursor-pointer' : 'bg-transparent border-transparent opacity-30',
              c.isToday && 'bg-accent border-2 border-primary shadow-lg shadow-primary/20',
            )}
          >
            <div className={cn('mb-1 text-xs font-bold', c.isToday && 'text-primary')}>
              {faNum(c.day)}
              {c.isToday && (
                <span className="ms-1 inline-flex items-center rounded-full bg-gradient-to-b from-emerald-400 to-emerald-600 px-1.5 py-0.5 text-[9px] font-extrabold text-white shadow shadow-emerald-500/40">
                  امروز
                </span>
              )}
            </div>
            <div className="flex flex-col gap-0.5">
              {list.map((s, i) => {
                const t = TYPE_BY_ID[s.type] || TYPE_BY_ID.easy;
                return (
                  <div
                    key={i}
                    className={cn(
                      'truncate rounded border-s-2 bg-card px-1 py-0.5 text-[10px] leading-tight',
                      s.status === 'done' && 'bg-emerald-500/15',
                      s.status === 'submitted' && 'bg-amber-500/15',
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
  );
}

/* ============================== */
/*  Session Editor                */
/* ============================== */
function SessionEditor({ session, onChange }: {
  session: Session; onChange: (s: Session) => void;
}) {
  function updateBlock(i: number, patch: Partial<Block>) {
    const blocks = [...(session.blocks || [])];
    blocks[i] = { ...blocks[i], ...patch };
    onChange({ ...session, blocks });
  }
  function delBlock(i: number) {
    const blocks = [...(session.blocks || [])];
    blocks.splice(i, 1);
    onChange({ ...session, blocks });
  }
  function addBlock(kind: Block['kind']) {
    onChange({ ...session, blocks: [...(session.blocks || []), newBlock(kind)] });
  }

  return (
    <div className="space-y-4">
      {/* Type chips */}
      <div>
        <Label className="mb-2 block">نوع تمرین</Label>
        <div className="flex flex-wrap gap-1.5">
          {TYPES.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => onChange({ ...session, type: t.id })}
              className={cn(
                'rounded-full border-[1.5px] px-3.5 py-1.5 text-xs font-semibold transition-all',
                session.type === t.id
                  ? 'bg-accent border-primary text-primary'
                  : 'bg-card border-border text-muted-foreground hover:border-muted-foreground hover:text-foreground',
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Title */}
      <div className="space-y-1.5">
        <Label htmlFor="s-title">عنوان (اختیاری)</Label>
        <Input
          id="s-title"
          value={session.title || ''}
          onChange={(e) => onChange({ ...session, title: e.target.value })}
          placeholder="مثلاً: تمپو ۵×۱km"
        />
      </div>

      {/* Blocks */}
      <div className="space-y-1.5">
        <Label>مراحل تمرین</Label>
        {!session.blocks?.length && (
          <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
            هنوز مرحله‌ای اضافه نشده. از دکمه‌های زیر یکی را انتخاب کن.
          </p>
        )}
        <div className="space-y-2">
          {(session.blocks || []).map((b, i) => (
            <BlockCard
              key={i}
              block={b}
              onChange={(patch) => updateBlock(i, patch)}
              onDelete={() => delBlock(i)}
            />
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5 pt-1">
          {(['warmup', 'run', 'interval', 'cooldown', 'rest', 'note'] as const).map((k) => (
            <Button key={k} type="button" variant="outline" size="sm" onClick={() => addBlock(k)}>
              <Plus className="size-3.5" />
              {BLOCK_KIND_BY_ID[k]?.label}
            </Button>
          ))}
        </div>
      </div>

      {/* Coach notes */}
      <div className="space-y-1.5">
        <Label htmlFor="s-notes">یادداشت برای شاگرد (اختیاری)</Label>
        <Textarea
          id="s-notes"
          rows={2}
          value={session.notes || ''}
          onChange={(e) => onChange({ ...session, notes: e.target.value })}
          placeholder="نکته‌های اضافی…"
        />
      </div>
    </div>
  );
}

/* ============================== */
/*  Block Card                    */
/* ============================== */
function BlockCard({ block, onChange, onDelete }: {
  block: Block; onChange: (patch: Partial<Block>) => void; onDelete: () => void;
}) {
  const Icon = BLOCK_ICONS[block.kind];
  const label = BLOCK_KIND_BY_ID[block.kind]?.label ?? block.kind;
  const presets = PRESETS[block.kind] || {};
  return (
    <div className={cn(
      'overflow-hidden rounded-2xl border border-border bg-card border-s-[4px]',
      BLOCK_STRIPE[block.kind],
    )}>
      <div className="flex items-center justify-between gap-2 px-4 pb-1 pt-3">
        <div className="flex items-center gap-2 text-sm font-bold">
          <span className={cn('flex size-6 items-center justify-center rounded-lg', BLOCK_ICON_BG[block.kind])}>
            <Icon className="size-3.5" />
          </span>
          {label}
        </div>
        <button
          type="button"
          onClick={onDelete}
          className="inline-flex size-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
          aria-label="حذف"
        >
          <X className="size-4" />
        </button>
      </div>

      <div className="space-y-3 px-4 pb-4 pt-1">
        {block.kind === 'interval' && (
          <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <NumField label="تعداد تکرار" unit="بار" step={1} value={block.repeat}
                onChange={(v) => onChange({ repeat: v })} presets={presets.repeat} />
              <NumField label="مسافت" unit="متر" step={50} value={block.distance_m}
                onChange={(v) => onChange({ distance_m: v })} presets={presets.distance_m} />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <NumField label="استراحت بین تکرار" unit="ثانیه" step={15} value={block.rest_sec}
                onChange={(v) => onChange({ rest_sec: v })} presets={presets.rest_sec} />
              <TextField label="توضیحات (اختیاری)" value={block.description || ''}
                onChange={(v) => onChange({ description: v })}
                placeholder="بین‌کش با ریتم مسابقه" />
            </div>
          </>
        )}
        {block.kind === 'run' && (
          <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <NumField label="مسافت" unit="کیلومتر" step={0.5} value={block.distance_km}
                onChange={(v) => onChange({ distance_km: v })} presets={presets.distance_km} />
              <NumField label="زمان" unit="دقیقه" step={5} value={block.minutes}
                onChange={(v) => onChange({ minutes: v })} presets={presets.minutes} />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <TextField label="ریتم هدف" value={block.pace || ''}
                onChange={(v) => onChange({ pace: v })} placeholder="5:00" />
              <TextField label="توضیحات" value={block.description || ''}
                onChange={(v) => onChange({ description: v })} placeholder="استقامتی، در پارک…" />
            </div>
          </>
        )}
        {(block.kind === 'warmup' || block.kind === 'cooldown') && (
          <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <NumField label="مسافت" unit="کیلومتر" step={0.5} value={block.distance_km}
                onChange={(v) => onChange({ distance_km: v })} presets={presets.distance_km} />
              <NumField label="زمان" unit="دقیقه" step={5} value={block.minutes}
                onChange={(v) => onChange({ minutes: v })} />
            </div>
            <TextField label="توضیحات (اختیاری)" value={block.description || ''}
              onChange={(v) => onChange({ description: v })}
              placeholder={block.kind === 'warmup' ? 'دو سبک + حرکات کششی' : 'دو سبک + سردکردن'} />
          </>
        )}
        {block.kind === 'rest' && (
          <>
            <NumField label="مدت" unit="دقیقه" step={1} value={block.minutes}
              onChange={(v) => onChange({ minutes: v })} presets={presets.minutes} />
            <TextField label="توضیحات (اختیاری)" value={block.description || ''}
              onChange={(v) => onChange({ description: v })}
              placeholder="استراحت فعال، مثلاً پیاده‌روی" />
          </>
        )}
        {block.kind === 'note' && (
          <TextField label="یادداشت" value={block.description || ''}
            onChange={(v) => onChange({ description: v })}
            placeholder="مثلاً: قبل از تمرین کششی…" area />
        )}
      </div>
    </div>
  );
}

/* ============================== */
/*  Number Field with stepper + chips  */
/* ============================== */
function NumField({ label, unit, step, value, onChange, presets }: {
  label: string; unit: string; step: number;
  value?: number; onChange: (v: number | undefined) => void;
  presets?: number[];
}) {
  const show = value === undefined || value === null || Number.isNaN(value as any) ? '' : value;
  function bump(delta: number) {
    const cur = Number(value ?? 0);
    const nx = Math.max(0, Math.round((cur + delta) * 100) / 100);
    onChange(nx === 0 && delta < 0 ? undefined : nx);
  }
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <div className="flex items-stretch overflow-hidden rounded-xl border-[1.5px] border-input bg-card focus-within:border-primary focus-within:ring-4 focus-within:ring-accent transition-all">
        <button type="button" onClick={() => bump(-step)}
          className="flex w-10 items-center justify-center text-muted-foreground hover:bg-accent hover:text-primary transition-colors">
          <Minus className="size-4" />
        </button>
        <input
          type="number" min={0} step={step} value={show as any}
          onChange={(e) => {
            const v = e.target.value.trim();
            if (v === '') onChange(undefined);
            else onChange(Number(v));
          }}
          className="min-w-0 flex-1 bg-transparent text-center text-base font-semibold focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
        />
        <button type="button" onClick={() => bump(step)}
          className="flex w-10 items-center justify-center text-muted-foreground hover:bg-accent hover:text-primary transition-colors">
          <Plus className="size-4" />
        </button>
        <span className="flex items-center border-s border-border bg-secondary px-3 text-xs text-muted-foreground">
          {unit}
        </span>
      </div>
      {presets && presets.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-1">
          {presets.map((v) => (
            <button
              key={v} type="button"
              onClick={() => onChange(v)}
              className={cn(
                'rounded-full border px-3 py-1 text-xs font-semibold transition-all',
                Number(value) === v
                  ? 'bg-accent border-primary text-primary'
                  : 'bg-secondary border-border text-muted-foreground hover:border-primary hover:text-primary',
              )}
            >
              {faNum(v)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function TextField({ label, value, onChange, placeholder, area }: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; area?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {area
        ? <Textarea value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} rows={2} />
        : <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />}
    </div>
  );
}

/* ============================== */
/*  Submitted Panel               */
/* ============================== */
function SubmittedPanel({ session, onApprove, onReject }: {
  session: Session; onApprove: () => void; onReject: () => void;
}) {
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    if (session.student_photo_path) {
      signedPhotoUrl(supabase, session.student_photo_path).then((u) => { if (alive) setPhotoUrl(u); });
    }
    return () => { alive = false; };
  }, [session.student_photo_path]);
  return (
    <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 space-y-3">
      <div className="flex items-center gap-2 font-semibold text-sm text-amber-700 dark:text-amber-400">
        <Check className="size-4" />
        شاگرد این جلسه را انجام‌شده اعلام کرده
      </div>
      {session.student_note && (
        <div>
          <Label className="mb-1 block text-amber-700 dark:text-amber-400">یادداشت شاگرد</Label>
          <div className="rounded-xl bg-card border border-border px-3 py-2 text-sm">
            {session.student_note}
          </div>
        </div>
      )}
      {photoUrl && (
        <div>
          <Label className="mb-1 block text-amber-700 dark:text-amber-400">عکس شاگرد</Label>
          <a href={photoUrl} target="_blank" rel="noopener">
            <img src={photoUrl} alt="عکس تمرین" className="max-h-64 rounded-xl border border-border" />
          </a>
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={onApprove}>
          <Check className="size-4" />
          تأیید انجام
        </Button>
        <Button size="sm" variant="outline" onClick={onReject}>
          <X className="size-4" />
          رد
        </Button>
      </div>
    </div>
  );
}

/* ============================== */
/*  Small helpers                 */
/* ============================== */
function StatCard({ n, label, accent }: { n: number; label: string; accent?: boolean }) {
  return (
    <div className="flex min-w-[70px] flex-col items-center rounded-xl border bg-card px-3 py-2 shadow-sm">
      <span className={cn('text-lg font-extrabold leading-tight', accent && 'text-primary')}>
        {faNum(n)}
      </span>
      <span className="mt-0.5 text-[10px] text-muted-foreground">{label}</span>
    </div>
  );
}

function Avatar({ name, muted }: { name: string; muted?: boolean }) {
  const initial = ((name || '?').trim()[0] || '?').toUpperCase();
  return (
    <div className={cn(
      'flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-bold uppercase',
      muted
        ? 'bg-secondary text-muted-foreground'
        : 'bg-gradient-to-b from-brand-400 to-brand-600 text-white shadow-sm',
    )}>
      {initial}
    </div>
  );
}

function FullBleedLoader() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="size-8 animate-spin rounded-full border-2 border-border border-t-primary" />
    </div>
  );
}
