import { useEffect, useState } from 'react';
import type { ProgressSummary } from '@qa/shared';
import { api, ApiRequestError } from '../lib/api';
import { ProgressRing } from '../components/ProgressRing';
import { Loading } from '../components/States';
import { usePlayer } from '../lib/PlayerContext';
import { useToast } from '../components/Toast';

export function ProfilePage() {
  const { profile, setProfile } = usePlayer();
  const [progress, setProgress] = useState<{
    overall: ProgressSummary;
    process: ProgressSummary;
    technical: ProgressSummary;
  } | null>(null);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  useEffect(() => {
    void api.getProgress().then(setProgress).catch(() => setProgress(null));
  }, []);

  useEffect(() => {
    if (profile) setName(profile.name);
  }, [profile]);

  if (!profile) return <Loading label="Loading profile…" />;

  const earned = profile.badges.filter((b) => b.earnedAt);
  const xpIntoLevel = profile.xp - profile.levelStartXp;
  const xpNeeded = profile.nextLevelXp - profile.levelStartXp;

  const rename = async () => {
    setSaving(true);
    try {
      setProfile(await api.renameProfile(name));
      toast.info('Name updated');
    } catch (err) {
      toast.error(err instanceof ApiRequestError ? err.fieldSummary : 'Could not rename');
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">{profile.name}</h1>
          <p className="page-subtitle">
            Level {profile.level} · {profile.xp} XP total · {earned.length} of {profile.badges.length} badges
            earned
          </p>
        </div>
      </div>

      <div className="tile-grid" style={{ marginBottom: 28 }}>
        <div className="panel">
          <div className="row">
            <span className="level-orb" style={{ width: 52, height: 52, fontSize: 19 }}>
              {profile.level}
            </span>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 800 }}>Level {profile.level}</div>
              <div className="xp-bar-label" style={{ marginTop: 6 }}>
                <span>{xpIntoLevel} XP</span>
                <span>{xpNeeded} to level {profile.level + 1}</span>
              </div>
              <div className="xp-bar-track">
                <div
                  className="xp-bar-fill"
                  style={{ width: `${Math.min(100, (xpIntoLevel / xpNeeded) * 100)}%` }}
                />
              </div>
            </div>
          </div>
        </div>

        <div className="panel row" style={{ gap: 16 }}>
          <span style={{ fontSize: 38 }} aria-hidden="true">
            🔥
          </span>
          <div>
            <div style={{ fontSize: 25, fontWeight: 900 }}>{profile.streakDays}</div>
            <div style={{ color: 'var(--text-3)', fontSize: 13 }}>day study streak</div>
          </div>
        </div>

        {progress && (
          <div className="panel row" style={{ gap: 16 }}>
            <ProgressRing percent={progress.overall.percent} size={62} stroke={7} label="Overall progress" />
            <div>
              <div style={{ fontWeight: 800 }}>Curriculum</div>
              <div style={{ color: 'var(--text-3)', fontSize: 13 }}>
                {progress.overall.known}/{progress.overall.total} cards mastered
              </div>
              <div style={{ color: 'var(--text-3)', fontSize: 12, marginTop: 4 }}>
                Process {progress.process.percent}% · Technical {progress.technical.percent}%
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="panel" style={{ marginBottom: 28 }}>
        <h2 style={{ fontSize: 17, marginBottom: 12 }}>Display name</h2>
        <div className="row" style={{ gap: 10 }}>
          <input
            className="input"
            style={{ maxWidth: 300 }}
            value={name}
            maxLength={60}
            onChange={(e) => setName(e.target.value)}
          />
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => void rename()}
            disabled={saving || !name.trim() || name === profile.name}
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>

      <h2 style={{ fontSize: 19, marginBottom: 14 }}>Badge shelf</h2>
      <div className="badge-grid">
        {profile.badges.map((badge) => (
          <div key={badge.code} className={`badge ${badge.earnedAt ? 'is-earned' : 'is-locked'}`}>
            <span className="badge-icon" aria-hidden="true">
              {badge.icon}
            </span>
            <span className="badge-name">{badge.name}</span>
            <span className="badge-desc">{badge.description}</span>
            {badge.earnedAt && (
              <span className="badge-desc" style={{ color: 'var(--amber)' }}>
                {new Date(badge.earnedAt).toLocaleDateString()}
              </span>
            )}
          </div>
        ))}
      </div>
    </main>
  );
}
