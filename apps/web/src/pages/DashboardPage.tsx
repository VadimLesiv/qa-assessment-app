import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { ProgressSummary, Section, SectionTrack } from '@qa/shared';
import { api, ApiRequestError } from '../lib/api';
import { plural } from '../lib/format';
import { ProgressRing } from '../components/ProgressRing';
import { Empty, ErrorBanner, Loading } from '../components/States';

const TRACKS: { key: SectionTrack; title: string; blurb: string; icon: string }[] = [
  {
    key: 'PROCESS',
    title: 'Process',
    blurb: 'Methodology, documentation and the way a QA team works.',
    icon: '🧭',
  },
  {
    key: 'TECHNICAL',
    title: 'Technical',
    blurb: 'Test design, automation, APIs and performance.',
    icon: '⚙️',
  },
];

export function DashboardPage() {
  const [sections, setSections] = useState<Section[] | null>(null);
  const [progress, setProgress] = useState<{
    overall: ProgressSummary;
    process: ProgressSummary;
    technical: ProgressSummary;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const [sectionsData, progressData] = await Promise.all([api.listSections(), api.getProgress()]);
        if (cancelled) return;
        setSections(sectionsData);
        setProgress(progressData);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof ApiRequestError ? err.message : 'Could not load your curriculum');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return (
      <main className="page">
        <ErrorBanner message={error} />
      </main>
    );
  }

  if (!sections || !progress) return <Loading label="Loading your curriculum…" />;

  return (
    <main className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Your QA training ground</h1>
          <p className="page-subtitle">
            Flip through decks to learn, then prove it in a quiz. Every card you master and every question
            you answer earns XP toward your next level.
          </p>
        </div>

        <div className="row" style={{ gap: 24 }}>
          <div className="row" style={{ gap: 10 }}>
            <ProgressRing percent={progress.overall.percent} size={68} stroke={7} label="Overall progress" />
            <div>
              <div style={{ fontWeight: 800, fontSize: 15 }}>Overall</div>
              <div style={{ color: 'var(--text-3)', fontSize: 13 }}>
                {progress.overall.known}/{progress.overall.total} cards mastered
              </div>
            </div>
          </div>
        </div>
      </div>

      {TRACKS.map((track) => {
        const trackSections = sections.filter((s) => s.track === track.key);
        const summary = track.key === 'PROCESS' ? progress.process : progress.technical;

        return (
          <section key={track.key} style={{ marginBottom: 40 }}>
            <div className="row" style={{ marginBottom: 16 }}>
              <h2 style={{ fontSize: 21, fontWeight: 800 }}>
                <span aria-hidden="true" style={{ marginRight: 8 }}>
                  {track.icon}
                </span>
                {track.title} Assessment
              </h2>
              <span className={`pill pill--${track.key.toLowerCase()}`}>
                {summary.known}/{summary.total} mastered
              </span>
              <span className="spacer" />
              <ProgressRing
                percent={summary.percent}
                size={44}
                stroke={5}
                color={track.key === 'PROCESS' ? 'var(--track-process)' : 'var(--track-technical)'}
                label={`${track.title} track progress`}
              />
            </div>
            <p className="page-subtitle" style={{ marginTop: 0, marginBottom: 16 }}>
              {track.blurb}
            </p>

            {trackSections.length === 0 ? (
              <Empty icon="📭" title={`No ${track.title.toLowerCase()} sections yet`}>
                <Link to="/manage" className="btn btn--primary btn--sm">
                  Create one
                </Link>
              </Empty>
            ) : (
              <div className="tile-grid">
                {trackSections.map((section) => (
                  <button
                    key={section.id}
                    type="button"
                    className="tile"
                    style={{ '--tile-accent': section.accent ?? 'var(--accent)' } as React.CSSProperties}
                    onClick={() => navigate(`/sections/${section.id}`)}
                  >
                    <div className="tile-head">
                      <span className="tile-icon" aria-hidden="true">
                        {section.icon ?? '📘'}
                      </span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="tile-name">{section.name}</div>
                        {section.description && <div className="tile-desc">{section.description}</div>}
                      </div>
                      <ProgressRing
                        percent={section.progress?.percent ?? 0}
                        size={46}
                        stroke={5}
                        color={section.accent ?? 'var(--accent-bright)'}
                        label={`${section.name} progress`}
                      />
                    </div>

                    <div className="tile-meta">
                      <span>📚 {plural(section.subSections?.length ?? 0, 'deck')}</span>
                      <span>🃏 {plural(section.progress?.total ?? 0, 'card')}</span>
                      {(section.progress?.known ?? 0) > 0 && (
                        <span style={{ color: 'var(--emerald)' }}>✓ {section.progress?.known} known</span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </section>
        );
      })}
    </main>
  );
}
