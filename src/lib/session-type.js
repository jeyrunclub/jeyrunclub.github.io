// What kind of session is this?
//
// Salar writes free text — "5k recovery pace 6:30", "15 ta 400m rest 1 min",
// "Rest kamel" — mixing Persian, Latin and finglish. We read the first thing
// we recognise and colour the day by it. Getting it wrong is cosmetic: the
// text is always shown verbatim underneath.

export const SESSION_TYPES = {
  rest:     { label: 'استراحت', color: 'rest' },
  race:     { label: 'مسابقه',  color: 'race' },
  interval: { label: 'اینتروال', color: 'interval' },
  tempo:    { label: 'تمپو',    color: 'tempo' },
  long:     { label: 'طولانی',  color: 'long' },
  strength: { label: 'قدرت',    color: 'strength' },
  easy:     { label: 'سبک',     color: 'easy' },
  run:      { label: 'تمرین',   color: 'rest' },
};

// Ordered: the first match wins, so "rest" beats the "rest 1 min" inside an
// interval line only because the interval patterns are checked first.
const RULES = [
  ['race',     [/\brace\b/i, /مسابقه/, /\bmosabeghe/i]],
  ['interval', [
    /interval/i, /اینتروال/, /اینترول/,
    /fartlek/i, /فارتلک/,
    /\d+\s*(\*|x|×|ta)\s*\(?\s*\d/i, // 8*(6min), 15 ta 400m, 10x400
    /\brep(s|eat)?\b/i, /تکرار/,
  ]],
  ['tempo',    [/tempo/i, /تمپو/, /تِمپو/, /threshold/i, /آستانه/, /progressive/i, /پروگرسیو/]],
  ['long',     [/\blong\b/i, /لانگ/, /طولانی/, /\blsd\b/i]],
  ['strength', [/strength/i, /قدرت/, /\bgym\b/i, /\bcore\b/i, /بدنساز/]],
  ['rest',     [/\brest\b/i, /استراحت/, /\boff\b/i, /ریکاوری کامل/]],
  ['easy',     [/\beasy\b/i, /سبک/, /ایزی/, /recovery/i, /ریکاوری/, /\bjog\b/i]],
];

export function sessionType(workout) {
  const text = (workout || '').trim();
  if (!text) return null;
  for (const [key, patterns] of RULES) {
    if (patterns.some((re) => re.test(text))) return { key, ...SESSION_TYPES[key] };
  }
  return { key: 'run', ...SESSION_TYPES.run };
}

// Tailwind classes per type. Written out in full so the JIT keeps them.
export const TYPE_CLASSES = {
  easy:     { text: 'text-easy',     bg: 'bg-easy/12',     dot: 'bg-easy',     rail: 'bg-easy' },
  long:     { text: 'text-long',     bg: 'bg-long/12',     dot: 'bg-long',     rail: 'bg-long' },
  tempo:    { text: 'text-tempo',    bg: 'bg-tempo/12',    dot: 'bg-tempo',    rail: 'bg-tempo' },
  interval: { text: 'text-interval', bg: 'bg-interval/12', dot: 'bg-interval', rail: 'bg-interval' },
  race:     { text: 'text-race',     bg: 'bg-race/12',     dot: 'bg-race',     rail: 'bg-race' },
  rest:     { text: 'text-rest',     bg: 'bg-rest/12',     dot: 'bg-rest',     rail: 'bg-rest' },
  strength: { text: 'text-strength', bg: 'bg-strength/12', dot: 'bg-strength', rail: 'bg-strength' },
};

export function typeClasses(type) {
  return TYPE_CLASSES[type?.color] || TYPE_CLASSES.rest;
}
