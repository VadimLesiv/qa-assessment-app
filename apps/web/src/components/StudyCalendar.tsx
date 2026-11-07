import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function key(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Month calendar that highlights the days the player studied. */
export function StudyCalendar() {
  const [days, setDays] = useState<Set<string>>(new Set());
  const now = new Date();
  const [cursor, setCursor] = useState({ year: now.getFullYear(), month: now.getMonth() });

  useEffect(() => {
    void api
      .getStudyDays()
      .then((list) => setDays(new Set(list)))
      .catch(() => setDays(new Set()));
  }, []);

  const { year, month } = cursor;
  const first = new Date(year, month, 1);
  const offset = (first.getDay() + 6) % 7; // Monday-first
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = key(now.getFullYear(), now.getMonth(), now.getDate());

  const studiedThisMonth = useMemo(() => {
    let n = 0;
    for (let d = 1; d <= daysInMonth; d++) if (days.has(key(year, month, d))) n++;
    return n;
  }, [days, year, month, daysInMonth]);

  const shift = (delta: number) => {
    const d = new Date(year, month + delta, 1);
    setCursor({ year: d.getFullYear(), month: d.getMonth() });
  };

  const cells: (number | null)[] = [
    ...Array.from({ length: offset }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  return (
    <section className="panel study-cal" aria-label="Study calendar">
      <div className="study-cal-head">
        <button type="button" className="btn btn--sm" onClick={() => shift(-1)} aria-label="Previous month">
          ‹
        </button>
        <div style={{ textAlign: 'center', flex: 1 }}>
          <div style={{ fontWeight: 800 }}>
            {first.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
          </div>
          <div style={{ color: 'var(--text-3)', fontSize: 12 }}>
            {studiedThisMonth} {studiedThisMonth === 1 ? 'day' : 'days'} studied
          </div>
        </div>
        <button type="button" className="btn btn--sm" onClick={() => shift(1)} aria-label="Next month">
          ›
        </button>
      </div>

      <div className="study-cal-grid">
        {WEEKDAYS.map((w) => (
          <div key={w} className="study-cal-dow">
            {w}
          </div>
        ))}
        {cells.map((d, i) => {
          if (d === null) return <div key={`b${i}`} />;
          const k = key(year, month, d);
          const studied = days.has(k);
          return (
            <div
              key={k}
              className={`study-cal-day${studied ? ' is-studied' : ''}${k === today ? ' is-today' : ''}`}
              title={studied ? `Studied on ${k}` : k}
              aria-label={studied ? `${k}, studied` : k}
            >
              {d}
            </div>
          );
        })}
      </div>
    </section>
  );
}
