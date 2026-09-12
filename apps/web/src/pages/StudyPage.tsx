import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { Card, CardStatus, ProgressSummary, SubSection } from '@qa/shared';
import { api, ApiRequestError } from '../lib/api';
import { ProgressRing } from '../components/ProgressRing';
import { Empty, ErrorBanner, Loading } from '../components/States';
import { useToast } from '../components/Toast';
import { usePlayer } from '../lib/PlayerContext';

type Deck = SubSection & { cards: Card[] };

export function StudyPage() {
  const { subSectionId } = useParams<{ subSectionId: string }>();
  const [deck, setDeck] = useState<Deck | null>(null);
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [statuses, setStatuses] = useState<Record<string, CardStatus>>({});
  const [progress, setProgress] = useState<ProgressSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const toast = useToast();
  const { setProfile } = usePlayer();
  const navigate = useNavigate();

  useEffect(() => {
    if (!subSectionId) return;
    let cancelled = false;

    void (async () => {
      try {
        const data = await api.getSubSection(subSectionId);
        if (cancelled) return;
        setDeck(data);
        setProgress(data.progress ?? null);
        setStatuses(Object.fromEntries(data.cards.map((c) => [c.id, c.status ?? 'NEW'])));
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiRequestError ? err.message : 'Could not load this deck');
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [subSectionId]);

  const cards = useMemo(() => deck?.cards ?? [], [deck]);
  const current = cards[index];

  /** Persists a status change and folds the returned XP and badges into the HUD. */
  const mark = useCallback(
    async (status: CardStatus, advance: boolean) => {
      if (!current || saving) return;
      setSaving(true);

      try {
        const result = await api.setCardProgress(current.id, status, flipped);
        setStatuses((prev) => ({ ...prev, [current.id]: result.status }));
        setProgress(result.deckProgress);
        setProfile(result.profile);
        toast.xp(result.xpEarned, status === 'KNOWN' ? 'Card mastered' : undefined);
        toast.badges(result.newBadges);

        if (advance && index < cards.length - 1) {
          setFlipped(false);
          setIndex((i) => i + 1);
        }
      } catch (err) {
        toast.error(err instanceof ApiRequestError ? err.message : 'Could not save your progress');
      } finally {
        setSaving(false);
      }
    },
    [current, saving, flipped, index, cards.length, setProfile, toast],
  );

  const go = useCallback(
    (delta: number) => {
      setIndex((i) => {
        const next = Math.min(cards.length - 1, Math.max(0, i + delta));
        // Only reset the flip when the card actually changes.
        if (next !== i) setFlipped(false);
        return next;
      });
    },
    [cards.length],
  );

  // Keyboard shortcuts make drilling a deck much faster than clicking.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;

      switch (event.key) {
        case ' ':
        case 'Enter':
          event.preventDefault();
          setFlipped((f) => !f);
          break;
        case 'ArrowRight':
          go(1);
          break;
        case 'ArrowLeft':
          go(-1);
          break;
        case 'k':
        case 'K':
          void mark('KNOWN', true);
          break;
        case 'l':
        case 'L':
          void mark('LEARNING', true);
          break;
        default:
          break;
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [go, mark]);

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

  if (!deck) return <Loading label="Shuffling the deck…" />;

  if (cards.length === 0) {
    return (
      <main className="page">
        <Empty icon="🃏" title="This deck has no cards yet">
          <Link to="/manage" className="btn btn--primary btn--sm">
            Add cards or import a deck
          </Link>
        </Empty>
      </main>
    );
  }

  if (!current) return <Loading />;

  const status = statuses[current.id] ?? 'NEW';
  const isLast = index === cards.length - 1;

  return (
    <main className="page">
      <div className="row" style={{ marginBottom: 20 }}>
        <button type="button" className="btn btn--ghost btn--sm" onClick={() => navigate(-1)}>
          ← Back
        </button>
        <div>
          <div style={{ fontWeight: 800, fontSize: 17 }}>{deck.name}</div>
          {deck.description && (
            <div style={{ color: 'var(--text-3)', fontSize: 13 }}>{deck.description}</div>
          )}
        </div>
        <span className="spacer" />
        <span className={`pill pill--${status.toLowerCase()}`}>{status}</span>
        {progress && (
          <ProgressRing percent={progress.percent} size={50} stroke={6} label="Deck progress" />
        )}
      </div>

      <div className="card-stage">
        <div
          className={`flashcard${flipped ? ' is-flipped' : ''}`}
          onClick={() => setFlipped((f) => !f)}
          role="button"
          tabIndex={0}
          aria-label={flipped ? 'Card back. Press space to flip to the front.' : 'Card front. Press space to flip.'}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              setFlipped((f) => !f);
            }
          }}
        >
          <div className="flashcard-face flashcard-face--front">
            <div className="flashcard-kicker">
              <span>Card {index + 1}</span>
              <span>·</span>
              <span>{deck.name}</span>
              {current.sourceSlide && <span>· Slide {current.sourceSlide}</span>}
            </div>
            <h2 className="flashcard-title">{current.front}</h2>
            <div className="flashcard-hint">
              <span aria-hidden="true">↻</span> Click or press Space to reveal
            </div>
          </div>

          <div className="flashcard-face flashcard-face--back">
            <div className="flashcard-kicker">
              <span>Answer</span>
            </div>
            <p className="flashcard-body">{current.back}</p>

            {current.bullets.length > 0 && (
              <ul className="flashcard-bullets">
                {current.bullets.map((bullet, i) => (
                  <li key={i}>{bullet}</li>
                ))}
              </ul>
            )}

            {current.notes && <div className="flashcard-notes">📝 {current.notes}</div>}
          </div>
        </div>
      </div>

      {/* Position indicator: colour doubles as a status map of the whole deck. */}
      <div className="deck-dots">
        {cards.map((card, i) => {
          const cardStatus = statuses[card.id] ?? 'NEW';
          return (
            <button
              key={card.id}
              type="button"
              className={[
                'deck-dot',
                i === index ? 'is-current' : '',
                cardStatus === 'KNOWN' ? 'is-known' : '',
                cardStatus === 'LEARNING' ? 'is-learning' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              onClick={() => {
                setIndex(i);
                setFlipped(false);
              }}
              aria-label={`Go to card ${i + 1}, ${cardStatus.toLowerCase()}`}
            />
          );
        })}
      </div>

      <div className="deck-controls">
        <button type="button" className="btn" onClick={() => go(-1)} disabled={index === 0}>
          ← Prev
        </button>

        <span className="deck-counter">
          {index + 1} / {cards.length}
        </span>

        <button type="button" className="btn" onClick={() => go(1)} disabled={isLast}>
          Next →
        </button>
      </div>

      <div className="deck-controls" style={{ marginTop: 14 }}>
        <button
          type="button"
          className="btn btn--danger"
          onClick={() => void mark('LEARNING', true)}
          disabled={saving}
          title="Shortcut: L"
        >
          🔁 Still learning
        </button>
        <button
          type="button"
          className="btn btn--success"
          onClick={() => void mark('KNOWN', true)}
          disabled={saving}
          title="Shortcut: K"
        >
          ✓ I know this
        </button>
      </div>

      {isLast && progress && (
        <div className="panel" style={{ marginTop: 28, textAlign: 'center' }}>
          <h3 style={{ fontSize: 18, marginBottom: 8 }}>
            {progress.percent === 100 ? '🏆 Deck mastered!' : '🎯 End of the deck'}
          </h3>
          <p style={{ color: 'var(--text-2)', fontSize: 14, marginTop: 0 }}>
            {progress.known} of {progress.total} cards marked as known. Ready to test yourself?
          </p>
          <button
            type="button"
            className="btn btn--primary btn--lg"
            onClick={() => navigate(`/decks/${deck.id}/quiz`)}
          >
            Take the quiz →
          </button>
        </div>
      )}

      <p className="field-hint" style={{ textAlign: 'center', marginTop: 24 }}>
        Shortcuts: <kbd>Space</kbd> flip · <kbd>←</kbd> <kbd>→</kbd> navigate · <kbd>K</kbd> known ·{' '}
        <kbd>L</kbd> still learning
      </p>
    </main>
  );
}
