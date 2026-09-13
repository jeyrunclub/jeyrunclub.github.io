// رکوردگیری — the club's record-setting days.
//
// An event offers a set of distances; each runner picks their own, so one
// person can run 5k on a day the rest run 21k. What makes it a ceremony
// rather than a race result is the three numbers kept side by side: the record
// they held, the target they named beforehand, and what they actually ran.

import { faNum } from './plan.js';

export function distanceLabel(m) {
  if (m === 21097) return 'نیمه‌ماراتن';
  if (m === 42195) return 'ماراتن';
  const km = m / 1000;
  const n = Number.isInteger(km) ? String(km) : km.toFixed(1).replace(/\.0$/, '');
  return `${faNum(n)} کیلومتر`;
}

export const COMMON_DISTANCES = [3000, 5000, 10000, 21097, 42195];

// "46:20" → 2780. Shared shape with the 10k record, Persian digits allowed.
export function secs(text) {
  const t = String(text || '').trim().replace(/[۰-۹]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d));
  let m = t.match(/^(\d{1,3}):(\d{1,2})$/);
  if (m) return Number(m[1]) * 60 + Number(m[2]);
  m = t.match(/^(\d{1,2}):(\d{1,2}):(\d{1,2})$/);
  if (m) return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
  return null;
}

export function fromSecs(total) {
  if (total === null || total === undefined || total < 0) return '';
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

// The number a runner actually thinks in: minutes per kilometre.
export function paceOf(timeText, distanceM) {
  const t = secs(timeText);
  if (t === null || !distanceM) return null;
  return fromSecs(Math.round(t / (distanceM / 1000)));
}

// When the gun actually goes.
//
// start_time is free text — «۶ صبح», «06:30», «۷» — because Salar types it.
// Whatever can be read out of it becomes the hour; anything unreadable falls
// back to six in the morning, which is when the club runs.
export function eventStartAt(ev) {
  const t = String(ev?.start_time || '').replace(/[۰-۹]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d));
  const m = t.match(/(\d{1,2})(?::(\d{1,2}))?/);
  let hour = m ? Number(m[1]) : 6;
  const min = m && m[2] ? Number(m[2]) : 0;
  // «۸ شب» and the like.
  if (/شب|عصر|بعدازظهر|pm/i.test(t) && hour < 12) hour += 12;
  if (hour > 23) hour = 6;
  const d = new Date(ev.event_date + 'T00:00:00');
  d.setHours(hour, min, 0, 0);
  return d;
}

// Days, hours, minutes, seconds left — or null once it has started.
export function countdownParts(ev, now = Date.now()) {
  const left = eventStartAt(ev).getTime() - now;
  if (left <= 0) return null;
  const s = Math.floor(left / 1000);
  return {
    days: Math.floor(s / 86400),
    hours: Math.floor((s % 86400) / 3600),
    minutes: Math.floor((s % 3600) / 60),
    seconds: s % 60,
  };
}

// "۱۲ روز مانده" / "امروز" / "برگزار شد"
export function daysUntil(isoDate) {
  const then = new Date(isoDate + 'T00:00:00');
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.round((then - now) / 86400000);
}

export function countdownLabel(isoDate) {
  const d = daysUntil(isoDate);
  if (d === 0) return 'امروز';
  if (d === 1) return 'فردا';
  if (d > 1) return `${faNum(d)} روز مانده`;
  if (d === -1) return 'دیروز';
  return 'برگزار شد';
}

// ---------- reads ----------

export async function fetchEvents(supabase) {
  const { data, error } = await supabase.from('events')
    .select('*').order('event_date', { ascending: false });
  if (error) { console.error(error); return []; }
  return data || [];
}

// The one the app should be talking about: the next one coming, else the last.
export function currentEvent(events) {
  if (!events.length) return null;
  const ahead = [...events].filter((e) => daysUntil(e.event_date) >= 0)
    .sort((a, b) => a.event_date.localeCompare(b.event_date));
  return ahead[0] || events[0];
}

export async function fetchBoard(supabase, eventId) {
  const { data, error } = await supabase.rpc('event_board', { p_event: eventId });
  if (error) { console.error(error); return []; }
  return data || [];
}

export async function fetchMyRecords(supabase) {
  const { data, error } = await supabase.rpc('my_records');
  if (error) { console.error(error); return {}; }
  return Object.fromEntries((data || []).map((r) => [r.distance_m, r.time_text]));
}

// ---------- writes ----------

export async function saveEntry(supabase, eventId, distanceM, target) {
  return await supabase.rpc('set_event_entry', {
    p_event: eventId, p_distance: distanceM, p_target: target || null,
  });
}

export async function saveResult(supabase, eventId, studentId, result, note) {
  return await supabase.rpc('set_event_result', {
    p_event: eventId, p_student: studentId, p_result: result || null, p_note: note ?? null,
  });
}

export async function createEvent(supabase, coachId, fields) {
  return await supabase.from('events')
    .insert({ ...fields, created_by: coachId }).select().single();
}

export async function updateEvent(supabase, id, fields) {
  return await supabase.from('events')
    .update({ ...fields, updated_at: new Date().toISOString() }).eq('id', id).select().single();
}

export async function deleteEvent(supabase, id) {
  return await supabase.from('events').delete().eq('id', id);
}

// ---------- the ceremony ----------

// Rows grouped by distance: comparing a 5k to a half is meaningless, and the
// people who ran the short one should not be buried under the long one.
export function byDistance(rows) {
  const groups = new Map();
  for (const r of rows) {
    if (!groups.has(r.distance_m)) groups.set(r.distance_m, []);
    groups.get(r.distance_m).push(r);
  }
  return [...groups.entries()].sort((a, b) => a[0] - b[0]);
}

// One line for the whole club: every second taken off, added up.
export function totalImprovement(rows) {
  return rows.reduce((sum, r) => sum + Math.max(0, r.improvement_s || 0), 0);
}
