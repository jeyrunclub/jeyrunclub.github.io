// رکوردگیری — the record day, before and after.
//
// Before it: the date, a distance, and a target named out loud while it is
// still a promise. After it: what everyone actually ran, next to what they
// held and what they said they would do. Ranked by improvement rather than by
// finishing time, because a table sorted by time crowns the same three people
// every event, and this day is meant to be about each runner against their
// own past.

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Timer, MapPin, CalendarDays, Trophy, Target, Check, Loader2, Plus, Trash2, Pencil, X,
} from 'lucide-react';
import { supabase } from '../../lib/supabase.js';
import { getProfile } from '../../lib/session.js';
import { faNum, faDateLong } from '../../lib/plan.js';
import {
  COMMON_DISTANCES, distanceLabel, secs, fromSecs, paceOf, daysUntil, countdownLabel,
  fetchEvents, currentEvent, fetchBoard, fetchMyRecords,
  saveEntry, saveResult, createEvent, updateEvent, deleteEvent,
  byDistance, totalImprovement,
} from '../../lib/events.js';
import { createPost } from '../../lib/feed.js';
import { AppHeader } from './AppHeader';
import { Avatar } from './Avatar';
import { Card } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { cn } from '../../lib/utils';

type Ev = {
  id: string; title: string; event_date: string; start_time: string | null;
  place: string | null; distances: number[]; status: string;
};
type Row = {
  student_id: string; full_name: string | null; avatar_path: string | null;
  distance_m: number; prior_time: string | null; target_time: string | null;
  result_time: string | null; note: string | null;
  improvement_s: number | null; hit_target: boolean | null; is_pr: boolean | null;
};

// Minutes and seconds as two plain numbers — no keyboard has to make a colon,
// and a half marathon's minutes go past ninety.
function TimeFields({ value, onChange, label }: {
  value: string; onChange: (v: string) => void; label: string;
}) {
  const total = secs(value);
  const mm = total === null ? '' : String(Math.floor(total / 60));
  const ss = total === null ? '' : String(total % 60).padStart(2, '0');
  const set = (m: string, s: string) => {
    if (!m && !s) { onChange(''); return; }
    onChange(`${Number(m || 0)}:${String(Math.min(59, Number(s || 0))).padStart(2, '0')}`);
  };
  return (
    <div>
      <Label className="mb-1.5 block">{label}</Label>
      <div className="flex items-center gap-1.5">
        <Input
          value={mm} onChange={(e) => set(e.target.value.replace(/\D/g, '').slice(0, 3), ss)}
          dir="ltr" inputMode="numeric" placeholder="46" aria-label="دقیقه"
          className="figures w-16 text-center"
        />
        <span className="figures text-lg font-bold text-muted-foreground">:</span>
        <Input
          value={ss} onChange={(e) => set(mm, e.target.value.replace(/\D/g, '').slice(0, 2))}
          dir="ltr" inputMode="numeric" placeholder="20" aria-label="ثانیه"
          className="figures w-16 text-center"
        />
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[0.62rem] font-semibold text-muted-foreground">{label}</div>
      <div dir="ltr" className={cn('figures text-right text-sm font-extrabold', tone)}>
        {value || '—'}
      </div>
    </div>
  );
}

export function EventPage() {
  const [loading, setLoading] = useState(true);
  const [me, setMe] = useState<{ id: string; full_name: string | null } | null>(null);
  const [isCoach, setIsCoach] = useState(false);
  const [events, setEvents] = useState<Ev[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [records, setRecords] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [distance, setDistance] = useState<number | null>(null);
  const [target, setTarget] = useState('');
  const [result, setResult] = useState('');
  const [editing, setEditing] = useState<Ev | null>(null);
  const [creating, setCreating] = useState(false);

  const ev = events.find((e) => e.id === activeId) || null;
  const mine = rows.find((r) => r.student_id === me?.id) || null;
  const before = ev ? daysUntil(ev.event_date) >= 0 : false;

  const refresh = useCallback(async (keep?: string) => {
    const list = await fetchEvents(supabase) as Ev[];
    setEvents(list);
    const pick = keep && list.find((e) => e.id === keep) ? keep : currentEvent(list)?.id || null;
    setActiveId(pick);
    return pick;
  }, []);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { window.location.replace('/app/login'); return; }
      const p = await getProfile(supabase, session.user.id);
      if (!p) { setLoading(false); return; }
      if (p.role !== 'coach' && p.status !== 'approved') {
        window.location.replace('/app/pending'); return;
      }
      setMe({ id: p.id, full_name: p.full_name });
      setIsCoach(p.role === 'coach');
      const [, recs] = await Promise.all([refresh(), fetchMyRecords(supabase)]);
      setRecords(recs);
      setLoading(false);
    })();
  }, [refresh]);

  useEffect(() => {
    if (!activeId) { setRows([]); return; }
    let alive = true;
    fetchBoard(supabase, activeId).then((r) => { if (alive) setRows(r as Row[]); });
    return () => { alive = false; };
  }, [activeId]);

  // Seed the form from whatever this runner already said.
  useEffect(() => {
    setError(null);
    setDistance(mine?.distance_m ?? null);
    setTarget(mine?.target_time || '');
    setResult(mine?.result_time || '');
  }, [mine?.distance_m, mine?.target_time, mine?.result_time, activeId]);

  async function reloadBoard() {
    if (activeId) setRows(await fetchBoard(supabase, activeId) as Row[]);
    setRecords(await fetchMyRecords(supabase));
  }

  async function submitEntry() {
    if (!ev || !distance) { setError('اول مسافت را انتخاب کن.'); return; }
    setBusy(true); setError(null);
    const { error: err } = await saveEntry(supabase, ev.id, distance, target);
    setBusy(false);
    if (err) { setError(err.message); return; }
    await reloadBoard();
  }

  async function submitResult() {
    if (!ev || !me) return;
    if (!mine) { setError('اول مسافت و هدفت را ثبت کن.'); return; }
    setBusy(true); setError(null);
    const { error: err } = await saveResult(supabase, ev.id, me.id, result);
    setBusy(false);
    if (err) { setError(err.message); return; }
    await reloadBoard();
  }

  if (loading) {
    return (
      <div className="min-h-screen">
        <AppHeader isCoach={isCoach} />
        <main className="mx-auto flex max-w-2xl flex-col gap-5 px-5 pb-28 pt-6 sm:pb-20">
          <div className="h-28 animate-pulse rounded-3xl bg-muted" />
          <div className="h-64 animate-pulse rounded-2xl bg-muted" />
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <AppHeader isCoach={isCoach} />
      <main className="mx-auto flex max-w-2xl flex-col gap-5 px-5 pb-28 pt-6 sm:pb-20">

        {isCoach && (
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={() => { setCreating(true); setEditing(null); }}>
              <Plus className="size-4" />
              رکوردگیری تازه
            </Button>
            {ev && (
              <>
                <Button variant="outline" size="sm" onClick={() => { setEditing(ev); setCreating(false); }}>
                  <Pencil className="size-4" />
                  ویرایش
                </Button>
                <Button
                  variant="ghost" size="sm"
                  className="text-muted-foreground hover:text-destructive"
                  onClick={async () => {
                    if (!window.confirm('این رویداد و همه‌ی ثبت‌نام‌هایش حذف شود؟')) return;
                    await deleteEvent(supabase, ev.id);
                    await refresh();
                  }}
                >
                  <Trash2 className="size-4" />
                  حذف
                </Button>
              </>
            )}
          </div>
        )}

        {(creating || editing) && me && (
          <EventForm
            initial={editing}
            coachId={me.id}
            onClose={() => { setCreating(false); setEditing(null); }}
            onSaved={async (id) => { setCreating(false); setEditing(null); await refresh(id); }}
          />
        )}

        {!ev ? (
          <Card className="flex flex-col items-center gap-3 p-12 text-center text-muted-foreground">
            <Trophy className="size-10 text-muted-foreground/50" />
            <h2 className="display text-xl text-foreground">رکوردگیری‌ای ثبت نشده</h2>
            <p className="text-sm">وقتی سالار روزی را اعلام کند، همین‌جا می‌بینی.</p>
          </Card>
        ) : (
          <>
            {/* HERO */}
            <section className="rise nib relative overflow-hidden bg-gradient-to-bl from-brand-500 via-brand-500 to-brand-700 p-6 text-white shadow-lg shadow-brand-600/25">
              <span aria-hidden className="strokes pointer-events-none absolute inset-0" />
              <div className="relative">
                <p className="text-xs font-semibold text-white/75">رکوردگیری</p>
                <h1 className="display mt-1 text-3xl">{ev.title}</h1>
                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-white/85">
                  <span className="inline-flex items-center gap-1.5">
                    <CalendarDays className="size-4" />
                    {faDateLong(ev.event_date)}
                  </span>
                  {ev.start_time && (
                    <span className="figures inline-flex items-center gap-1.5">
                      <Timer className="size-4" />
                      {ev.start_time}
                    </span>
                  )}
                  {ev.place && (
                    <span className="inline-flex items-center gap-1.5">
                      <MapPin className="size-4" />
                      {ev.place}
                    </span>
                  )}
                </div>
                <div className="nib-pill mt-4 inline-block bg-white px-4 py-1.5 text-sm font-extrabold text-brand-600">
                  {countdownLabel(ev.event_date)}
                </div>
              </div>
            </section>

            {events.length > 1 && (
              <div className="no-scrollbar -mx-5 flex gap-2 overflow-x-auto px-5">
                {events.map((e) => (
                  <button
                    key={e.id}
                    type="button"
                    onClick={() => setActiveId(e.id)}
                    className={cn(
                      'nib-pill shrink-0 border px-3 py-1.5 text-xs font-bold transition-colors',
                      e.id === activeId
                        ? 'border-primary bg-accent text-primary'
                        : 'border-border text-muted-foreground hover:bg-secondary',
                    )}
                  >
                    {e.title}
                  </button>
                ))}
              </div>
            )}

            {error && (
              <p className="rounded-xl border border-destructive/25 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                {error}
              </p>
            )}

            {/* MINE */}
            {!isCoach && (
              <Card className="p-5">
                <div className="mb-3 flex items-center gap-2">
                  <Target className="size-4 text-primary" />
                  <h2 className="display text-xl">{before ? 'هدف تو' : 'نتیجه‌ی تو'}</h2>
                </div>

                <Label className="mb-2 block">مسافت</Label>
                <div className="flex flex-wrap gap-2">
                  {(ev.distances?.length ? ev.distances : COMMON_DISTANCES).map((d) => (
                    <button
                      key={d}
                      type="button"
                      disabled={!before}
                      onClick={() => setDistance(d)}
                      className={cn(
                        'nib-pill border px-3.5 py-1.5 text-sm font-bold transition-colors disabled:opacity-60',
                        distance === d
                          ? 'border-primary bg-accent text-primary'
                          : 'border-border text-muted-foreground enabled:hover:bg-secondary',
                      )}
                    >
                      {distanceLabel(d)}
                    </button>
                  ))}
                </div>

                {distance && (
                  <p className="figures mt-2 text-xs text-muted-foreground">
                    رکورد فعلی‌ات در این مسافت: <b dir="ltr">{records[distance] || '—'}</b>
                  </p>
                )}

                {before ? (
                  <div className="mt-4 flex flex-wrap items-end gap-3">
                    <TimeFields value={target} onChange={setTarget} label="زمان هدف" />
                    {distance && secs(target) !== null && (
                      <div className="pb-2">
                        <div className="text-[0.62rem] font-semibold text-muted-foreground">سرعت لازم</div>
                        <div dir="ltr" className="figures text-sm font-extrabold">
                          {paceOf(target, distance)} <span className="text-muted-foreground">/km</span>
                        </div>
                      </div>
                    )}
                    <Button onClick={submitEntry} disabled={busy || !distance} className="ms-auto">
                      {busy ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
                      ثبت هدف
                    </Button>
                  </div>
                ) : (
                  <div className="mt-4 flex flex-wrap items-end gap-3">
                    <TimeFields value={result} onChange={setResult} label="چه زمانی زدی؟" />
                    {distance && secs(result) !== null && (
                      <div className="pb-2">
                        <div className="text-[0.62rem] font-semibold text-muted-foreground">سرعت</div>
                        <div dir="ltr" className="figures text-sm font-extrabold">
                          {paceOf(result, distance)} <span className="text-muted-foreground">/km</span>
                        </div>
                      </div>
                    )}
                    <Button onClick={submitResult} disabled={busy || secs(result) === null} className="ms-auto">
                      {busy ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
                      ثبت نتیجه
                    </Button>
                  </div>
                )}

                {mine?.target_time && before && (
                  <p className="mt-3 text-xs text-muted-foreground">
                    ثبت شد: <b dir="ltr" className="figures">{mine.target_time}</b> در {distanceLabel(mine.distance_m)}
                  </p>
                )}
              </Card>
            )}

            <Board rows={rows} before={before} isCoach={isCoach} eventId={ev.id} onSaved={reloadBoard} />
          </>
        )}
      </main>
    </div>
  );
}

// The list: before the day it is who is in and what they promised; after it,
// the ceremony.
function Board({ rows, before, isCoach, eventId, onSaved }: {
  rows: Row[]; before: boolean; isCoach: boolean; eventId: string; onSaved: () => void;
}) {
  const groups = useMemo(() => byDistance(rows), [rows]);
  const total = totalImprovement(rows);

  if (!rows.length) {
    return (
      <Card className="p-8 text-center text-sm text-muted-foreground">
        هنوز کسی ثبت‌نام نکرده.
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {!before && total > 0 && (
        <Card className="flex items-center gap-3 border-primary/30 bg-accent/40 p-4">
          <Trophy className="size-5 shrink-0 text-primary" />
          <div>
            <div className="figures text-xl font-extrabold leading-none">{fromSecs(total)}</div>
            <div className="mt-1 text-xs font-semibold text-muted-foreground">
              مجموع پیشرفت تیم در این روز
            </div>
          </div>
        </Card>
      )}

      {groups.map(([dist, list]) => (
        <Card key={dist} className="overflow-hidden">
          <div className="flex items-center gap-2 border-b border-border px-5 py-3">
            <h3 className="display text-lg">{distanceLabel(dist)}</h3>
            <span className="figures text-xs text-muted-foreground">{faNum(list.length)} نفر</span>
          </div>
          <div className="divide-y divide-border">
            {list.map((r, i) => (
              <div key={r.student_id} className="px-5 py-3.5">
                <div className="flex items-center gap-3">
                  {!before && (
                    <span className="figures w-5 shrink-0 text-sm font-extrabold text-muted-foreground">
                      {r.improvement_s !== null ? faNum(i + 1) : '—'}
                    </span>
                  )}
                  <Avatar name={r.full_name} path={r.avatar_path} size={36} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-bold">{r.full_name || '(بدون نام)'}</div>
                    <div className="mt-0.5 flex flex-wrap gap-1.5">
                      {r.is_pr && (
                        <span className="rounded-full bg-primary/12 px-1.5 py-0.5 text-[0.6rem] font-bold text-primary">
                          رکورد شخصی جدید
                        </span>
                      )}
                      {r.hit_target && (
                        <span className="rounded-full bg-easy/15 px-1.5 py-0.5 text-[0.6rem] font-bold text-easy">
                          به هدف رسید
                        </span>
                      )}
                      {before && r.target_time && (
                        <span className="figures text-[0.68rem] text-muted-foreground">
                          هدف <b dir="ltr">{r.target_time}</b>
                        </span>
                      )}
                    </div>
                  </div>

                  {!before && (
                    <div className="grid shrink-0 grid-cols-4 gap-3 text-right">
                      <Stat label="قبلی" value={r.prior_time || ''} tone="text-muted-foreground" />
                      <Stat label="هدف" value={r.target_time || ''} tone="text-muted-foreground" />
                      <Stat label="نتیجه" value={r.result_time || ''} />
                      <Stat
                        label="اختلاف"
                        value={r.improvement_s === null ? '' :
                          (r.improvement_s > 0 ? '−' : '+') + fromSecs(Math.abs(r.improvement_s))}
                        tone={r.improvement_s === null ? '' : r.improvement_s > 0 ? 'text-easy' : 'text-muted-foreground'}
                      />
                    </div>
                  )}
                </div>

                {isCoach && !before && (
                  <CoachResult eventId={eventId} row={r} onSaved={onSaved} />
                )}
              </div>
            ))}
          </div>
        </Card>
      ))}
    </div>
  );
}

// Salar fixing a mistyped time — the runners enter their own.
function CoachResult({ eventId, row, onSaved }: {
  eventId: string; row: Row; onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(row.result_time || '');
  const [busy, setBusy] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-2 text-[0.68rem] font-bold text-muted-foreground hover:text-primary"
      >
        اصلاح زمان
      </button>
    );
  }
  return (
    <div className="mt-3 flex flex-wrap items-end gap-2">
      <TimeFields value={value} onChange={setValue} label="زمان" />
      <Button
        size="sm"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          await saveResult(supabase, eventId, row.student_id, value);
          setBusy(false);
          setOpen(false);
          onSaved();
        }}
      >
        {busy ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
        ذخیره
      </Button>
      <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
        <X className="size-4" />
      </Button>
    </div>
  );
}

// Salar's form. Creating one also posts to اطلاعیه‌ها, because that is the
// only thing in the app that tells anybody something has happened.
function EventForm({ initial, coachId, onClose, onSaved }: {
  initial: Ev | null; coachId: string; onClose: () => void; onSaved: (id: string) => void;
}) {
  const [title, setTitle] = useState(initial?.title || 'رکوردگیری');
  const [date, setDate] = useState(initial?.event_date || '');
  const [time, setTime] = useState(initial?.start_time || '۶ صبح');
  const [place, setPlace] = useState(initial?.place || '');
  const [dists, setDists] = useState<number[]>(initial?.distances || [5000, 10000]);
  const [announce, setAnnounce] = useState(!initial);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    if (!title.trim() || !date) { setErr('عنوان و تاریخ لازم است.'); return; }
    setBusy(true); setErr(null);
    const fields = {
      title: title.trim(), event_date: date, start_time: time.trim() || null,
      place: place.trim() || null, distances: dists.length ? dists : [10000],
    };
    const { data, error } = initial
      ? await updateEvent(supabase, initial.id, fields)
      : await createEvent(supabase, coachId, fields);
    if (error) { setBusy(false); setErr(error.message); return; }

    if (announce && data) {
      await createPost(supabase, coachId,
        `${fields.title}\n${faDateLong(fields.event_date)}` +
        (fields.start_time ? ` — ساعت ${fields.start_time}` : '') +
        (fields.place ? `\n📍 ${fields.place}` : '') +
        `\nمسافت‌ها: ${fields.distances.map(distanceLabel).join('، ')}` +
        `\nهدفت را در صفحه‌ی رکوردگیری ثبت کن.`);
    }
    setBusy(false);
    onSaved(data!.id);
  }

  return (
    <Card className="p-5">
      <div className="mb-3 flex items-center gap-2">
        <h2 className="display text-xl">{initial ? 'ویرایش رکوردگیری' : 'رکوردگیری تازه'}</h2>
        <button type="button" onClick={onClose} aria-label="بستن" className="ms-auto text-muted-foreground">
          <X className="size-4" />
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label className="mb-1.5 block">عنوان</Label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} dir="auto" />
        </div>
        <div>
          <Label className="mb-1.5 block">تاریخ (میلادی)</Label>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} dir="ltr" className="figures" />
        </div>
        <div>
          <Label className="mb-1.5 block">ساعت</Label>
          <Input value={time} onChange={(e) => setTime(e.target.value)} dir="auto" placeholder="۶ صبح" />
        </div>
        <div>
          <Label className="mb-1.5 block">مکان</Label>
          <Input value={place} onChange={(e) => setPlace(e.target.value)} dir="auto" placeholder="پیست چیتگر" />
        </div>
      </div>

      <Label className="mb-2 mt-4 block">مسافت‌های این روز</Label>
      <div className="flex flex-wrap gap-2">
        {COMMON_DISTANCES.map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => setDists((p) => p.includes(d) ? p.filter((x) => x !== d) : [...p, d].sort((a, b) => a - b))}
            className={cn(
              'nib-pill border px-3.5 py-1.5 text-sm font-bold transition-colors',
              dists.includes(d)
                ? 'border-primary bg-accent text-primary'
                : 'border-border text-muted-foreground hover:bg-secondary',
            )}
          >
            {distanceLabel(d)}
          </button>
        ))}
      </div>

      {!initial && (
        <label className="mt-4 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={announce} onChange={(e) => setAnnounce(e.target.checked)} />
          اعلام در اطلاعیه‌ها
        </label>
      )}

      {err && <p className="mt-3 text-xs text-destructive">{err}</p>}

      <div className="mt-4 flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={onClose}>انصراف</Button>
        <Button size="sm" onClick={save} disabled={busy}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
          ذخیره
        </Button>
      </div>
    </Card>
  );
}
