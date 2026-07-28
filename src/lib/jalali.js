// Jalali (هجری شمسی) calendar helpers.
// Conversion algorithm adapted from the widely-used JDF (Roozbeh Pournader /
// Mohammad Toossi) implementation — used across the Iranian web.

export const JALALI_MONTHS = [
  'فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور',
  'مهر',     'آبان',     'آذر',   'دی',  'بهمن',  'اسفند',
];

// Persian day-of-week names starting from Saturday
export const JALALI_DOW_LONG  = ['شنبه','یک‌شنبه','دوشنبه','سه‌شنبه','چهارشنبه','پنج‌شنبه','جمعه'];
export const JALALI_DOW_SHORT = ['ش','ی','د','س','چ','پ','ج'];

// Days in a Jalali month
export function jalaliMonthLength(jy, jm) {
  if (jm <= 6) return 31;
  if (jm <= 11) return 30;
  return jalaliIsLeap(jy) ? 30 : 29;
}

export function jalaliIsLeap(jy) {
  // 33-year cycle approximation — accurate for years within many centuries
  const mod = ((jy - 474) % 33 + 33) % 33;
  return [1, 5, 9, 13, 17, 22, 26, 30].includes(mod);
}

// Gregorian → Jalali. Inputs are 1-based (gm = 1..12).
export function gregorianToJalali(gy, gm, gd) {
  const g_d_m = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
  const jy2 = (gm > 2) ? (gy + 1) : gy;
  let days = 355666 + (365 * gy) + Math.floor((jy2 + 3) / 4) - Math.floor((jy2 + 99) / 100)
           + Math.floor((jy2 + 399) / 400) + gd + g_d_m[gm - 1];
  let jy = -1595 + (33 * Math.floor(days / 12053));
  days %= 12053;
  jy += 4 * Math.floor(days / 1461);
  days %= 1461;
  if (days > 365) {
    jy += Math.floor((days - 1) / 365);
    days = (days - 1) % 365;
  }
  const jm = (days < 186) ? 1 + Math.floor(days / 31) : 7 + Math.floor((days - 186) / 30);
  const jd = 1 + ((days < 186) ? (days % 31) : (days - 186) % 30);
  return { jy, jm, jd };
}

// Jalali → Gregorian. Inputs are 1-based (jm = 1..12).
export function jalaliToGregorian(jy, jm, jd) {
  const jy1 = jy + 1595;
  let days = -355668 + (365 * jy1) + (Math.floor(jy1 / 33) * 8) + Math.floor(((jy1 % 33) + 3) / 4)
           + jd + ((jm < 7) ? (jm - 1) * 31 : ((jm - 7) * 30) + 186);
  let gy = 400 * Math.floor(days / 146097);
  days %= 146097;
  if (days > 36524) {
    gy += 100 * Math.floor(--days / 36524);
    days %= 36524;
    if (days >= 365) days++;
  }
  gy += 4 * Math.floor(days / 1461);
  days %= 1461;
  if (days > 365) {
    gy += Math.floor((days - 1) / 365);
    days = (days - 1) % 365;
  }
  let gd = days + 1;
  const sal_a = [0, 31,
    ((gy % 4 === 0 && gy % 100 !== 0) || (gy % 400 === 0)) ? 29 : 28,
    31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  let gm = 0;
  for (gm = 0; gm < 13 && gd > sal_a[gm]; gm++) gd -= sal_a[gm];
  return { gy, gm, gd };
}

// Wrappers around Date
export function gregDateToJalali(d) {
  return gregorianToJalali(d.getFullYear(), d.getMonth() + 1, d.getDate());
}
export function jalaliToDate(jy, jm, jd) {
  const g = jalaliToGregorian(jy, jm, jd);
  return new Date(g.gy, g.gm - 1, g.gd);
}

// Prev / next month in Jalali terms
export function jalaliPrevMonth(jy, jm) {
  jm--; if (jm < 1) { jm = 12; jy--; }
  return { jy, jm };
}
export function jalaliNextMonth(jy, jm) {
  jm++; if (jm > 12) { jm = 1; jy++; }
  return { jy, jm };
}
