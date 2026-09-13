// The club board, for students and the coach alike.
//
// Two orderings, because they measure different things: how many sessions
// someone has actually ticked off, and how fast their 10k is. Consistency and
// speed aren't the same virtue, and the club has both kinds of runner.
//
// The rows come from the leaderboard() function rather than a table read — a
// student can only select their own day_logs, so the counting has to happen
// server-side in a security-definer function.

import { useEffect, useMemo, useState } from 'react';
import { Flame, Timer, Trophy, ChevronLeft } from 'lucide-react';
import { supabase } from '../../lib/supabase.js';
import { fetchLeaderboard, prSeconds, faNum } from '../../lib/plan.js';
import { getProfile } from '../../lib/session.js';
import { swr } from '../../lib/cache.js';
import { AppHeader } from './AppHeader';
import { Avatar, AvatarPicker } from './Avatar';
import { Card } from '../ui/card';
import { cn } from '../../lib/utils';

type Row = {
  id: string;
  full_name: string | null;
  avatar_path: string | null;
  pr_10k: string | null;
  done_total: number;
  done_week: number;
};

type Mode = 'sessions' | 'pr';

// Gold, silver, bronze — the only place the palette bends, because a podium
// reads wrong in any other colours.
const MEDALS = [
  'bg-[#eda600] text-white',
  'bg-[#b9b3a6] text-white',
  'bg-[#b5713a] text-white',
];

export function LeaderboardPage() {
  const [loading, setLoading] = useState(true);
  const [me, setMe] = useState<{ id: string; full_name: string | null; avatar_path: string | null } | null>(null);
  const [isCoach, setIsCoach] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [mode, setMode] = useState<Mode>('sessions');

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { window.location.replace('/app/login'); return; }

      // Both of these need only the session, and waiting for the profile
      // before asking for the board made every visit cost two round trips
      // instead of one. On a slow connection that is the whole delay.
      const [p, r] = await Promise.all([
        getProfile(supabase, session.user.id),
        swr('leaderboard', async () => (await fetchLeaderboard(supabase)).rows,
            { maxAge: 30000, onFresh: (rows: any) => setRows(rows) }),
      ]);

      if (!p) { setLoading(false); return; }
      if (p.role !== 'coach' && p.status !== 'approved') {
        window.location.replace('/app/pending');
        return;
      }
      setMe({ id: p.id, full_name: p.full_name, avatar_path: p.avatar_path ?? null });
      setIsCoach(p.role === 'coach');
      setRows(r);
      setLoading(false);
    })();
  }, []);

  const ordered = useMemo(() => {
    if (mode === 'sessions') return rows; // already ordered by the function
    // Fastest first; anyone without a readable time goes to the bottom.
    return [...rows].sort((a, b) => {
      const x = prSeconds(a.pr_10k);
      const y = prSeconds(b.pr_10k);
      if (x === null && y === null) return 0;
      if (x === null) return 1;
      if (y === null) return -1;
      return x - y;
    });
  }, [rows, mode]);

  // Only rows that actually carry the measure get a rank number.
  const ranked = useMemo(() => {
    let n = 0;
    return ordered.map((r) => {
      const counts = mode === 'sessions' ? r.done_total > 0 : prSeconds(r.pr_10k) !== null;
      return { row: r, rank: counts ? ++n : null };
    });
  }, [ordered, mode]);

  if (loading) {
    return (
      <div className="min-h-screen">
        <AppHeader isCoach={isCoach} />
        <main className="mx-auto flex max-w-2xl flex-col gap-4 px-5 pb-28 pt-6 sm:pb-16">
          <div className="h-28 animate-pulse rounded-3xl bg-muted" />
          <div className="h-96 animate-pulse rounded-2xl bg-muted" />
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <AppHeader isCoach={isCoach} />
      <main className="mx-auto flex max-w-2xl flex-col gap-5 px-5 pb-20 pt-6">
        <section className="rise nib relative overflow-hidden bg-gradient-to-bl from-brand-500 via-brand-500 to-brand-700 p-6 text-white shadow-lg shadow-brand-600/25">
          <span aria-hidden className="strokes pointer-events-none absolute inset-0" />
          <div className="relative">
            <h1 className="display mt-1 text-3xl">قهرمان‌های جیران</h1>
            <p className="mt-1 text-sm text-white/85">
              {mode === 'sessions'
                ? 'بر اساس تعداد تمرین‌هایی که ثبت شده.'
                : 'بر اساس رکورد ۱۰ کیلومتر.'}
            </p>
          </div>
        </section>

        {/* The record days live next to the record board — and this is the
            one permanent way into them, since an event is temporary and the
            bottom bar has no room for it. */}
        <a
          href="/app/event"
          data-astro-prefetch="tap"
          className="nib group flex items-center gap-3 border border-border bg-card p-4 shadow-sm transition-colors hover:bg-accent/40"
        >
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/12 text-primary">
            <Trophy className="size-5" />
          </span>
          <span className="min-w-0 flex-1">
            <b className="block text-sm">رکوردگیری‌ها</b>
            <span className="mt-0.5 block text-xs text-muted-foreground">
              روزهای رکورد، هدف‌ها و نتیجه‌ها
            </span>
          </span>
          <ChevronLeft className="size-5 shrink-0 text-muted-foreground transition-transform group-hover:-translate-x-0.5" />
        </a>

        {/* Your own picture — the board is dull without faces */}
        {me && (
          <Card className="p-4">
            <AvatarPicker
              userId={me.id}
              name={me.full_name}
              path={me.avatar_path}
              onChange={(avatar_path) => {
                setMe((m) => (m ? { ...m, avatar_path } : m));
                setRows((rs) => rs.map((r) => (r.id === me.id ? { ...r, avatar_path } : r)));
              }}
            />
          </Card>
        )}

        {/* Mode switch */}
        <div className="flex gap-1 self-center rounded-full border border-border bg-card p-1 shadow-sm">
          {([['sessions', 'تمرین‌ها', Flame], ['pr', 'رکورد ۱۰k', Timer]] as const).map(
            ([v, label, I]) => (
              <button
                key={v}
                type="button"
                onClick={() => setMode(v)}
                className={cn(
                  'nib-pill inline-flex items-center gap-1.5 px-5 py-1.5 text-sm font-bold transition-all',
                  mode === v
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <I className="size-4" />
                {label}
              </button>
            ),
          )}
        </div>

        {ranked.length === 0 ? (
          <Card className="flex flex-col items-center gap-3 p-12 text-center text-muted-foreground">
            <Trophy className="size-10 text-muted-foreground/50" />
            <h3 className="display text-xl text-foreground">هنوز کسی امتیازی ندارد</h3>
            <p className="text-sm">وقتی شاگردها تمرین‌هایشان را ثبت کنند، اینجا پر می‌شود.</p>
          </Card>
        ) : (
          <Card className="rise divide-y divide-border p-2">
            {ranked.map(({ row, rank }) => {
              const isMe = me?.id === row.id;
              const medal = rank !== null && rank <= 3 ? MEDALS[rank - 1] : null;
              return (
                <div
                  key={row.id}
                  className={cn(
                    'flex items-center gap-3 rounded-xl px-3 py-3 transition-colors',
                    isMe && 'bg-accent/60',
                  )}
                >
                  <span className={cn(
                    'figures flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-extrabold tabular-nums',
                    medal || 'bg-secondary text-muted-foreground',
                  )}>
                    {rank === null ? '—' : faNum(rank)}
                  </span>

                  <Avatar name={row.full_name} path={row.avatar_path} size={42} />

                  <div className="min-w-0 flex-1">
                    {/* The name truncates, the chip never does: inside the
                        truncating span a long name pushed «تو» under the
                        ellipsis and left half a letter showing. No gap before
                        it — the chip's own padding is the only separation. */}
                    <div className="flex min-w-0 items-center text-sm font-bold">
                      <span className="truncate">{row.full_name || '(بدون نام)'}</span>
                      {isMe && (
                        <span className="shrink-0 rounded-full bg-primary/12 px-1.5 py-0.5 text-[0.65rem] font-bold text-primary">
                          تو
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      {mode === 'sessions'
                        ? row.done_week > 0
                          ? `${faNum(row.done_week)} تمرین در ۷ روز گذشته`
                          : 'این هفته هنوز تمرینی ثبت نشده'
                        : row.done_total > 0
                          ? `${faNum(row.done_total)} تمرین ثبت‌شده`
                          : 'بدون تمرین ثبت‌شده'}
                    </div>
                  </div>

                  {mode === 'sessions' ? (
                    <span className="figures shrink-0 text-xl font-extrabold tabular-nums">
                      {faNum(row.done_total)}
                    </span>
                  ) : (
                    <span
                      dir="ltr"
                      className={cn(
                        'figures shrink-0 text-xl font-extrabold tabular-nums',
                        !row.pr_10k && 'text-muted-foreground/40',
                      )}
                    >
                      {row.pr_10k || '—'}
                    </span>
                  )}
                </div>
              );
            })}
          </Card>
        )}

        <p className="text-center text-xs text-muted-foreground">
          {mode === 'sessions'
            ? 'هر روزی که در برنامه‌ات «انجام شد» بزنی، یک تمرین به حساب تو اضافه می‌شود.'
            : 'رکوردت را در صفحه‌ی برنامه‌ات ثبت کن تا اینجا دیده شود.'}
        </p>
      </main>
    </div>
  );
}
