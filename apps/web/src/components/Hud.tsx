import { NavLink } from 'react-router-dom';
import { usePlayer } from '../lib/PlayerContext';

const NAV = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/manage', label: 'Manage', end: false },
  { to: '/profile', label: 'Profile', end: false },
];

/**
 * Persistent heads-up display: level orb, XP bar toward the next level, and the
 * daily streak. Mirrors the status bar of a game rather than an app toolbar.
 */
export function Hud() {
  const { profile } = usePlayer();

  const xpIntoLevel = profile ? profile.xp - profile.levelStartXp : 0;
  const xpNeeded = profile ? profile.nextLevelXp - profile.levelStartXp : 1;
  const percent = profile ? Math.min(100, Math.round((xpIntoLevel / xpNeeded) * 100)) : 0;

  return (
    <header className="hud">
      <NavLink to="/" className="hud-brand">
        <span className="hud-brand-mark" aria-hidden="true">
          🎮
        </span>
        QA Assessment
      </NavLink>

      <nav className="hud-nav">
        {NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) => `hud-link${isActive ? ' is-active' : ''}`}
          >
            {item.label}
          </NavLink>
        ))}
      </nav>

      {profile && (
        <div className="hud-stats">
          <div className="level-chip">
            <span className="level-orb" title={`Level ${profile.level}`}>
              {profile.level}
            </span>
          </div>

          <div className="xp-bar">
            <div className="xp-bar-label">
              <span>{profile.xp} XP</span>
              <span>
                {xpIntoLevel}/{xpNeeded}
              </span>
            </div>
            <div
              className="xp-bar-track"
              role="progressbar"
              aria-valuenow={percent}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`Progress to level ${profile.level + 1}`}
            >
              <div className="xp-bar-fill" style={{ width: `${percent}%` }} />
            </div>
          </div>

          <div className="streak" title="Consecutive days studied">
            <span aria-hidden="true">🔥</span>
            {profile.streakDays}
          </div>
        </div>
      )}
    </header>
  );
}
