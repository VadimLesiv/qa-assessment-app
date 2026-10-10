import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { Card, Section, Track } from '@qa/shared';
import { api, ApiRequestError } from '../lib/api';
import { plural, trackPillStyle } from '../lib/format';
import { htmlToText } from '../lib/richtext';
import { ProgressRing } from '../components/ProgressRing';
import { Empty, ErrorBanner, Loading } from '../components/States';

export function SectionPage() {
  const { sectionId } = useParams<{ sectionId: string }>();
  const [section, setSection] = useState<Section | null>(null);
  const [track, setTrack] = useState<Track | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** Decks whose card list is expanded, and the cards loaded for them. */
  const [openDecks, setOpenDecks] = useState<Record<string, Card[] | 'loading'>>({});
  const navigate = useNavigate();

  useEffect(() => {
    if (!sectionId) return;
    let cancelled = false;

    void (async () => {
      try {
        const [data, tracks] = await Promise.all([api.getSection(sectionId), api.listTracks()]);
        if (cancelled) return;
        setSection(data);
        setTrack(tracks.find((t) => t.key === data.track) ?? null);
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

  const toggleCards = async (deckId: string) => {
    if (openDecks[deckId]) {
      setOpenDecks((prev) => Object.fromEntries(Object.entries(prev).filter(([id]) => id !== deckId)));
      return;
    }
    setOpenDecks((prev) => ({ ...prev, [deckId]: 'loading' }));
    try {
      const deck = await api.getSubSection(deckId);
      setOpenDecks((prev) => ({ ...prev, [deckId]: deck.cards }));
    } catch (err) {
      setOpenDecks((prev) => Object.fromEntries(Object.entries(prev).filter(([id]) => id !== deckId)));
      setError(err instanceof ApiRequestError ? err.message : 'Could not load the cards');
    }
  };

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
              <span className="pill" style={trackPillStyle(track?.color)}>
                {track?.name ?? section.track}
              </span>
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
            const open = openDecks[deck.id];

            return (
              <div key={deck.id} className="deck-block">
              <div className="deck-row">
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
                    className="btn btn--sm"
                    onClick={() => void toggleCards(deck.id)}
                    disabled={cardCount === 0}
                    aria-expanded={Boolean(open)}
                  >
                    {open ? 'Hide cards' : '📋 Cards'}
                  </button>
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

              {open === 'loading' && <p className="field-hint deck-cards">Loading cards…</p>}
              {Array.isArray(open) && (
                <ol className="deck-cards" aria-label={`Cards in ${deck.name}`}>
                  {open.map((card, i) => (
                    <li key={card.id} className="deck-card-item">
                      <span className="deck-card-num">{i + 1}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="deck-row-name" style={{ fontSize: 14 }}>
                          {htmlToText(card.front)}
                        </div>
                        <div className="deck-row-meta">{htmlToText(card.back)}</div>
                      </div>
                      <span className={`pill pill--${(card.status ?? 'NEW').toLowerCase()}`}>
                        {card.status ?? 'NEW'}
                      </span>
                    </li>
                  ))}
                </ol>
              )}
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}
