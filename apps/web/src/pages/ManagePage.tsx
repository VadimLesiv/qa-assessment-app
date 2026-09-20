import { useCallback, useEffect, useState } from 'react';
import type { DragEvent, KeyboardEvent } from 'react';
import type { Card, ImportPreview, Section, SectionTrack, SubSection } from '@qa/shared';
import { api, ApiRequestError } from '../lib/api';
import { plural } from '../lib/format';
import { moveDeck, moveSection } from '../lib/reorder';
import { ConfirmDialog, Modal } from '../components/Modal';
import { Empty, ErrorBanner, Loading } from '../components/States';
import { useToast } from '../components/Toast';

type SectionDraft = { id?: string; name: string; track: SectionTrack; description: string; icon: string; accent: string };
type DeckDraft = { id?: string; sectionId: string; name: string; description: string };
type CardDraft = { id?: string; front: string; back: string; bullets: string; notes: string };

/** What the user picked up. Decks remember their origin so a move can be named. */
type Drag = { kind: 'section'; id: string } | { kind: 'deck'; id: string; sectionId: string };

/** Where it would land: an insertion slot in the section list or in a deck list. */
type DropHint =
  | { kind: 'section'; index: number }
  | { kind: 'deck'; sectionId: string; index: number };

const ACCENTS = ['#7c3aed', '#22d3ee', '#fb7185', '#34d399', '#fbbf24', '#f472b6', '#60a5fa'];
const ICONS = ['📘', '🧭', '📋', '🔄', '🎯', '🤖', '🔌', '🧪', '🧠', '🚀', '🛡️', '⚙️'];

const emptySection = (): SectionDraft => ({
  name: '',
  track: 'PROCESS',
  description: '',
  icon: '📘',
  accent: '#7c3aed',
});

export function ManagePage() {
  const [sections, setSections] = useState<Section[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [sectionDraft, setSectionDraft] = useState<SectionDraft | null>(null);
  const [deckDraft, setDeckDraft] = useState<DeckDraft | null>(null);
  const [cardDraft, setCardDraft] = useState<CardDraft | null>(null);
  const [confirm, setConfirm] = useState<{ title: string; description: string; run: () => Promise<void> } | null>(null);

  /** The deck whose cards are currently open in the editor panel. */
  const [openDeck, setOpenDeck] = useState<{ deck: SubSection; cards: Card[] } | null>(null);
  const [importTarget, setImportTarget] = useState<SubSection | null>(null);

  const [drag, setDrag] = useState<Drag | null>(null);
  const [hint, setHint] = useState<DropHint | null>(null);

  const toast = useToast();

  const reload = useCallback(async () => {
    try {
      setSections(await api.listSections());
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not load the curriculum');
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  /** Wraps a mutation with busy state, error toasts and a refresh. */
  const run = async (action: () => Promise<void>, successMessage?: string) => {
    setBusy(true);
    try {
      await action();
      await reload();
      if (successMessage) toast.info(successMessage);
    } catch (err) {
      toast.error(err instanceof ApiRequestError ? err.fieldSummary : 'The change could not be saved');
    } finally {
      setBusy(false);
    }
  };

  const refreshOpenDeck = async (deckId: string) => {
    const cards = await api.listCards(deckId);
    setOpenDeck((current) => (current && current.deck.id === deckId ? { ...current, cards } : current));
  };

  /* ---------------------------------------------------------------- */
  /* Drag & drop reordering                                            */
  /* ---------------------------------------------------------------- */

  const clearDrag = () => {
    setDrag(null);
    setHint(null);
  };

  /**
   * Paints the new order straight away and rolls back if the server rejects it,
   * so a drag never leaves the list looking like it snapped back for no reason.
   */
  const commitOrder = async (next: Section[], save: () => Promise<void>, message: string) => {
    const previous = sections;
    setSections(next);
    try {
      await save();
      toast.info(message);
    } catch (err) {
      setSections(previous);
      toast.error(err instanceof ApiRequestError ? err.fieldSummary : 'The new order could not be saved');
    }
  };

  const applySectionMove = (sectionId: string, insertAt: number) => {
    if (!sections) return;
    const move = moveSection(sections, sectionId, insertAt);
    if (move) void commitOrder(move.sections, () => api.reorderSections(move.ids), 'Section order saved');
  };

  const applyDeckMove = (deckId: string, fromSectionId: string, toSectionId: string, insertAt: number) => {
    if (!sections) return;
    const move = moveDeck(sections, deckId, toSectionId, insertAt);
    if (!move) return;
    void commitOrder(
      move.sections,
      () => api.reorderSubSections(move.groups),
      fromSectionId === toSectionId ? 'Deck order saved' : 'Deck moved to another section',
    );
  };

  const startDrag = (event: DragEvent<HTMLElement>, next: Drag) => {
    event.dataTransfer.effectAllowed = 'move';
    // Firefox will not start a drag unless the payload carries something.
    event.dataTransfer.setData('text/plain', next.id);
    // Drag the whole row rather than the little handle that was grabbed.
    const root = event.currentTarget.closest<HTMLElement>('[data-drag-root]');
    if (root) event.dataTransfer.setDragImage(root, 24, 24);
    setDrag(next);
  };

  /** Which half of the hovered row the pointer is in decides before vs. after. */
  const insertIndexFor = (event: DragEvent<HTMLElement>, index: number) => {
    const box = event.currentTarget.getBoundingClientRect();
    return event.clientY < box.top + box.height / 2 ? index : index + 1;
  };

  /** Anywhere on a section: reorders sections, or appends a dragged deck to it. */
  const onSectionDragOver = (event: DragEvent<HTMLElement>, section: Section, index: number) => {
    if (!drag) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    if (drag.kind === 'section') setHint({ kind: 'section', index: insertIndexFor(event, index) });
    else setHint({ kind: 'deck', sectionId: section.id, index: (section.subSections ?? []).length });
  };

  /** A deck row is a finer target than its section, so it stops the bubble. */
  const onDeckDragOver = (event: DragEvent<HTMLElement>, sectionId: string, index: number) => {
    if (drag?.kind !== 'deck') return;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = 'move';
    setHint({ kind: 'deck', sectionId, index: insertIndexFor(event, index) });
  };

  const onDrop = (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    if (drag?.kind === 'section' && hint?.kind === 'section') applySectionMove(drag.id, hint.index);
    else if (drag?.kind === 'deck' && hint?.kind === 'deck') {
      applyDeckMove(drag.id, drag.sectionId, hint.sectionId, hint.index);
    }
    clearDrag();
  };

  /**
   * Keyboard equivalent of a drag. Insertion slots sit between items, so moving
   * down one place means inserting two slots along.
   */
  const nudgeSection = (sectionId: string, delta: -1 | 1) => {
    if (!sections) return;
    const from = sections.findIndex((s) => s.id === sectionId);
    if (from + delta < 0 || from + delta >= sections.length) return;
    applySectionMove(sectionId, delta === -1 ? from - 1 : from + 2);
  };

  /** Past either end of its own section, a deck spills into the neighbouring one. */
  const nudgeDeck = (deckId: string, sectionId: string, delta: -1 | 1) => {
    if (!sections) return;
    const sectionIndex = sections.findIndex((s) => s.id === sectionId);
    const decks = sections[sectionIndex]?.subSections ?? [];
    const from = decks.findIndex((d) => d.id === deckId);
    const to = from + delta;

    if (to >= 0 && to < decks.length) {
      applyDeckMove(deckId, sectionId, sectionId, delta === -1 ? from - 1 : from + 2);
      return;
    }

    const neighbour = sections[sectionIndex + delta];
    if (!neighbour) return;
    applyDeckMove(deckId, sectionId, neighbour.id, delta === -1 ? (neighbour.subSections ?? []).length : 0);
  };

  const onHandleKeyDown = (event: KeyboardEvent<HTMLElement>, move: (delta: -1 | 1) => void) => {
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
    event.preventDefault();
    move(event.key === 'ArrowUp' ? -1 : 1);
  };

  if (error) {
    return (
      <main className="page">
        <ErrorBanner message={error} />
      </main>
    );
  }

  if (!sections) return <Loading label="Loading curriculum…" />;

  return (
    <main className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Manage content</h1>
          <p className="page-subtitle">
            Build your own curriculum: create sections and decks, write flashcards by hand, or import an
            existing PowerPoint presentation and turn every slide into a card. Drag the ⠿ handles to
            reorder sections and decks, or to move a deck into another section.
          </p>
        </div>
        <button type="button" className="btn btn--primary" onClick={() => setSectionDraft(emptySection())}>
          ＋ New section
        </button>
      </div>

      {sections.length === 0 ? (
        <Empty icon="📚" title="No sections yet">
          <button type="button" className="btn btn--primary btn--sm" onClick={() => setSectionDraft(emptySection())}>
            Create your first section
          </button>
        </Empty>
      ) : (
        <div
          className="stack"
          style={{ gap: 20 }}
          // Keeps the gaps between panels droppable: the last hint still stands,
          // so a release there lands where the drop line says it will.
          onDragOver={(e) => drag && e.preventDefault()}
          onDrop={onDrop}
        >
          {sections.map((section, sectionIndex) => (
            <div
              key={section.id}
              data-drag-root
              data-section-name={section.name}
              className={[
                'panel',
                'sortable',
                drag?.kind === 'section' && drag.id === section.id ? 'is-dragging' : '',
                hint?.kind === 'section' && hint.index === sectionIndex ? 'is-drop-before' : '',
                hint?.kind === 'section' && hint.index === sections.length && sectionIndex === sections.length - 1
                  ? 'is-drop-after'
                  : '',
                hint?.kind === 'deck' && hint.sectionId === section.id ? 'is-drop-into' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              onDragOver={(e) => onSectionDragOver(e, section, sectionIndex)}
              onDragEnd={clearDrag}
            >
              <div className="row" style={{ alignItems: 'flex-start' }}>
                <DragHandle
                  label={`Reorder section ${section.name}`}
                  onDragStart={(e) => startDrag(e, { kind: 'section', id: section.id })}
                  onDragEnd={clearDrag}
                  onKeyDown={(e) => onHandleKeyDown(e, (delta) => nudgeSection(section.id, delta))}
                />
                <span className="tile-icon" aria-hidden="true">
                  {section.icon ?? '📘'}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="row" style={{ gap: 9 }}>
                    <span style={{ fontWeight: 800, fontSize: 17 }}>{section.name}</span>
                    <span className={`pill pill--${section.track.toLowerCase()}`}>{section.track}</span>
                  </div>
                  {section.description && <div className="tile-desc">{section.description}</div>}
                </div>

                <div className="row" style={{ gap: 7 }}>
                  <button
                    type="button"
                    className="btn btn--sm"
                    onClick={() =>
                      setSectionDraft({
                        id: section.id,
                        name: section.name,
                        track: section.track,
                        description: section.description ?? '',
                        icon: section.icon ?? '📘',
                        accent: section.accent ?? '#7c3aed',
                      })
                    }
                  >
                    ✎ Rename
                  </button>
                  <button
                    type="button"
                    className="btn btn--sm"
                    onClick={() => setDeckDraft({ sectionId: section.id, name: '', description: '' })}
                  >
                    ＋ Deck
                  </button>
                  <button
                    type="button"
                    className="btn btn--danger btn--sm"
                    onClick={() =>
                      setConfirm({
                        title: `Delete "${section.name}"?`,
                        description: `This permanently removes the section, its ${section.subSections?.length ?? 0} deck(s), every card inside them, and all related progress. This cannot be undone.`,
                        run: async () => {
                          await api.deleteSection(section.id);
                          if (openDeck && section.subSections?.some((s) => s.id === openDeck.deck.id)) {
                            setOpenDeck(null);
                          }
                        },
                      })
                    }
                  >
                    🗑
                  </button>
                </div>
              </div>

              <div className="stack" style={{ marginTop: 16, gap: 9 }}>
                {(section.subSections ?? []).length === 0 ? (
                  <p className="field-hint">No decks in this section yet — drop one here to move it in.</p>
                ) : (
                  section.subSections!.map((deck, deckIndex) => (
                    <div
                      key={deck.id}
                      data-drag-root
                      data-deck-name={deck.name}
                      className={[
                        'deck-row',
                        'sortable',
                        drag?.kind === 'deck' && drag.id === deck.id ? 'is-dragging' : '',
                        hint?.kind === 'deck' && hint.sectionId === section.id && hint.index === deckIndex
                          ? 'is-drop-before'
                          : '',
                        hint?.kind === 'deck' &&
                        hint.sectionId === section.id &&
                        hint.index === section.subSections!.length &&
                        deckIndex === section.subSections!.length - 1
                          ? 'is-drop-after'
                          : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      style={{ padding: '12px 15px' }}
                      onDragOver={(e) => onDeckDragOver(e, section.id, deckIndex)}
                      onDragEnd={clearDrag}
                    >
                      <DragHandle
                        label={`Reorder deck ${deck.name}`}
                        onDragStart={(e) => startDrag(e, { kind: 'deck', id: deck.id, sectionId: section.id })}
                        onDragEnd={clearDrag}
                        onKeyDown={(e) => onHandleKeyDown(e, (delta) => nudgeDeck(deck.id, section.id, delta))}
                      />
                      <div className="deck-row-body">
                        <div className="deck-row-name" style={{ fontSize: 15 }}>
                          {deck.name}
                        </div>
                        <div className="deck-row-meta">
                          🃏 {plural(deck.cardCount ?? 0, 'card')} · 🎯{' '}
                          {plural(deck.quizQuestionCount ?? 0, 'question')}
                        </div>
                      </div>

                      <div className="row" style={{ gap: 6 }}>
                        <button
                          type="button"
                          className="btn btn--sm"
                          onClick={async () => {
                            const cards = await api.listCards(deck.id);
                            setOpenDeck({ deck, cards });
                          }}
                        >
                          Cards
                        </button>
                        <button type="button" className="btn btn--sm" onClick={() => setImportTarget(deck)}>
                          📥 Import
                        </button>
                        <button
                          type="button"
                          className="btn btn--sm"
                          onClick={() =>
                            setDeckDraft({
                              id: deck.id,
                              sectionId: section.id,
                              name: deck.name,
                              description: deck.description ?? '',
                            })
                          }
                        >
                          ✎
                        </button>
                        <button
                          type="button"
                          className="btn btn--danger btn--sm"
                          onClick={() =>
                            setConfirm({
                              title: `Delete "${deck.name}"?`,
                              description: `This removes the deck and all ${deck.cardCount ?? 0} of its cards permanently.`,
                              run: async () => {
                                await api.deleteSubSection(deck.id);
                                if (openDeck?.deck.id === deck.id) setOpenDeck(null);
                              },
                            })
                          }
                        >
                          🗑
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ---------------------------------------------------------------- */}
      {/* Card editor for the selected deck                                 */}
      {/* ---------------------------------------------------------------- */}
      {openDeck && (
        <div className="panel" style={{ marginTop: 28 }}>
          <div className="row">
            <h2 style={{ fontSize: 19, fontWeight: 800 }}>Cards in “{openDeck.deck.name}”</h2>
            <span className="spacer" />
            <button
              type="button"
              className="btn btn--primary btn--sm"
              onClick={() => setCardDraft({ front: '', back: '', bullets: '', notes: '' })}
            >
              ＋ Add card
            </button>
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => setOpenDeck(null)}>
              ✕ Close
            </button>
          </div>

          {openDeck.cards.length === 0 ? (
            <p className="field-hint" style={{ marginTop: 14 }}>
              No cards yet — add one by hand or import a .pptx deck.
            </p>
          ) : (
            <div className="stack" style={{ marginTop: 16, gap: 9 }}>
              {openDeck.cards.map((card, i) => (
                <div key={card.id} className="deck-row" style={{ padding: '12px 15px' }}>
                  <span style={{ color: 'var(--text-3)', fontWeight: 700, minWidth: 26 }}>{i + 1}</span>
                  <div className="deck-row-body">
                    <div className="deck-row-name" style={{ fontSize: 14 }}>
                      {card.front}
                    </div>
                    <div className="deck-row-meta">
                      {card.back.slice(0, 110)}
                      {card.back.length > 110 ? '…' : ''}
                    </div>
                  </div>
                  <div className="row" style={{ gap: 6 }}>
                    <button
                      type="button"
                      className="btn btn--sm"
                      onClick={() =>
                        setCardDraft({
                          id: card.id,
                          front: card.front,
                          back: card.back,
                          bullets: card.bullets.join('\n'),
                          notes: card.notes ?? '',
                        })
                      }
                    >
                      ✎
                    </button>
                    <button
                      type="button"
                      className="btn btn--danger btn--sm"
                      onClick={() =>
                        setConfirm({
                          title: 'Delete this card?',
                          description: card.front,
                          run: async () => {
                            await api.deleteCard(card.id);
                            await refreshOpenDeck(openDeck.deck.id);
                          },
                        })
                      }
                    >
                      🗑
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ---------------------------------------------------------------- */}
      {/* Modals                                                            */}
      {/* ---------------------------------------------------------------- */}

      {sectionDraft && (
        <SectionModal
          draft={sectionDraft}
          busy={busy}
          onChange={setSectionDraft}
          onClose={() => setSectionDraft(null)}
          onSave={() =>
            void run(async () => {
              const payload = {
                name: sectionDraft.name,
                track: sectionDraft.track,
                description: sectionDraft.description || null,
                icon: sectionDraft.icon,
                accent: sectionDraft.accent,
              };
              if (sectionDraft.id) await api.updateSection(sectionDraft.id, payload);
              else await api.createSection(payload);
              setSectionDraft(null);
            }, sectionDraft.id ? 'Section updated' : 'Section created')
          }
        />
      )}

      {deckDraft && (
        <Modal
          title={deckDraft.id ? 'Edit deck' : 'New deck'}
          description="Decks are the sub-sections inside a section. Each one holds its own cards and quiz."
          onClose={() => setDeckDraft(null)}
          footer={
            <>
              <button type="button" className="btn btn--ghost" onClick={() => setDeckDraft(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn btn--primary"
                disabled={busy || !deckDraft.name.trim()}
                onClick={() =>
                  void run(async () => {
                    const payload = { name: deckDraft.name, description: deckDraft.description || null };
                    if (deckDraft.id) await api.updateSubSection(deckDraft.id, payload);
                    else await api.createSubSection(deckDraft.sectionId, payload);
                    setDeckDraft(null);
                  }, deckDraft.id ? 'Deck updated' : 'Deck created')
                }
              >
                {busy ? 'Saving…' : 'Save'}
              </button>
            </>
          }
        >
          <div className="stack">
            <label className="field">
              <span className="field-label">Deck name</span>
              <input
                className="input"
                value={deckDraft.name}
                autoFocus
                placeholder="e.g. Boundary Value Analysis"
                onChange={(e) => setDeckDraft({ ...deckDraft, name: e.target.value })}
              />
            </label>
            <label className="field">
              <span className="field-label">Description (optional)</span>
              <textarea
                className="textarea"
                value={deckDraft.description}
                onChange={(e) => setDeckDraft({ ...deckDraft, description: e.target.value })}
              />
            </label>
          </div>
        </Modal>
      )}

      {cardDraft && openDeck && (
        <Modal
          title={cardDraft.id ? 'Edit card' : 'New card'}
          description="The front is the prompt the learner sees first. The back is revealed on the flip."
          onClose={() => setCardDraft(null)}
          footer={
            <>
              <button type="button" className="btn btn--ghost" onClick={() => setCardDraft(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn btn--primary"
                disabled={busy || !cardDraft.front.trim() || !cardDraft.back.trim()}
                onClick={() =>
                  void run(async () => {
                    const payload = {
                      front: cardDraft.front,
                      back: cardDraft.back,
                      notes: cardDraft.notes || null,
                      bullets: cardDraft.bullets
                        .split('\n')
                        .map((b) => b.trim())
                        .filter(Boolean),
                    };
                    if (cardDraft.id) await api.updateCard(cardDraft.id, payload);
                    else await api.createCard(openDeck.deck.id, payload);
                    await refreshOpenDeck(openDeck.deck.id);
                    setCardDraft(null);
                  }, cardDraft.id ? 'Card updated' : 'Card added')
                }
              >
                {busy ? 'Saving…' : 'Save card'}
              </button>
            </>
          }
        >
          <div className="stack">
            <label className="field">
              <span className="field-label">Front — the question</span>
              <textarea
                className="textarea"
                style={{ minHeight: 68 }}
                value={cardDraft.front}
                autoFocus
                placeholder="What is boundary value analysis?"
                onChange={(e) => setCardDraft({ ...cardDraft, front: e.target.value })}
              />
            </label>
            <label className="field">
              <span className="field-label">Back — the answer</span>
              <textarea
                className="textarea"
                value={cardDraft.back}
                placeholder="Testing at the edges of each equivalence partition…"
                onChange={(e) => setCardDraft({ ...cardDraft, back: e.target.value })}
              />
            </label>
            <label className="field">
              <span className="field-label">Bullet points (one per line)</span>
              <textarea
                className="textarea"
                style={{ minHeight: 76 }}
                value={cardDraft.bullets}
                placeholder={'Test just below the boundary\nTest on the boundary\nTest just above'}
                onChange={(e) => setCardDraft({ ...cardDraft, bullets: e.target.value })}
              />
            </label>
            <label className="field">
              <span className="field-label">Speaker notes (optional)</span>
              <textarea
                className="textarea"
                style={{ minHeight: 60 }}
                value={cardDraft.notes}
                onChange={(e) => setCardDraft({ ...cardDraft, notes: e.target.value })}
              />
            </label>
          </div>
        </Modal>
      )}

      {importTarget && (
        <ImportModal
          deck={importTarget}
          onClose={() => setImportTarget(null)}
          onDone={async () => {
            setImportTarget(null);
            await reload();
            if (openDeck?.deck.id === importTarget.id) await refreshOpenDeck(importTarget.id);
          }}
        />
      )}

      {confirm && (
        <ConfirmDialog
          title={confirm.title}
          description={confirm.description}
          busy={busy}
          onCancel={() => setConfirm(null)}
          onConfirm={() =>
            void run(async () => {
              await confirm.run();
              setConfirm(null);
            }, 'Deleted')
          }
        />
      )}
    </main>
  );
}

/* ------------------------------------------------------------------ */
/* Drag handle                                                         */
/* ------------------------------------------------------------------ */

/**
 * The grab point of a row. Only the handle is draggable, so the buttons and
 * text alongside it keep working normally; arrow keys are the no-mouse route.
 */
function DragHandle({
  label,
  onDragStart,
  onDragEnd,
  onKeyDown,
}: {
  label: string;
  onDragStart: (event: DragEvent<HTMLElement>) => void;
  onDragEnd: () => void;
  onKeyDown: (event: KeyboardEvent<HTMLElement>) => void;
}) {
  return (
    <span
      className="drag-handle"
      role="button"
      tabIndex={0}
      draggable
      aria-label={label}
      title="Drag to move — or focus and press ↑ / ↓"
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onKeyDown={onKeyDown}
    >
      ⠿
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Section modal                                                       */
/* ------------------------------------------------------------------ */

function SectionModal({
  draft,
  busy,
  onChange,
  onClose,
  onSave,
}: {
  draft: SectionDraft;
  busy: boolean;
  onChange: (draft: SectionDraft) => void;
  onClose: () => void;
  onSave: () => void;
}) {
  return (
    <Modal
      title={draft.id ? 'Edit section' : 'New section'}
      description="Sections are the top level of the curriculum and belong to either the Process or Technical track."
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn--primary" onClick={onSave} disabled={busy || !draft.name.trim()}>
            {busy ? 'Saving…' : 'Save'}
          </button>
        </>
      }
    >
      <div className="stack">
        <label className="field">
          <span className="field-label">Section name</span>
          <input
            className="input"
            value={draft.name}
            autoFocus
            placeholder="e.g. Test Design Techniques"
            onChange={(e) => onChange({ ...draft, name: e.target.value })}
          />
        </label>

        <label className="field">
          <span className="field-label">Track</span>
          <select
            className="select"
            value={draft.track}
            onChange={(e) => onChange({ ...draft, track: e.target.value as SectionTrack })}
          >
            <option value="PROCESS">Process</option>
            <option value="TECHNICAL">Technical</option>
          </select>
        </label>

        <label className="field">
          <span className="field-label">Description (optional)</span>
          <textarea
            className="textarea"
            style={{ minHeight: 64 }}
            value={draft.description}
            onChange={(e) => onChange({ ...draft, description: e.target.value })}
          />
        </label>

        <div className="field">
          <span className="field-label">Icon</span>
          <div className="row" style={{ gap: 6 }}>
            {ICONS.map((icon) => (
              <button
                key={icon}
                type="button"
                className="btn btn--sm"
                style={{
                  padding: '6px 10px',
                  fontSize: 18,
                  borderColor: draft.icon === icon ? 'var(--accent-bright)' : undefined,
                }}
                onClick={() => onChange({ ...draft, icon })}
                aria-label={`Use icon ${icon}`}
                aria-pressed={draft.icon === icon}
              >
                {icon}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <span className="field-label">Accent colour</span>
          <div className="row" style={{ gap: 8 }}>
            {ACCENTS.map((accent) => (
              <button
                key={accent}
                type="button"
                onClick={() => onChange({ ...draft, accent })}
                aria-label={`Use accent ${accent}`}
                aria-pressed={draft.accent === accent}
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: '50%',
                  background: accent,
                  cursor: 'pointer',
                  border: draft.accent === accent ? '3px solid var(--text-1)' : '2px solid transparent',
                }}
              />
            ))}
          </div>
        </div>
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* PowerPoint import modal                                             */
/* ------------------------------------------------------------------ */

function ImportModal({
  deck,
  onClose,
  onDone,
}: {
  deck: SubSection;
  onClose: () => void;
  onDone: () => Promise<void>;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  /** Parse first and show the user what will be created before writing anything. */
  const choose = async (selected: File) => {
    setFile(selected);
    setPreview(null);
    setBusy(true);
    try {
      setPreview(await api.previewImport(deck.id, selected));
    } catch (err) {
      toast.error(err instanceof ApiRequestError ? err.message : 'Could not read that presentation');
      setFile(null);
    } finally {
      setBusy(false);
    }
  };

  const commit = async () => {
    if (!file) return;
    setBusy(true);
    try {
      const result = await api.commitImport(deck.id, file);
      toast.info(`Imported ${result.imported} cards`, `from ${result.slideCount} slides`);
      toast.badges(result.newBadges);
      await onDone();
    } catch (err) {
      toast.error(err instanceof ApiRequestError ? err.message : 'Import failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={`Import a presentation into “${deck.name}”`}
      description="Each slide becomes one flashcard: the slide title is the front, and its bullet points and speaker notes make up the back."
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn--ghost" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="button" className="btn btn--primary" onClick={() => void commit()} disabled={!preview || busy}>
            {busy ? 'Importing…' : `Import ${preview?.cards.length ?? 0} cards`}
          </button>
        </>
      }
    >
      <label
        className={`dropzone${dragging ? ' is-dragging' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const dropped = e.dataTransfer.files[0];
          if (dropped) void choose(dropped);
        }}
      >
        <span className="dropzone-icon" aria-hidden="true">
          {file ? '📊' : '📥'}
        </span>
        <strong>{file ? file.name : 'Drop a .pptx file here'}</strong>
        <span className="field-hint">{file ? 'Click to choose a different file' : 'or click to browse'}</span>
        <input
          type="file"
          accept=".pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation"
          style={{ display: 'none' }}
          onChange={(e) => {
            const selected = e.target.files?.[0];
            if (selected) void choose(selected);
          }}
        />
      </label>

      {busy && !preview && <p className="field-hint" style={{ marginTop: 14 }}>Reading the presentation…</p>}

      {preview && (
        <div style={{ marginTop: 18 }}>
          <div className="row" style={{ marginBottom: 10 }}>
            <strong style={{ fontSize: 14 }}>Preview</strong>
            <span className="pill">
              {preview.cards.length} cards from {preview.slideCount} slides
            </span>
          </div>
          <div className="stack" style={{ gap: 7, maxHeight: 260, overflowY: 'auto' }}>
            {preview.cards.map((card) => (
              <div key={card.sourceSlide} className="deck-row" style={{ padding: '10px 13px' }}>
                <span style={{ color: 'var(--text-3)', fontWeight: 700, minWidth: 30, fontSize: 12 }}>
                  #{card.sourceSlide}
                </span>
                <div className="deck-row-body">
                  <div className="deck-row-name" style={{ fontSize: 14 }}>
                    {card.front}
                  </div>
                  <div className="deck-row-meta">
                    {card.bullets.length} bullet{card.bullets.length === 1 ? '' : 's'}
                    {card.notes ? ' · has notes' : ''}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </Modal>
  );
}
