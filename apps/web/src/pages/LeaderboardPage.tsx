import { useEffect, useState } from 'react';
import type { LeaderboardEntry } from '@qa/shared';
import { api } from '../lib/api';
import { Loading, Empty, ErrorBanner } from '../components/States';

const MEDALS = ['🥇', '🥈', '🥉'];

export function LeaderboardPage() {
  const [entries, setEntries] = useState<LeaderboardEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .getLeaderboard()
      .then(setEntries)
      .catch(() => setError('Could not load the leaderboard'));
  }, []);

  if (error) return <ErrorBanner message={error} />;
  if (!entries) return <Loading label="Loading leaderboard…" />;

  return (
    <main className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Leaderboard</h1>
          <p className="page-subtitle">Ranked by total XP across every player.</p>
        </div>
      </div>

      {entries.length === 0 ? (
        <Empty icon="🏆" title="No competitors yet">
          <p>Be the first to earn XP and top the board.</p>
        </Empty>
      ) : (
        <div className="leaderboard-list">
          {entries.map((entry) => (
            <div
              key={entry.playerId}
              className={`panel leaderboard-row${entry.isYou ? ' is-you' : ''}`}
            >
              <span className="leaderboard-rank">{MEDALS[entry.rank - 1] ?? `#${entry.rank}`}</span>

              <div className="leaderboard-name">
                <span style={{ fontWeight: 800 }}>
                  {entry.name}
                  {entry.isYou && <span className="leaderboard-you-tag"> (you)</span>}
                </span>
                <span style={{ color: 'var(--text-3)', fontSize: 13 }}>
                  Level {entry.level} · {entry.quizAttempts} quiz{entry.quizAttempts === 1 ? '' : 'zes'} ·{' '}
                  {entry.badgeCount} badge{entry.badgeCount === 1 ? '' : 's'}
                </span>
              </div>

              <div className="leaderboard-streak" title="Study streak">
                <span aria-hidden="true">🔥</span>
                {entry.streakDays}
              </div>

              <div className="leaderboard-xp">{entry.xp} XP</div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
