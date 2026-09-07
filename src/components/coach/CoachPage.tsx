import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Check } from 'lucide-react';
import { supabase } from '../../lib/supabase.js';
import {
  addDays, thisWeekStart, weekLabel, weekRelativeLabel,
  faNum, fetchWeekTextForStudents, loadWeekText, saveWeekText,
} from '../../lib/plan.js';
import { AppHeader } from '../app/AppHeader';
import { PlanText } from '../app/PlanText';
import { Card } from '../ui/card';
import { Button } from '../ui/button';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import { Badge } from '../ui/badge';
import { cn } from '../../lib/utils';

type Profile = {
  id: string; full_name: string | null; phone: string | null;
  role: 'coach' | 'student'; status: 'pending' | 'approved' | 'rejected';
  email?: string;
};

export function CoachPage() {
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [allUsers, setAllUsers] = useState<Profile[]>([]);
  const [currentStudentId, setCurrentStudentId] = useState<string | null>(null);
  const [weekStart, setWeekStart] = useState(() => thisWeekStart());
  const [textByStudent, setTextByStudent] = useState<Record<string, string>>({});
  const [draft, setDraft] = useState('');
  const [baseline, setBaseline] = useState('');
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(0);
  const [error, setError] = useState<string | null>(null);

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
      const { data: p } = await supabase.from('profiles').select('*').eq('id', session.user.id).single();
      if (!p || p.role !== 'coach') { setDenied(true); setLoading(false); return; }
      setProfile(p);
      await refreshUsers();
      setLoading(false);
    })();
  }, [refreshUsers]);

  // Load every student's text for the shown week
  const refreshWeek = useCallback(async () => {
    const byStudent = await fetchWeekTextForStudents(supabase, weekStart);
    setTextByStudent(byStudent);
    return byStudent;
  }, [weekStart]);

  useEffect(() => { if (profile) refreshWeek(); }, [profile, refreshWeek]);

  // Load the draft fresh whenever the student or week changes
  useEffect(() => {
    setSavedAt(0);
    setError(null);
    if (!currentStudentId) { setDraft(''); setBaseline(''); return; }
    let alive = true;
    loadWeekText(supabase, currentStudentId, weekStart).then((t) => {
      if (!alive) return;
      setDraft(t);
      setBaseline(t);
    });
    return () => { alive = false; };
  }, [currentStudentId, weekStart]);

  const students = useMemo(
    () => allUsers.filter((u) => u.status === 'approved' && u.role !== 'coach'),
    [allUsers],
  );
  const pendingUsers = useMemo(
    () => allUsers.filter((u) => u.status === 'pending'),
    [allUsers],
  );
  const currentStudent = students.find((s) => s.id === currentStudentId) || null;
  const writtenCount = students.filter((s) => (textByStudent[s.id] || '').trim()).length;
  const dirty = draft.trim() !== baseline.trim();

  async function approveOrReject(id: string, status: 'approved' | 'rejected') {
    const { error: err } = await supabase.rpc('set_profile_status',
      { target: id, new_status: status, new_role: null });
    if (err) { setError(err.message); return; }
    await refreshUsers();
  }

  async function save() {
    if (!currentStudentId || !profile) return;
    setSaving(true);
    setError(null);
    const { error: err } = await saveWeekText(
      supabase, currentStudentId, weekStart, draft, profile.id,
    );
    setSaving(false);
    if (err) { setError('خطا در ذخیره: ' + err.message); return; }
    setBaseline(draft.trim());
    setTextByStudent((prev) => ({ ...prev, [currentStudentId]: draft.trim() }));
    setSavedAt(Date.now());
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
        <h2 className="text-xl font-bold">دسترسی ندارد</h2>
        <p className="mt-2 text-muted-foreground">این صفحه فقط برای مربی است.</p>
      </main>
    </div>
  );

  return (
    <div className="min-h-screen">
      <AppHeader isCoach />
      <main className="mx-auto max-w-3xl space-y-5 px-5 py-8 pb-20">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight">پنل مربی</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {profile?.full_name ? `سلام ${profile.full_name}` : 'خوش آمدی'}
            </p>
          </div>
          <div className="flex gap-2">
            {pendingUsers.length > 0 && <StatCard n={pendingUsers.length} label="درخواست" accent />}
            <StatCard n={writtenCount} label="برنامه‌ی این هفته" />
            <StatCard n={students.length} label="شاگرد" />
          </div>
        </div>

        {/* PENDING APPROVALS */}
        {pendingUsers.length > 0 && (
          <Card className="p-5">
            <h2 className="mb-3 text-base font-bold">درخواست‌های در انتظار</h2>
            <div className="divide-y divide-border">
              {pendingUsers.map((u) => (
                <div key={u.id} className="flex items-center gap-3 py-3">
                  <Avatar name={u.full_name || u.email || '?'} />
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
          >
            <ChevronLeft className="size-5" />
          </Button>
        </Card>

        {/* STUDENT PICKER */}
        <Card className="p-4">
          <Label className="mb-2 block">شاگرد</Label>
          {students.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              هنوز شاگردی تأیید نشده.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {students.map((s) => {
                const has = !!(textByStudent[s.id] || '').trim();
                const active = s.id === currentStudentId;
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setCurrentStudentId(s.id)}
                    className={cn(
                      'flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors',
                      active
                        ? 'border-primary bg-accent text-primary'
                        : 'border-border text-muted-foreground hover:bg-accent hover:text-foreground',
                    )}
                  >
                    {has && <Check className="size-3.5 text-emerald-600" />}
                    {s.full_name || s.email || '—'}
                  </button>
                );
              })}
            </div>
          )}
        </Card>

        {/* PLAN TEXT EDITOR */}
        {currentStudent && (
          <Card className="space-y-3 p-5">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-bold">
                برنامه‌ی {currentStudent.full_name || currentStudent.email}
              </h2>
              <span className="text-xs text-muted-foreground">{weekLabel(weekStart)}</span>
              {dirty && <Badge variant="warning" className="ms-auto">ذخیره نشده</Badge>}
              {!dirty && savedAt > 0 && (
                <Badge className="ms-auto bg-emerald-500/15 text-emerald-700">ذخیره شد</Badge>
              )}
            </div>

            <Textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={16}
              dir="auto"
              placeholder={'دوشنبه\n5k recovery pace 6:30\n\nسه‌شنبه اینتروال\n2k Wu\n…'}
              className="font-mono text-sm leading-7"
            />

            {error && (
              <div className="rounded-xl border border-destructive/25 bg-destructive/10 px-3.5 py-2.5 text-sm text-destructive">
                {error}
              </div>
            )}

            <div className="flex items-center gap-2">
              <p className="text-xs text-muted-foreground">
                هر خط همان‌طور که بنویسی به شاگرد نشان داده می‌شود.
              </p>
              <Button onClick={save} disabled={saving || !dirty} className="ms-auto">
                <Check className="size-4" />
                {saving ? 'در حال ذخیره…' : 'ذخیره'}
              </Button>
            </div>

            {draft.trim() && (
              <div className="border-t border-border pt-4">
                <Label className="mb-2 block">پیش‌نمایش</Label>
                <div className="rounded-xl border border-border bg-secondary/50 p-4">
                  <PlanText text={draft} />
                </div>
              </div>
            )}
          </Card>
        )}

        {/* ALL USERS */}
        <Card className="p-5">
          <h2 className="mb-3 text-base font-bold">همه‌ی شاگردان</h2>
          {allUsers.filter((u) => u.status !== 'pending').length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">هنوز شاگردی نیست.</p>
          ) : (
            <div className="divide-y divide-border">
              {allUsers.filter((u) => u.status !== 'pending').map((r) => {
                const isCoachRow = r.role === 'coach';
                return (
                  <div key={r.id} className="flex items-center gap-3 py-3">
                    <Avatar name={r.full_name || r.email || '?'} muted={isCoachRow} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="truncate text-sm font-semibold">{r.full_name || '(بدون نام)'}</span>
                        {isCoachRow && <Badge variant="destructive" className="bg-primary/15 text-primary">مربی</Badge>}
                        {r.status === 'rejected' && <Badge variant="destructive">رد شده</Badge>}
                      </div>
                      <div className="mt-0.5 truncate text-xs text-muted-foreground" dir="ltr">
                        {r.email}{r.phone ? ' · ' + r.phone : ''}
                      </div>
                    </div>
                    {!isCoachRow && r.status === 'approved' && (
                      <Button variant="outline" size="sm" onClick={() => {
                        setCurrentStudentId(r.id);
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                      }}>
                        نوشتن برنامه
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </main>
    </div>
  );
}

function StatCard({ n, label, accent }: { n: number; label: string; accent?: boolean }) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-border bg-card px-4 py-2 shadow-sm">
      <span className={cn('font-mono text-lg font-extrabold tabular-nums', accent && 'text-primary')}>
        {faNum(n)}
      </span>
      <span className="text-[0.68rem] font-medium text-muted-foreground">{label}</span>
    </div>
  );
}

function Avatar({ name, muted }: { name: string; muted?: boolean }) {
  return (
    <div className={cn(
      'flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-bold',
      muted ? 'bg-muted text-muted-foreground' : 'bg-accent text-primary',
    )}>
      {name.trim().charAt(0) || '?'}
    </div>
  );
}
