import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { Section } from '@qa/shared';
import { api, ApiRequestError } from '../lib/api';
import { plural } from '../lib/format';
import { ProgressRing } from '../components/ProgressRing';
import { Empty, ErrorBanner, Loading } from '../components/States';

export function SectionPage() {
  const { sectionId } = useParams<{ sectionId: string }>();
  const [section, setSection] = useState<Section | null>(null);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!sectionId) return;
    let cancelled = false;

    void (async () => {
      try {
        const data = await api.getSection(sectionId);
        if (!cancelled) setSection(data);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiRequestError ? err.message : 'Could not load this section');
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [sectionId]);

  if (error) {
    return (
      <main className="page">
        <ErrorBanner message={error} />
        <Link to="/" className="btn">
          ← Back to dashboard
        </Link>
      </main>
    );
  }

  if (!section) return <Loading label="Opening section…" />;

  const decks = section.subSections ?? [];

  return (
    <main className="page">
      <Link to="/" className="hud-link" style={{ display: 'inline-block', marginBottom: 16, paddingLeft: 0 }}>
        ← Dashboard
      </Link>

      <div className="page-header">
        <div className="row" style={{ gap: 16, alignItems: 'flex-start' }}>
          <span className="tile-icon" style={{ width: 60, height: 60, fontSize: 30 }} aria-hidden="true">
            {section.icon ?? '📘'}
          </span>
          <div>
            <div className="row" style={{ gap: 10 }}>
              <h1 className="page-title">{section.name}</h1>
              <span className={`pill pill--${section.track.toLowerCase()}`}>{section.track}</span>
            </div>
            {section.description && <p className="page-subtitle">{section.description}</p>}
          </div>
        </div>

        <ProgressRing
          percent={section.progress?.percent ?? 0}
          size={76}
          stroke={8}
          color={section.accent ?? 'var(--accent-bright)'}
          label={`${section.name} progress`}
        />
      </div>

      {decks.length === 0 ? (
        <Empty icon="📭" title="This section has no decks yet">
          <Link to="/manage" className="btn btn--primary btn--sm">
            Add a deck
          </Link>
        </Empty>
      ) : (
        <div className="stack">
          {decks.map((deck) => {
            const cardCount = deck.cardCount ?? 0;
            const quizCount = deck.quizQuestionCount ?? 0;

            return (
              <div key={deck.id} className="deck-row">
                <ProgressRing
                  percent={deck.progress?.percent ?? 0}
                  size={52}
                  stroke={6}
                  color={section.accent ?? 'var(--accent-bright)'}
                  label={`${deck.name} progress`}
                />

                <div className="deck-row-body">
                  <div className="deck-row-name">{deck.name}</div>
                  {deck.description && <div className="deck-row-meta">{deck.description}</div>}
                  <div className="deck-row-meta">
                    🃏 {plural(cardCount, 'card')}
                    {(deck.progress?.known ?? 0) > 0 && ` · ✓ ${deck.progress?.known} known`}
                    {quizCount > 0 && ` · 🎯 ${plural(quizCount, 'question')}`}
                  </div>
                </div>

                <div className="row" style={{ gap: 8 }}>
                  <button
                    type="button"
                    className="btn btn--primary btn--sm"
                    onClick={() => navigate(`/decks/${deck.id}`)}
                    disabled={cardCount === 0}
                  >
                    Study
                  </button>
                  <button
                    type="button"
                    className="btn btn--sm"
                    onClick={() => navigate(`/decks/${deck.id}/quiz`)}
                    disabled={quizCount === 0 && cardCount < 4}
                    title={
                      quizCount === 0 && cardCount < 4
                        ? 'Needs at least 4 cards to generate a quiz'
                        : 'Take the quiz'
                    }
                  >
                    🎯 Quiz
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}
