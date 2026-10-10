import { prisma } from './prisma.js';
import { ZodError } from 'zod';

/** Built-in tracks, created the first time the track list is needed. */
export const DEFAULT_TRACKS = [
  {
    key: 'PROCESS',
    name: 'Process',
    blurb: 'Methodology, documentation and the way a QA team works.',
    icon: '🧭',
    color: '#2f8fa5',
    order: 0,
  },
  {
    key: 'TECHNICAL',
    name: 'Technical',
    blurb: 'Test design, automation, APIs and performance.',
    icon: '⚙️',
    color: '#e0707f',
    order: 1,
  },
];

/** Seeds Process and Technical on a database that has no tracks yet. */
export async function ensureDefaultTracks(): Promise<void> {
  if ((await prisma.track.count()) === 0) {
    await prisma.track.createMany({ data: DEFAULT_TRACKS, skipDuplicates: true });
  }
}

/** Throws a field-level 400 unless `key` names an existing track. */
export async function assertTrackExists(key: string): Promise<void> {
  await ensureDefaultTracks();
  const found = await prisma.track.findUnique({ where: { key }, select: { id: true } });
  if (!found) {
    throw new ZodError([{ code: 'custom', path: ['track'], message: `Unknown track "${key}"` }]);
  }
}

/** "Quality Metrics" -> "QUALITY_METRICS", suffixed _2, _3 ... when taken. */
export async function uniqueTrackKey(name: string): Promise<string> {
  const base =
    name
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '') || 'TRACK';
  for (let n = 1; ; n++) {
    const candidate = n === 1 ? base : `${base}_${n}`;
    if (!(await prisma.track.findUnique({ where: { key: candidate }, select: { id: true } }))) return candidate;
  }
}
