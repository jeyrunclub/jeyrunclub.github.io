// Renders the coach's free-text weekly plan.
//
// The text mixes Persian and Latin lines ("دوشنبه" then "5k recovery pace 6:30"),
// so every line gets dir="auto" and is laid out on its own — line breaks are the
// only structure the text has, and they carry the meaning.

const DAY_PREFIXES = [
  'شنبه', 'یکشنبه', 'دوشنبه', 'سهشنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه',
];

// Strip ZWNJ / spaces so "سه شنبه", "سه‌شنبه" and "سهشنبه" all compare equal.
function normalize(line: string) {
  return line.replace(/[‌\s]/g, '');
}

function isDayHeading(line: string) {
  const n = normalize(line);
  if (!n || n.length > 24) return false;
  return DAY_PREFIXES.some((d) => n.startsWith(d));
}

export function PlanText({ text }: { text: string }) {
  const lines = text.replace(/\r\n/g, '\n').split('\n');

  return (
    <div className="flex flex-col">
      {lines.map((line, i) => {
        if (!line.trim()) return <div key={i} className="h-3" />;
        if (isDayHeading(line)) {
          return (
            <h3
              key={i}
              dir="auto"
              className="mt-4 border-t border-border pt-3 text-base font-extrabold text-primary first:mt-0 first:border-0 first:pt-0"
            >
              {line.trim()}
            </h3>
          );
        }
        return (
          <p key={i} dir="auto" className="text-[0.95rem] leading-7">
            {line.trim()}
          </p>
        );
      })}
    </div>
  );
}
