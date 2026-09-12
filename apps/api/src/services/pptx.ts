import { XMLParser } from 'fast-xml-parser';
import unzipper from 'unzipper';
import type { ImportedCard, ImportPreview } from '@qa/shared';
import { HttpError } from '../lib/errors.js';

/**
 * Minimal .pptx reader.
 *
 * A .pptx is a ZIP archive of XML parts. Slide text lives in `ppt/slides/slideN.xml`
 * inside `<a:t>` elements, and speaker notes in the parallel `notesSlideN.xml`.
 * We read only those, which avoids pulling in a heavyweight Office library.
 *
 * Heuristic: the first text run on a slide becomes the card front (the title),
 * and the remaining runs become the bullets shown on the back.
 */

const SLIDE_PATH = /^ppt\/slides\/slide(\d+)\.xml$/;
const NOTES_PATH = /^ppt\/notesSlides\/notesSlide(\d+)\.xml$/;

const parser = new XMLParser({
  ignoreAttributes: true,
  // Without this a slide with one text run yields a string where we expect an array.
  isArray: (name) => name === 'a:t' || name === 'a:p' || name === 'a:r',
  parseTagValue: false,
  trimValues: true,
});

/** Depth-first walk collecting every `<a:t>` text value in document order. */
function collectText(node: unknown, out: string[]): void {
  if (node === null || node === undefined) return;

  if (typeof node === 'string') {
    const trimmed = node.trim();
    if (trimmed) out.push(trimmed);
    return;
  }

  if (Array.isArray(node)) {
    for (const child of node) collectText(child, out);
    return;
  }

  if (typeof node === 'object') {
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      if (key === 'a:t') collectText(value, out);
      else if (key.startsWith('a:') || key.startsWith('p:')) collectText(value, out);
    }
  }
}

function textFromXml(xml: string): string[] {
  const out: string[] = [];
  collectText(parser.parse(xml), out);
  return out;
}

/** Reads the XML parts we care about out of the archive, keyed by entry path. */
async function readParts(buffer: Buffer): Promise<Map<string, string>> {
  let directory: unzipper.CentralDirectory;
  try {
    directory = await unzipper.Open.buffer(buffer);
  } catch {
    throw HttpError.badRequest('That file is not a readable .pptx archive');
  }

  const parts = new Map<string, string>();
  await Promise.all(
    directory.files
      .filter((f) => SLIDE_PATH.test(f.path) || NOTES_PATH.test(f.path))
      .map(async (f) => {
        const content = await f.buffer();
        parts.set(f.path, content.toString('utf8'));
      }),
  );

  return parts;
}

/**
 * Parses a .pptx buffer into draft cards. Nothing is written to the database
 * here - the caller decides whether to persist the preview.
 */
export async function parsePptx(buffer: Buffer, fileName: string): Promise<ImportPreview> {
  const parts = await readParts(buffer);

  const slideNumbers = [...parts.keys()]
    .map((path) => SLIDE_PATH.exec(path)?.[1])
    .filter((n): n is string => Boolean(n))
    .map(Number)
    .sort((a, b) => a - b);

  if (slideNumbers.length === 0) {
    throw HttpError.badRequest('No slides were found in that presentation');
  }

  const cards: ImportedCard[] = [];

  for (const n of slideNumbers) {
    const slideXml = parts.get(`ppt/slides/slide${n}.xml`);
    if (!slideXml) continue;

    const runs = textFromXml(slideXml);
    if (runs.length === 0) continue; // image-only slide, nothing to study

    const [title, ...rest] = runs;
    const notesXml = parts.get(`ppt/notesSlides/notesSlide${n}.xml`);
    // Notes slides repeat the slide number as a text run; drop pure-digit runs.
    const notes = notesXml
      ? textFromXml(notesXml)
          .filter((t) => !/^\d+$/.test(t))
          .join('\n')
          .trim()
      : '';

    cards.push({
      front: title ?? `Slide ${n}`,
      back: rest.join('\n') || notes || 'No additional detail on this slide.',
      bullets: rest,
      notes: notes || null,
      sourceSlide: n,
    });
  }

  if (cards.length === 0) {
    throw HttpError.badRequest('Every slide in that presentation was empty of text');
  }

  return { fileName, slideCount: slideNumbers.length, cards };
}
