export type Lang = 'fa' | 'en';

export const nav = {
  fa: {
    home: 'خانه',
    coach: 'مربی',
    services: 'خدمات',
    races: 'مسابقات',
    calendar: 'تقویم',
    gallery: 'گالری',
    blog: 'بلاگ',
    join: 'عضویت',
    brandAria: 'جیران',
    brandName: 'جیران',
    logoAlt: 'لوگوی تیم جیران',
    menuLabel: 'فهرست اصلی',
    openMenu: 'باز کردن فهرست',
    langToggleTo: 'EN',
    langToggleLabel: 'English',
  },
  en: {
    home: 'Home',
    coach: 'Coach',
    services: 'Services',
    races: 'Races',
    calendar: 'Calendar',
    gallery: 'Gallery',
    blog: 'Blog',
    join: 'Join',
    brandAria: 'Jeyrun',
    brandName: 'Jeyrun',
    logoAlt: 'Jeyrun team logo',
    menuLabel: 'Main navigation',
    openMenu: 'Open menu',
    langToggleTo: 'فا',
    langToggleLabel: 'فارسی',
  },
} as const;

export const footer = {
  fa: {
    tagline: 'باشگاه دو و کوهستان جیران — تهران',
    home: 'خانه',
    blog: 'بلاگ',
    igSalar: 'اینستاگرام سالار',
    igClub: 'اینستاگرام جیران',
    strava: 'استراوا',
    copy: '© ۱۴۰۵ — سالار پیری · جیران',
  },
  en: {
    tagline: 'Jeyrun Running & Mountain Club — Tehran',
    home: 'Home',
    blog: 'Blog (Persian)',
    igSalar: "Salar's Instagram",
    igClub: "Jeyrun's Instagram",
    strava: 'Strava',
    copy: '© 2026 — Salar Piri · Jeyrun',
  },
} as const;

export function prefix(lang: Lang, path: string): string {
  if (lang === 'en') {
    if (path === '/') return '/en';
    if (path.startsWith('/#')) return '/en' + path;
    return '/en' + path;
  }
  return path;
}

export function altLangUrl(lang: Lang, currentPath: string): string {
  const clean = currentPath.replace(/\/$/, '') || '/';
  if (lang === 'fa') {
    if (clean === '/') return '/en';
    return '/en' + clean;
  }
  if (clean === '/en') return '/';
  if (clean.startsWith('/en/')) return clean.slice(3);
  return '/';
}
