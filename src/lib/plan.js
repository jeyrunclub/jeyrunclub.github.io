// Shared session/plan helpers for the coach + student pages.

export const DAYS_FA = ['شنبه','یک‌شنبه','دوشنبه','سه‌شنبه','چهارشنبه','پنج‌شنبه','جمعه'];
export const DAYS_FA_SHORT = ['ش','ی','د','س','چ','پ','ج'];
export const MONTHS_FA_GREG = [
  'ژانویه','فوریه','مارس','آوریل','مه','ژوئن',
  'ژوئیه','اوت','سپتامبر','اکتبر','نوامبر','دسامبر',
];

export const TYPES = [
  { id: 'easy',     label: 'آسان',       color: '#3fa25c', short: 'آسان' },
  { id: 'long',     label: 'طولانی',      color: '#4a89dc', short: 'طولانی' },
  { id: 'tempo',    label: 'تمپو',        color: '#e6a23c', short: 'تمپو' },
  { id: 'interval', label: 'اینتروال',    color: '#df2747', short: 'اینتروال' },
  { id: 'race',     label: 'مسابقه',      color: '#a259d9', short: 'مسابقه' },
  { id: 'rest',     label: 'استراحت',     color: '#7a8393', short: 'استراحت' },
  { id: 'strength', label: 'قدرتی',       color: '#8b5a3c', short: 'قدرتی' },
];
export const TYPE_BY_ID = Object.fromEntries(TYPES.map((t) => [t.id, t]));

export const BLOCK_KINDS = [
  { id: 'warmup',   label: 'گرم‌کردن' },
  { id: 'run',      label: 'دو' },
  { id: 'interval', label: 'اینتروال' },
  { id: 'cooldown', label: 'سردکردن' },
  { id: 'rest',     label: 'استراحت' },
  { id: 'note',     label: 'یادداشت' },
];
export const BLOCK_KIND_BY_ID = Object.fromEntries(BLOCK_KINDS.map((b) => [b.id, b]));

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

// Day-of-week index in Persian week terms (Sat=0..Fri=6)
export function persianDow(iso) {
  const d = new Date(iso + 'T00:00:00');
  return (d.getDay() + 1) % 7;
}

// Fa digits
export function faNum(n) {
  return String(n).replace(/[0-9]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[+d]);
}

// Format a date as e.g. "۱۰ مرداد" (Persian calendar)
export function faDateShort(iso) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('fa-IR', {
    day: 'numeric', month: 'long',
  });
}
export function faDateLong(iso) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('fa-IR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
}

// ---------- Month calendar generation (Jalali) ----------

import {
  jalaliToDate, gregDateToJalali, jalaliMonthLength,
} from './jalali.js';

// Build a 6x7 grid for a Jalali month. Rows start on Saturday.
// Cells:
//   { date: 'YYYY-MM-DD' Gregorian ISO (used for DB queries),
//     jy, jm, jd, day, inMonth, isToday, dow (0=Sat) }
export function monthGrid(jy, jm) {
  const first = jalaliToDate(jy, jm, 1);
  const firstDow = (first.getDay() + 1) % 7;
  const gridStart = new Date(first);
  gridStart.setDate(first.getDate() - firstDow);
  const todayIso = today();
  const cells = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(gridStart);
    d.setDate(gridStart.getDate() + i);
    const iso = isoDate(d);
    const jal = gregDateToJalali(d);
    cells.push({
      date: iso,
      jy: jal.jy, jm: jal.jm, jd: jal.jd,
      day: jal.jd,
      inMonth: jal.jy === jy && jal.jm === jm,
      isToday: iso === todayIso,
      dow: (d.getDay() + 1) % 7,
    });
  }
  return cells;
}

// Gregorian ISO range for a Jalali month — for DB queries (leaderboard, plans).
export function jalaliMonthRange(jy, jm) {
  const first = jalaliToDate(jy, jm, 1);
  const last  = jalaliToDate(jy, jm, jalaliMonthLength(jy, jm));
  return { from: isoDate(first), to: isoDate(last) };
}

// ---------- Plan / sessions helpers ----------

// Ensure a session has a `date` (older sessions stored `day` inside a weekly plan).
export function ensureSessionDate(session, weekStart) {
  if (session.date) return session;
  const day = Number(session.day ?? 0);
  return { ...session, date: addDays(weekStart, day) };
}

// Fetch all plans (weekly buckets) whose week overlaps [from, to] inclusive.
// Returns a flat map: dateIso -> session (with .plan_id and .plan_week attached).
export async function fetchSessionsForRange(supabase, studentIds, fromIso, toIso) {
  // Fetch any plan whose week_start is within [from-6, to] (a plan starting
  // on Saturday can include sessions up to +6 days).
  const startBound = addDays(fromIso, -6);
  let q = supabase.from('plans').select('id, student_id, week_start, sessions, notes')
    .gte('week_start', startBound).lte('week_start', toIso);
  if (Array.isArray(studentIds) && studentIds.length) {
    q = q.in('student_id', studentIds);
  }
  const { data, error } = await q;
  if (error) { console.error(error); return {}; }
  const bySid = {};
  (data || []).forEach((p) => {
    const per = (bySid[p.student_id] ||= {});
    (p.sessions || []).forEach((s, i) => {
      const ss = ensureSessionDate(s, p.week_start);
      if (ss.date < fromIso || ss.date > toIso) return;
      per[ss.date] ||= [];
      per[ss.date].push({ ...ss, plan_id: p.id, plan_week: p.week_start, index: i });
    });
  });
  return bySid;
}

// Load one student's plan for a given week (creates in-memory row if missing).
export async function loadOrInitPlan(supabase, studentId, weekStart) {
  const { data } = await supabase.from('plans').select('*')
    .eq('student_id', studentId).eq('week_start', weekStart).maybeSingle();
  return data || { student_id: studentId, week_start: weekStart, sessions: [], notes: null };
}

// Upsert a plan row.
export async function savePlan(supabase, plan, coachId) {
  const payload = {
    student_id: plan.student_id,
    week_start: plan.week_start,
    sessions:   plan.sessions || [],
    notes:      plan.notes || null,
    updated_by: coachId || null,
    updated_at: new Date().toISOString(),
  };
  return await supabase.from('plans')
    .upsert(payload, { onConflict: 'student_id,week_start' });
}

// Given a date, ensure its session lives on the correct week's plan row.
// Returns { weekStart, plan (loaded), sessionIndex }.
export async function getOrCreateSessionSlot(supabase, studentId, dateIso) {
  const weekStart = weekSaturdayOf(dateIso);
  const plan = await loadOrInitPlan(supabase, studentId, weekStart);
  const sessions = (plan.sessions || []).map((s) => ensureSessionDate(s, weekStart));
  let idx = sessions.findIndex((s) => s.date === dateIso);
  if (idx === -1) idx = -1; // caller inserts
  return { weekStart, plan: { ...plan, sessions }, sessionIndex: idx };
}

// Summarise a session as short human text ("۸km آسان" / "۵×۱۰۰۰m + ۹۰s")
export function summariseSession(session) {
  const t = TYPE_BY_ID[session.type] || TYPE_BY_ID.easy;
  const parts = [];
  const bs = session.blocks || [];
  const mainRun = bs.find((b) => b.kind === 'run' && (b.distance_km || b.minutes));
  const intervalBlk = bs.find((b) => b.kind === 'interval');
  if (mainRun && mainRun.distance_km) parts.push(`${faNum(mainRun.distance_km)}km`);
  else if (mainRun && mainRun.minutes) parts.push(`${faNum(mainRun.minutes)}′`);
  if (intervalBlk) {
    const r = intervalBlk.repeat || 1;
    if (intervalBlk.distance_m) parts.push(`${faNum(r)}×${faNum(intervalBlk.distance_m)}m`);
    else if (intervalBlk.distance_km) parts.push(`${faNum(r)}×${faNum(intervalBlk.distance_km)}km`);
    else if (intervalBlk.minutes) parts.push(`${faNum(r)}×${faNum(intervalBlk.minutes)}′`);
  }
  if (!parts.length && session.title) return `${t.short} · ${session.title}`;
  if (!parts.length) return t.short;
  return `${t.short} · ${parts.join(' + ')}`;
}

// Fresh empty session
export function newSession(dateIso) {
  return {
    id: crypto.randomUUID?.() ?? `s_${Date.now()}`,
    date: dateIso,
    type: 'easy',
    title: '',
    blocks: [],
    notes: '',
    status: 'planned',     // 'planned' | 'submitted' | 'done' | 'skipped'
    student_note: '',
    submitted_at: null,
    done_at: null,
  };
}

// Fresh block by kind
export function newBlock(kind) {
  const b = { kind };
  if (kind === 'interval') b.repeat = 5;
  return b;
}

// ---------- Storage / photos ----------
export const PHOTO_BUCKET = 'session-photos';

// Load a File into an <img>
function loadImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = (e) => { URL.revokeObjectURL(url); reject(e); };
    img.src = url;
  });
}

// Resize / re-encode to JPEG (max side maxDim, quality 0..1). Returns Blob.
export async function compressImage(file, maxDim = 1600, quality = 0.85) {
  if (!file.type.startsWith('image/')) throw new Error('not an image');
  const img = await loadImage(file);
  const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
  const w = Math.round(img.width * scale);
  const h = Math.round(img.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, w, h);
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('encode failed'))),
      'image/jpeg', quality,
    );
  });
}

// Upload a photo for a session and return the storage path.
export async function uploadSessionPhoto(supabase, studentId, sessionId, file) {
  const blob = await compressImage(file);
  const path = `${studentId}/${sessionId}-${new Date().toISOString().replace(/[:.]/g, '')}.jpg`;
  const { error } = await supabase.storage.from(PHOTO_BUCKET).upload(path, blob, {
    contentType: 'image/jpeg', upsert: false,
  });
  if (error) throw error;
  return path;
}

// Get a temporary signed URL for viewing a private photo.
export async function signedPhotoUrl(supabase, path, secs = 3600) {
  if (!path) return null;
  const { data } = await supabase.storage.from(PHOTO_BUCKET).createSignedUrl(path, secs);
  return data?.signedUrl || null;
}

// Delete a photo (student deletes their own; coach deletes anyone's).
export async function deleteSessionPhoto(supabase, path) {
  if (!path) return;
  await supabase.storage.from(PHOTO_BUCKET).remove([path]);
}

// Render one block as a compact human line (for display in read-only card)
export function formatBlock(b) {
  const kind = BLOCK_KIND_BY_ID[b.kind]?.label ?? b.kind;
  const parts = [];
  if (b.kind === 'interval') {
    const r = b.repeat || 1;
    if (b.distance_m)       parts.push(`${faNum(r)}×${faNum(b.distance_m)}m`);
    else if (b.distance_km) parts.push(`${faNum(r)}×${faNum(b.distance_km)}km`);
    else if (b.minutes)     parts.push(`${faNum(r)}×${faNum(b.minutes)}′`);
    if (b.rest_sec)         parts.push(`استراحت ${faNum(b.rest_sec)}s`);
    else if (b.rest_min)    parts.push(`استراحت ${faNum(b.rest_min)}′`);
  } else {
    if (b.distance_km) parts.push(`${faNum(b.distance_km)}km`);
    if (b.minutes)     parts.push(`${faNum(b.minutes)}′`);
    if (b.pace)        parts.push(`ریتم ${b.pace}`);
  }
  const suffix = b.description ? ` — ${b.description}` : '';
  return `${kind}${parts.length ? ' ' + parts.join(' · ') : ''}${suffix}`;
}
