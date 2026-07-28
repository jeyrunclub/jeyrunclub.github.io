import { useEffect, useState } from 'react';
import { ChevronRight, ChevronLeft, Trophy } from 'lucide-react';
import { supabase } from '../../lib/supabase.js';
import { faNum, jalaliMonthRange } from '../../lib/plan.js';
import {
  JALALI_MONTHS, gregDateToJalali, jalaliPrevMonth, jalaliNextMonth,
} from '../../lib/jalali.js';
import { AppHeader } from './AppHeader';
import { Card } from '../ui/card';
import { Button } from '../ui/button';
import { cn } from '../../lib/utils';

type Row = {
  student_id: string;
  full_name: string | null;
  done_count: number;
  submitted_count: number;
  planned_count: number;
};

type Profile = { id: string; role: string; status: string; full_name: string | null };

export function LeaderboardPage() {
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [jy, setJy] = useState(1400);
  const [jm, setJm] = useState(1);
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { window.location.replace('/app/login'); return; }
      const { data: p } = await supabase.from('profiles').select('*').eq('id', session.user.id).single();
      if (!p) { setError('خطا در بارگذاری پروفایل'); setLoading(false); return; }
      if (p.status !== 'approved') { window.location.replace('/app/pending'); return; }
      setProfile(p as Profile);
      const j = gregDateToJalali(new Date());
      setJy(j.jy); setJm(j.jm);
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    if (!profile) return;
    (async () => {
      const { from, to } = jalaliMonthRange(jy, jm);
      const { data, error: err } = await supabase.rpc('leaderboard', { from_date: from, to_date: to });
      if (err) { setError(err.message); setRows([]); return; }
      setError(null);
      setRows((data as Row[]) || []);
    })();
  }, [profile, jy, jm]);

  function prevMonth() { const n = jalaliPrevMonth(jy, jm); setJy(n.jy); setJm(n.jm); }
  function nextMonth() { const n = jalaliNextMonth(jy, jm); setJy(n.jy); setJm(n.jm); }

  const anyDone = rows.some((r) => r.done_count > 0);

  return (
    <div className="min-h-screen">
      <AppHeader isCoach={profile?.role === 'coach'} />
      <main className="mx-auto flex max-w-5xl flex-col gap-5 px-5 pb-16 pt-6">
        {loading ? (
          <div className="flex justify-center py-16">
            <div className="size-10 animate-spin rounded-full border-4 border-secondary border-t-primary" />
          </div>
        ) : (
          <>
            <div>
              <h1 className="text-2xl font-extrabold tracking-tight">جدول قهرمانان</h1>
              <p className="mt-1.5 text-sm text-muted-foreground">
                شاگردانی که این ماه بیشترین جلسات تأییدشده را داشته‌اند.
              </p>
            </div>

            <Card className="flex items-center justify-between gap-2 p-2">
              {/* In RTL context, previous should appear on the right visually */}
              <Button variant="ghost" size="icon" onClick={nextMonth} aria-label="ماه بعد" className="rounded-full">
                <ChevronRight className="size-5" />
              </Button>
              <div className="flex flex-col items-center">
                <span className="text-lg font-bold leading-tight">{JALALI_MONTHS[jm - 1]}</span>
                <span className="mt-0.5 text-xs text-muted-foreground">{faNum(jy)}</span>
              </div>
              <Button variant="ghost" size="icon" onClick={prevMonth} aria-label="ماه قبل" className="rounded-full">
                <ChevronLeft className="size-5" />
              </Button>
            </Card>

            {error && (
              <div className="rounded-xl border border-destructive/25 bg-destructive/10 px-3.5 py-2.5 text-sm text-destructive">
                {error}
              </div>
            )}

            <Card className="overflow-hidden p-0">
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="border-b border-border bg-muted/50">
                      <th className="w-[74px] px-4 py-3.5 text-start text-xs font-semibold uppercase tracking-wide text-muted-foreground">رتبه</th>
                      <th className="px-4 py-3.5 text-start text-xs font-semibold uppercase tracking-wide text-muted-foreground">نام</th>
                      <th className="w-[110px] px-4 py-3.5 text-end text-xs font-semibold uppercase tracking-wide text-muted-foreground">تأییدشده</th>
                      <th className="hidden w-[110px] px-4 py-3.5 text-end text-xs font-semibold uppercase tracking-wide text-muted-foreground sm:table-cell">منتظر تأیید</th>
                      <th className="hidden w-[110px] px-4 py-3.5 text-end text-xs font-semibold uppercase tracking-wide text-muted-foreground sm:table-cell">کل</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => {
                      const pos = i + 1;
                      const total = r.done_count + r.submitted_count + r.planned_count;
                      const isMe = r.student_id === profile?.id;
                      const podium = r.done_count > 0 ? pos : 0;
                      return (
                        <tr
                          key={r.student_id}
                          className={cn(
                            'border-b border-border last:border-b-0 transition-colors hover:bg-accent',
                            isMe && 'bg-accent',
                          )}
                        >
                          <td className={cn('px-4 py-3 align-middle', isMe && 'border-s-[3px] border-s-primary')}>
                            <RankBadge pos={pos} podium={podium} />
                          </td>
                          <td className="px-4 py-3 align-middle">
                            <div className="flex min-w-0 items-center gap-3">
                              <Avatar name={r.full_name} muted={r.done_count === 0} />
                              <div className="min-w-0">
                                <div className="flex items-center gap-2 overflow-hidden">
                                  <span className="truncate text-sm font-semibold">{r.full_name || '—'}</span>
                                  {isMe && (
                                    <span className="shrink-0 rounded-full bg-primary/15 px-2 py-0.5 text-[0.65rem] font-bold text-primary">
                                      شما
                                    </span>
                                  )}
                                </div>
                                <div className="mt-0.5 text-[0.72rem] text-muted-foreground sm:hidden">
                                  {faNum(r.submitted_count)} منتظر · {faNum(total)} کل
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-end align-middle font-mono tabular-nums">
                            <span className="text-base font-extrabold text-primary">{faNum(r.done_count)}</span>
                          </td>
                          <td className="hidden px-4 py-3 text-end align-middle font-mono tabular-nums text-sm text-muted-foreground sm:table-cell">
                            {faNum(r.submitted_count)}
                          </td>
                          <td className="hidden px-4 py-3 text-end align-middle font-mono tabular-nums text-sm text-muted-foreground sm:table-cell">
                            {faNum(total)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>

            {!anyDone && (
              <Card className="flex flex-col items-center gap-3 p-10 text-center text-muted-foreground">
                <Trophy className="size-10 text-muted-foreground/60" />
                <h3 className="text-base font-bold text-foreground">هنوز جلسه‌ای تأیید نشده</h3>
                <p className="text-sm">وقتی سالار جلسات این ماه را تأیید کند، اینجا نمایش داده می‌شود.</p>
              </Card>
            )}
          </>
        )}
      </main>
    </div>
  );
}

function RankBadge({ pos, podium }: { pos: number; podium: number }) {
  const base = 'inline-flex size-9 items-center justify-center rounded-xl text-sm font-extrabold';
  if (podium === 1) {
    return <span className={cn(base, 'bg-gradient-to-b from-amber-300 to-amber-500 text-amber-900 shadow-lg shadow-amber-500/25')}>{faNum(pos)}</span>;
  }
  if (podium === 2) {
    return <span className={cn(base, 'bg-gradient-to-b from-slate-200 to-slate-400 text-slate-900 shadow-lg shadow-slate-400/25')}>{faNum(pos)}</span>;
  }
  if (podium === 3) {
    return <span className={cn(base, 'bg-gradient-to-b from-orange-300 to-orange-600 text-white shadow-lg shadow-orange-500/25')}>{faNum(pos)}</span>;
  }
  return <span className={cn(base, 'border border-border bg-muted text-muted-foreground')}>{faNum(pos)}</span>;
}

function Avatar({ name, muted }: { name: string | null; muted: boolean }) {
  const letter = ((name ?? '?').trim()[0] || '?').toUpperCase();
  return (
    <div
      className={cn(
        'flex size-10 shrink-0 items-center justify-center rounded-full text-base font-bold uppercase shadow-sm',
        muted
          ? 'bg-muted text-muted-foreground'
          : 'bg-gradient-to-b from-brand-400 to-brand-600 text-white',
      )}
    >
      {letter}
    </div>
  );
}
