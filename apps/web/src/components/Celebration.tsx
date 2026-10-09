import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import type { Badge } from '@qa/shared';
import { Modal } from './Modal';

interface Celebration {
  icon: string;
  title: string;
  /** Paragraphs shown under the title; the last one usually explains the rule. */
  lines: string[];
}

interface CelebrationApi {
  levelUp: (level: number, xp: number) => void;
  stars: (stars: number, score: number, total: number) => void;
  badges: (badges: Badge[]) => void;
  streakExtended: (days: number) => void;
  streakReset: () => void;
}

const CelebrationContext = createContext<CelebrationApi | null>(null);

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/**
 * Pop-up queue for milestones (level, stars, badges, streaks). Several can fire
 * from one action, so they are shown one at a time instead of stacking.
 */
export function CelebrationProvider({ children }: { children: ReactNode }) {
  const [queue, setQueue] = useState<Celebration[]>([]);

  const push = useCallback((items: Celebration[]) => {
    if (items.length > 0) setQueue((current) => [...current, ...items]);
  }, []);

  const api = useMemo<CelebrationApi>(
    () => ({
      levelUp: (level, xp) =>
        push([
          {
            icon: '🎉',
            title: `You reached level ${level}!`,
            lines: [
              `You now have ${xp} XP.`,
              'Level N begins at 100 × N × (N−1) / 2 XP, so each level costs 100 XP more than the last.',
            ],
          },
        ]),
      stars: (stars, score, total) => {
        if (stars <= 0) return;
        push([
          {
            icon: '⭐',
            title: `You won ${plural(stars, 'star')}!`,
            lines: [
              `You answered ${score} of ${total} questions correctly.`,
              'Stars: ≥95% → 5 ★ · ≥80% → 4 ★ · ≥65% → 3 ★ · ≥50% → 2 ★ · >0 → 1 ★.',
              'Deck progress counts a KNOWN card as 1.0 and a LEARNING card as 0.5.',
            ],
          },
        ]);
      },
      badges: (badges) =>
        push(
          badges.map((badge) => ({
            icon: badge.icon,
            title: `New badge: ${badge.name}`,
            lines: [`Achievement: ${badge.description}.`],
          })),
        ),
      streakExtended: (days) =>
        push([
          {
            icon: '🔥',
            title: `Streak extended to ${plural(days, 'day')}!`,
            lines: ['You came back the next calendar day, which extends your streak.'],
          },
        ]),
      streakReset: () =>
        push([
          {
            icon: '💤',
            title: 'Streak reset to 1',
            lines: ['You missed a day, so your streak started over. Study again tomorrow to build it back up.'],
          },
        ]),
    }),
    [push],
  );

  const dismiss = useCallback(() => setQueue((current) => current.slice(1)), []);
  const active = queue[0];

  return (
    <CelebrationContext.Provider value={api}>
      {children}
      {active && (
        <Modal
          title={active.title}
          onClose={dismiss}
          footer={
            <button type="button" className="btn btn--primary" onClick={dismiss} autoFocus>
              {queue.length > 1 ? `Next (${queue.length - 1} more)` : 'Awesome!'}
            </button>
          }
        >
          <div className="celebration" role="status">
            <div className="celebration-icon" aria-hidden="true">
              {active.icon}
            </div>
            {active.lines.map((line) => (
              <p key={line} className="modal-desc">
                {line}
              </p>
            ))}
          </div>
        </Modal>
      )}
    </CelebrationContext.Provider>
  );
}

export function useCelebration(): CelebrationApi {
  const context = useContext(CelebrationContext);
  if (!context) throw new Error('useCelebration must be used inside a CelebrationProvider');
  return context;
}
