/**
 * Pure list maths behind the drag-and-drop reordering on the Manage page.
 *
 * Each function returns the new tree plus the payload the API needs, so the UI
 * can paint the result immediately and persist exactly what it painted.
 */

import type { Section, SubSection } from '@qa/shared';

/** Moves the item at `from` to sit at `to` in a copy of `list`. */
export function moveItem<T>(list: T[], from: number, to: number): T[] {
  const next = [...list];
  const [item] = next.splice(from, 1);
  if (item === undefined) return list;
  next.splice(to, 0, item);
  return next;
}

/**
 * Translates "dropped at insertion index `to`" into a plain move index.
 * Removing the item first shifts everything after it up by one.
 */
function toMoveIndex(from: number, insertAt: number): number {
  return insertAt > from ? insertAt - 1 : insertAt;
}

export interface SectionMove {
  sections: Section[];
  /** Section ids in their new order, ready for `api.reorderSections`. */
  ids: string[];
}

/** Reorders the section list, where `insertAt` is a slot *between* sections. */
export function moveSection(sections: Section[], sectionId: string, insertAt: number): SectionMove | null {
  const from = sections.findIndex((s) => s.id === sectionId);
  if (from === -1) return null;

  const to = toMoveIndex(from, insertAt);
  if (to === from) return null;

  const next = moveItem(sections, from, to);
  return { sections: next, ids: next.map((s) => s.id) };
}

export interface DeckMove {
  sections: Section[];
  /** The complete final deck list of every section the move touched. */
  groups: { sectionId: string; subSectionIds: string[] }[];
}

const decksOf = (section: Section): SubSection[] => section.subSections ?? [];

/**
 * Moves a deck to `insertAt` within `targetSectionId`, which may be the section
 * it already lives in (a reorder) or a different one (a move).
 */
export function moveDeck(
  sections: Section[],
  deckId: string,
  targetSectionId: string,
  insertAt: number,
): DeckMove | null {
  const source = sections.find((s) => decksOf(s).some((d) => d.id === deckId));
  const target = sections.find((s) => s.id === targetSectionId);
  if (!source || !target) return null;

  const from = decksOf(source).findIndex((d) => d.id === deckId);
  const deck = decksOf(source)[from]!;

  if (source.id === target.id) {
    const to = toMoveIndex(from, insertAt);
    if (to === from) return null;

    const decks = moveItem(decksOf(source), from, to);
    return {
      sections: sections.map((s) => (s.id === source.id ? { ...s, subSections: decks } : s)),
      groups: [{ sectionId: source.id, subSectionIds: decks.map((d) => d.id) }],
    };
  }

  const sourceDecks = decksOf(source).filter((d) => d.id !== deckId);
  const targetDecks = [...decksOf(target)];
  targetDecks.splice(insertAt, 0, { ...deck, sectionId: target.id });

  return {
    sections: sections.map((s) => {
      if (s.id === source.id) return { ...s, subSections: sourceDecks };
      if (s.id === target.id) return { ...s, subSections: targetDecks };
      return s;
    }),
    groups: [
      { sectionId: source.id, subSectionIds: sourceDecks.map((d) => d.id) },
      { sectionId: target.id, subSectionIds: targetDecks.map((d) => d.id) },
    ],
  };
}
