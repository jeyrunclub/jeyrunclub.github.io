// Shared week/plan helpers for the coach + student pages.
//
// A plan is one row per student per week (Saturday-start). `plan_days` holds
// seven { workout, note } entries, index 0 = Saturday .. 6 = Friday. Weeks
// written before the table existed only have `plan_text`, so both come back
// from loadWeekPlan() and the student page falls back to the text.

export const DAYS_FA = ['شنبه','یک‌شنبه','دوشنبه','سه‌شنبه','چهارشنبه','پنج‌شنبه','جمعه'];

// ---------- Date helpers ----------

// ISO 'YYYY-MM-DD' from a local Date
export function isoDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

export function today() {
  return isoDate(new Date());
}

export function addDays(iso, delta) {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + delta);
  return isoDate(d);
}

// Saturday-based week (Persian week). Returns 'YYYY-MM-DD' of the Saturday.
export function weekSaturdayOf(iso) {
  const d = new Date(iso + 'T00:00:00');
  const dow = d.getDay();          // 0=Sun, 6=Sat
  const daysSinceSat = (dow + 1) % 7;
  d.setDate(d.getDate() - daysSinceSat);
  return isoDate(d);
}

export function thisWeekStart() {
  return weekSaturdayOf(today());
}

// Fa digits
export function faNum(n) {
  return String(n).replace(/[0-9]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[+d]);
}

// "۱۰ مرداد" (Persian calendar)
export function faDateShort(iso) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('fa-IR', {
    day: 'numeric', month: 'long',
  });
}

// "شنبه ۱۰ مرداد ۱۴۰۴"
export function faDateLong(iso) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('fa-IR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
}

// Label for a whole week: "۱۰ تا ۱۶ مرداد ۱۴۰۴"
export function weekLabel(weekStart) {
  const end = addDays(weekStart, 6);
  const year = new Date(end + 'T00:00:00')
    .toLocaleDateString('fa-IR', { year: 'numeric' });
  return `${faDateShort(weekStart)} تا ${faDateShort(end)} ${year}`;
}

// Relative label for the week nav: این هفته / هفته‌ی گذشته / …
export function weekRelativeLabel(weekStart) {
  const diffDays = Math.round(
    (new Date(weekStart + 'T00:00:00') - new Date(thisWeekStart() + 'T00:00:00'))
    / 86400000,
  );
  const weeks = Math.round(diffDays / 7);
  if (weeks === 0)  return 'این هفته';
  if (weeks === -1) return 'هفته‌ی گذشته';
  if (weeks === 1)  return 'هفته‌ی آینده';
  if (weeks < 0)    return `${faNum(-weeks)} هفته پیش`;
  return `${faNum(weeks)} هفته بعد`;
}

// ---------- Plan days ----------

export const EMPTY_DAY = { workout: '', note: '' };

// Always exactly 7 entries, whatever the DB (or an older row) gives us.
export function normalizeDays(raw) {
  const arr = Array.isArray(raw) ? raw : [];
  return Array.from({ length: 7 }, (_, i) => ({
    workout: String(arr[i]?.workout || ''),
    note:    String(arr[i]?.note || ''),
  }));
}

export function emptyDays() {
  return normalizeDays([]);
}

export function dayIsEmpty(day) {
  return !day || (!day.workout.trim() && !day.note.trim());
}

export function daysAreEmpty(days) {
  return normalizeDays(days).every(dayIsEmpty);
}

// Trim every field; drop the whole thing to [] when nothing was written.
export function trimDays(days) {
  const out = normalizeDays(days).map((d) => ({
    workout: d.workout.trim(), note: d.note.trim(),
  }));
  return out.every(dayIsEmpty) ? [] : out;
}

// Index into plan_days for an ISO date, given the week it belongs to.
export function dayIndexOf(iso, weekStart) {
  return Math.round(
    (new Date(iso + 'T00:00:00') - new Date(weekStart + 'T00:00:00')) / 86400000,
  );
}

// ---------- Loading / saving ----------

// One student's week: { days: [7], text } — `text` is the legacy free-text.
export async function loadWeekPlan(supabase, studentId, weekStart) {
  const { data, error } = await supabase.from('plans')
    .select('plan_days, plan_text')
    .eq('student_id', studentId).eq('week_start', weekStart)
    .maybeSingle();
  if (error) { console.error(error); return { days: emptyDays(), text: '' }; }
  return {
    days: normalizeDays(data?.plan_days),
    text: data?.plan_text || '',
  };
}

// Coach-only: write one student's week.
export async function saveWeekPlan(supabase, studentId, weekStart, days, coachId) {
  return await supabase.from('plans').upsert({
    student_id: studentId,
    week_start: weekStart,
    plan_days:  trimDays(days),
    updated_by: coachId || null,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'student_id,week_start' });
}

// Coach dashboard: which students already have a plan for a given week.
export async function fetchWeekPlansForStudents(supabase, weekStart) {
  const { data, error } = await supabase.from('plans')
    .select('student_id, plan_days, plan_text')
    .eq('week_start', weekStart);
  if (error) { console.error(error); return {}; }
  return Object.fromEntries((data || []).map((r) => [
    r.student_id,
    { days: normalizeDays(r.plan_days), text: r.plan_text || '' },
  ]));
}
