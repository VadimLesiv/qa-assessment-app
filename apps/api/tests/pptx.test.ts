import { describe, expect, it } from 'vitest';
import { parsePptx } from '../src/services/pptx.js';
import { buildPptx } from './helpers/pptx.js';

describe('parsePptx', () => {
  it('turns each slide into a card, with the title on the front', async () => {
    const buffer = await buildPptx([
      { title: 'What is boundary value analysis?', bullets: ['Test the edges', 'Off-by-one errors cluster there'] },
      { title: 'What is equivalence partitioning?', bullets: ['Group equivalent inputs'] },
    ]);

    const preview = await parsePptx(buffer, 'techniques.pptx');

    expect(preview.slideCount).toBe(2);
    expect(preview.cards).toHaveLength(2);

    const [first] = preview.cards;
    expect(first?.front).toBe('What is boundary value analysis?');
    expect(first?.bullets).toEqual(['Test the edges', 'Off-by-one errors cluster there']);
    expect(first?.back).toContain('Test the edges');
    expect(first?.sourceSlide).toBe(1);
  });

  it('captures speaker notes when the slide has them', async () => {
    const buffer = await buildPptx([
      { title: 'Severity vs Priority', bullets: ['Different axes'], notes: 'Ask for a concrete example here.' },
    ]);

    const preview = await parsePptx(buffer, 'defects.pptx');

    expect(preview.cards[0]?.notes).toBe('Ask for a concrete example here.');
  });

  it('falls back to the notes when a slide has a title but no bullets', async () => {
    const buffer = await buildPptx([{ title: 'Title only slide', notes: 'The real content lives here.' }]);

    const preview = await parsePptx(buffer, 'sparse.pptx');

    expect(preview.cards[0]?.back).toBe('The real content lives here.');
  });

  it('preserves slide order even though zip entries are unordered', async () => {
    const slides = Array.from({ length: 12 }, (_, i) => ({ title: `Slide ${i + 1}`, bullets: ['x'] }));
    const buffer = await buildPptx(slides);

    const preview = await parsePptx(buffer, 'ordered.pptx');

    // Naive string sorting would place slide10 before slide2.
    expect(preview.cards.map((c) => c.sourceSlide)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(preview.cards[9]?.front).toBe('Slide 10');
  });

  it('rejects a file that is not a zip archive', async () => {
    await expect(parsePptx(Buffer.from('this is not a pptx'), 'bad.pptx')).rejects.toThrow(
      /not a readable .pptx archive/,
    );
  });

  it('rejects a presentation with no slides', async () => {
    const buffer = await buildPptx([]);

    await expect(parsePptx(buffer, 'empty.pptx')).rejects.toThrow(/No slides/);
  });

  it('escapes and restores XML-special characters in slide text', async () => {
    const buffer = await buildPptx([{ title: 'Is a < b && b > c?', bullets: ['Use "quotes" carefully'] }]);

    const preview = await parsePptx(buffer, 'entities.pptx');

    expect(preview.cards[0]?.front).toBe('Is a < b && b > c?');
    expect(preview.cards[0]?.bullets[0]).toBe('Use "quotes" carefully');
  });
});
