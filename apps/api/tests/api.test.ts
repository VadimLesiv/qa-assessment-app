import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { buildPptx } from './helpers/pptx.js';

const app = createApp();

/** Creates a section + deck and returns both ids, for tests that need a target. */
async function makeDeck(name = 'Test Deck') {
  const section = await request(app)
    .post('/api/sections')
    .send({ name: `Section ${Math.random().toString(36).slice(2, 8)}`, track: 'TECHNICAL' })
    .expect(201);

  const deck = await request(app)
    .post(`/api/sections/${section.body.data.id}/subsections`)
    .send({ name })
    .expect(201);

  return { sectionId: section.body.data.id as string, deckId: deck.body.data.id as string };
}

beforeEach(async () => {
  // Deleting sections cascades to decks, cards, questions and progress.
  await prisma.section.deleteMany();
  await prisma.quizAttempt.deleteMany();
  await prisma.earnedBadge.deleteMany();
  await prisma.player.updateMany({ data: { xp: 0, streakDays: 0, lastActiveAt: null } });
});

describe('GET /api/health', () => {
  it('reports ok', async () => {
    const response = await request(app).get('/api/health').expect(200);
    expect(response.body.status).toBe('ok');
  });
});

describe('sections', () => {
  it('creates a section and derives a unique slug', async () => {
    const first = await request(app)
      .post('/api/sections')
      .send({ name: 'Test Design', track: 'TECHNICAL' })
      .expect(201);
    const second = await request(app)
      .post('/api/sections')
      .send({ name: 'Test Design', track: 'TECHNICAL' })
      .expect(201);

    expect(first.body.data.slug).toBe('test-design');
    // A duplicate name must not collide on the unique slug column.
    expect(second.body.data.slug).toBe('test-design-2');
  });

  it('rejects an invalid track', async () => {
    const response = await request(app)
      .post('/api/sections')
      .send({ name: 'Nope', track: 'SOMETHING_ELSE' })
      .expect(400);

    expect(response.body.error.code).toBe('VALIDATION_FAILED');
    expect(response.body.error.details.track).toBeDefined();
  });

  it('rejects a blank name', async () => {
    const response = await request(app).post('/api/sections').send({ name: '   ', track: 'PROCESS' }).expect(400);
    expect(response.body.error.details.name).toContain('Name is required');
  });

  it('filters the list by track', async () => {
    await request(app).post('/api/sections').send({ name: 'P', track: 'PROCESS' }).expect(201);
    await request(app).post('/api/sections').send({ name: 'T', track: 'TECHNICAL' }).expect(201);

    const response = await request(app).get('/api/sections?track=PROCESS').expect(200);

    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].name).toBe('P');
  });

  it('renames a section via PUT and keeps the slug in step', async () => {
    const created = await request(app)
      .post('/api/sections')
      .send({ name: 'Old Name', track: 'PROCESS' })
      .expect(201);

    const updated = await request(app)
      .put(`/api/sections/${created.body.data.id}`)
      .send({ name: 'New Name' })
      .expect(200);

    expect(updated.body.data.name).toBe('New Name');
    expect(updated.body.data.slug).toBe('new-name');
  });

  it('returns 404 for a section that does not exist', async () => {
    await request(app).get('/api/sections/does-not-exist').expect(404);
    await request(app).put('/api/sections/does-not-exist').send({ name: 'x' }).expect(404);
    await request(app).delete('/api/sections/does-not-exist').expect(404);
  });

  it('cascades a delete down to cards', async () => {
    const { sectionId, deckId } = await makeDeck();
    await request(app).post(`/api/subsections/${deckId}/cards`).send({ front: 'F', back: 'B' }).expect(201);

    await request(app).delete(`/api/sections/${sectionId}`).expect(204);

    expect(await prisma.subSection.count({ where: { id: deckId } })).toBe(0);
    expect(await prisma.card.count({ where: { subSectionId: deckId } })).toBe(0);
  });
});

describe('sub-sections', () => {
  it('creates a deck under a section', async () => {
    const { deckId } = await makeDeck('Boundary Values');
    const response = await request(app).get(`/api/subsections/${deckId}`).expect(200);

    expect(response.body.data.name).toBe('Boundary Values');
    expect(response.body.data.cards).toEqual([]);
  });

  it('refuses to create a deck under a missing section', async () => {
    await request(app).post('/api/sections/nope/subsections').send({ name: 'Orphan' }).expect(404);
  });

  it('moves a deck to a different section', async () => {
    const a = await makeDeck();
    const b = await makeDeck();

    const response = await request(app)
      .put(`/api/subsections/${a.deckId}`)
      .send({ sectionId: b.sectionId })
      .expect(200);

    expect(response.body.data.sectionId).toBe(b.sectionId);
  });

  it('rejects a move to a section that does not exist', async () => {
    const { deckId } = await makeDeck();
    await request(app).put(`/api/subsections/${deckId}`).send({ sectionId: 'ghost' }).expect(400);
  });
});

describe('cards', () => {
  it('supports the full GET / PUT / DELETE lifecycle', async () => {
    const { deckId } = await makeDeck();

    const created = await request(app)
      .post(`/api/subsections/${deckId}/cards`)
      .send({ front: 'What is QA?', back: 'Quality Assurance', bullets: ['one', 'two'] })
      .expect(201);
    const cardId = created.body.data.id;
    expect(created.body.data.bullets).toEqual(['one', 'two']);

    const fetched = await request(app).get(`/api/cards/${cardId}`).expect(200);
    expect(fetched.body.data.front).toBe('What is QA?');
    expect(fetched.body.data.status).toBe('NEW');

    const updated = await request(app)
      .put(`/api/cards/${cardId}`)
      .send({ front: 'What is Quality Assurance?', bullets: ['only one'] })
      .expect(200);
    expect(updated.body.data.front).toBe('What is Quality Assurance?');
    expect(updated.body.data.bullets).toEqual(['only one']);
    // An untouched field must survive a partial update.
    expect(updated.body.data.back).toBe('Quality Assurance');

    await request(app).delete(`/api/cards/${cardId}`).expect(204);
    await request(app).get(`/api/cards/${cardId}`).expect(404);
  });

  it('rejects an empty update', async () => {
    const { deckId } = await makeDeck();
    const created = await request(app)
      .post(`/api/subsections/${deckId}/cards`)
      .send({ front: 'F', back: 'B' })
      .expect(201);

    await request(app).put(`/api/cards/${created.body.data.id}`).send({}).expect(400);
  });

  it('keeps insertion order', async () => {
    const { deckId } = await makeDeck();
    for (const front of ['first', 'second', 'third']) {
      await request(app).post(`/api/subsections/${deckId}/cards`).send({ front, back: 'x' }).expect(201);
    }

    const response = await request(app).get(`/api/subsections/${deckId}/cards`).expect(200);
    expect(response.body.data.map((c: { front: string }) => c.front)).toEqual(['first', 'second', 'third']);
  });
});

describe('card progress and XP', () => {
  it('awards XP for a first flip and for mastering a card', async () => {
    const { deckId } = await makeDeck();
    const created = await request(app)
      .post(`/api/subsections/${deckId}/cards`)
      .send({ front: 'F', back: 'B' })
      .expect(201);

    const response = await request(app)
      .put(`/api/cards/${created.body.data.id}/progress`)
      .send({ status: 'KNOWN', flipped: true })
      .expect(200);

    // 5 XP for the first flip + 15 for marking it known.
    expect(response.body.data.xpEarned).toBe(20);
    expect(response.body.data.status).toBe('KNOWN');
    expect(response.body.data.deckProgress.percent).toBe(100);
  });

  it('does not award XP twice for the same card', async () => {
    const { deckId } = await makeDeck();
    const created = await request(app)
      .post(`/api/subsections/${deckId}/cards`)
      .send({ front: 'F', back: 'B' })
      .expect(201);
    const url = `/api/cards/${created.body.data.id}/progress`;

    await request(app).put(url).send({ status: 'KNOWN', flipped: true }).expect(200);
    const second = await request(app).put(url).send({ status: 'KNOWN', flipped: true }).expect(200);

    expect(second.body.data.xpEarned).toBe(0);
  });

  it('unlocks the deck-completion badge only when every card is known', async () => {
    const { deckId } = await makeDeck();
    const ids: string[] = [];
    for (const front of ['a', 'b']) {
      const created = await request(app)
        .post(`/api/subsections/${deckId}/cards`)
        .send({ front, back: 'x' })
        .expect(201);
      ids.push(created.body.data.id);
    }

    const first = await request(app)
      .put(`/api/cards/${ids[0]}/progress`)
      .send({ status: 'KNOWN', flipped: true })
      .expect(200);
    expect(first.body.data.newBadges.map((b: { code: string }) => b.code)).not.toContain('DECK_DONE');

    const second = await request(app)
      .put(`/api/cards/${ids[1]}/progress`)
      .send({ status: 'KNOWN', flipped: true })
      .expect(200);
    expect(second.body.data.newBadges.map((b: { code: string }) => b.code)).toContain('DECK_DONE');
  });

  it('rejects an unknown status', async () => {
    const { deckId } = await makeDeck();
    const created = await request(app)
      .post(`/api/subsections/${deckId}/cards`)
      .send({ front: 'F', back: 'B' })
      .expect(201);

    await request(app).put(`/api/cards/${created.body.data.id}/progress`).send({ status: 'MASTERED' }).expect(400);
  });
});

describe('quiz', () => {
  /** Seeds a deck with one question and returns its id and correct index. */
  async function makeQuestion(deckId: string, correctIndex = 1) {
    const response = await request(app)
      .post(`/api/subsections/${deckId}/quiz/questions`)
      .send({
        prompt: 'Which method is idempotent?',
        options: ['POST', 'PUT', 'PATCH', 'CONNECT'],
        correctIndex,
        explanation: 'PUT replaces the resource, so repeating it changes nothing.',
        difficulty: 'MEDIUM',
      })
      .expect(201);

    return response.body.data.id as string;
  }

  it('never exposes the correct answer while the quiz is being taken', async () => {
    const { deckId } = await makeDeck();
    await makeQuestion(deckId);

    const response = await request(app).get(`/api/subsections/${deckId}/quiz`).expect(200);

    expect(response.body.data[0].correctIndex).toBeUndefined();
    expect(response.body.data[0].explanation).toBeNull();
  });

  it('rejects a question whose correctIndex is out of range', async () => {
    const { deckId } = await makeDeck();

    const response = await request(app)
      .post(`/api/subsections/${deckId}/quiz/questions`)
      .send({ prompt: 'p', options: ['a', 'b'], correctIndex: 5 })
      .expect(400);

    expect(response.body.error.details.correctIndex).toBeDefined();
  });

  it('grades a submission and awards XP and stars', async () => {
    const { deckId } = await makeDeck();
    const questionId = await makeQuestion(deckId, 1);

    const response = await request(app)
      .post(`/api/subsections/${deckId}/quiz/attempts`)
      .send({ answers: [{ questionId, selectedIndex: 1 }], durationMs: 5000 })
      .expect(201);

    const { attempt, answers } = response.body.data;
    expect(attempt.score).toBe(1);
    expect(attempt.total).toBe(1);
    expect(attempt.stars).toBe(5);
    // 20 XP for a medium question + 50 perfect-quiz bonus.
    expect(attempt.xpEarned).toBe(70);
    expect(answers[0].correct).toBe(true);
    // The explanation is only revealed after grading.
    expect(answers[0].explanation).toContain('PUT replaces');
  });

  it('marks a wrong answer and reveals the correct index', async () => {
    const { deckId } = await makeDeck();
    const questionId = await makeQuestion(deckId, 1);

    const response = await request(app)
      .post(`/api/subsections/${deckId}/quiz/attempts`)
      .send({ answers: [{ questionId, selectedIndex: 0 }], durationMs: 3000 })
      .expect(201);

    expect(response.body.data.attempt.score).toBe(0);
    expect(response.body.data.attempt.stars).toBe(0);
    expect(response.body.data.answers[0].correctIndex).toBe(1);
  });

  it('refuses answers belonging to another deck', async () => {
    const a = await makeDeck();
    const b = await makeDeck();
    const foreignQuestion = await makeQuestion(b.deckId);

    await request(app)
      .post(`/api/subsections/${a.deckId}/quiz/attempts`)
      .send({ answers: [{ questionId: foreignQuestion, selectedIndex: 0 }], durationMs: 1000 })
      .expect(400);
  });

  it('generates a quiz from the deck cards once there are enough of them', async () => {
    const { deckId } = await makeDeck();
    for (let i = 1; i <= 5; i++) {
      await request(app)
        .post(`/api/subsections/${deckId}/cards`)
        .send({ front: `Term ${i}`, back: `Definition number ${i}` })
        .expect(201);
    }

    const response = await request(app).post(`/api/subsections/${deckId}/quiz/generate`).expect(201);
    expect(response.body.data.length).toBeGreaterThan(0);
    expect(response.body.data[0].options).toHaveLength(4);
  });

  it('will not generate a quiz from a deck with too few cards', async () => {
    const { deckId } = await makeDeck();
    await request(app).post(`/api/subsections/${deckId}/cards`).send({ front: 'a', back: 'b' }).expect(201);

    await request(app).post(`/api/subsections/${deckId}/quiz/generate`).expect(400);
  });

  it('deletes a question', async () => {
    const { deckId } = await makeDeck();
    const questionId = await makeQuestion(deckId);

    await request(app).delete(`/api/questions/${questionId}`).expect(204);
    const response = await request(app).get(`/api/subsections/${deckId}/quiz`).expect(200);
    expect(response.body.data).toHaveLength(0);
  });
});

describe('PowerPoint import', () => {
  it('previews a deck without saving anything', async () => {
    const { deckId } = await makeDeck();
    const buffer = await buildPptx([
      { title: 'Slide one', bullets: ['point a'] },
      { title: 'Slide two', bullets: ['point b'] },
    ]);

    const response = await request(app)
      .post(`/api/subsections/${deckId}/import?preview=true`)
      .attach('file', buffer, 'deck.pptx')
      .expect(200);

    expect(response.body.data.cards).toHaveLength(2);
    // Preview must not write to the database.
    expect(await prisma.card.count({ where: { subSectionId: deckId } })).toBe(0);
  });

  it('imports slides as cards and records the source slide number', async () => {
    const { deckId } = await makeDeck();
    const buffer = await buildPptx([
      { title: 'What is regression testing?', bullets: ['Re-run existing tests'], notes: 'Mention automation.' },
      { title: 'What is smoke testing?', bullets: ['A shallow, wide check'] },
    ]);

    const response = await request(app)
      .post(`/api/subsections/${deckId}/import`)
      .attach('file', buffer, 'deck.pptx')
      .expect(201);

    expect(response.body.data.imported).toBe(2);
    expect(response.body.data.newBadges.map((b: { code: string }) => b.code)).toContain('IMPORTER');

    const cards = await request(app).get(`/api/subsections/${deckId}/cards`).expect(200);
    expect(cards.body.data[0].front).toBe('What is regression testing?');
    expect(cards.body.data[0].sourceSlide).toBe(1);
    expect(cards.body.data[0].notes).toBe('Mention automation.');
  });

  it('appends to a deck that already has cards rather than replacing them', async () => {
    const { deckId } = await makeDeck();
    await request(app).post(`/api/subsections/${deckId}/cards`).send({ front: 'Manual', back: 'x' }).expect(201);

    const buffer = await buildPptx([{ title: 'Imported', bullets: ['y'] }]);
    await request(app).post(`/api/subsections/${deckId}/import`).attach('file', buffer, 'd.pptx').expect(201);

    const cards = await request(app).get(`/api/subsections/${deckId}/cards`).expect(200);
    expect(cards.body.data.map((c: { front: string }) => c.front)).toEqual(['Manual', 'Imported']);
  });

  it('rejects a file that is not a .pptx', async () => {
    const { deckId } = await makeDeck();

    await request(app)
      .post(`/api/subsections/${deckId}/import`)
      .attach('file', Buffer.from('hello'), 'notes.txt')
      .expect(415);
  });

  it('rejects a request with no file attached', async () => {
    const { deckId } = await makeDeck();
    await request(app).post(`/api/subsections/${deckId}/import`).expect(400);
  });
});

describe('progress rollup', () => {
  it('splits totals by track', async () => {
    const process = await request(app)
      .post('/api/sections')
      .send({ name: 'Proc', track: 'PROCESS' })
      .expect(201);
    const procDeck = await request(app)
      .post(`/api/sections/${process.body.data.id}/subsections`)
      .send({ name: 'D' })
      .expect(201);
    await request(app)
      .post(`/api/subsections/${procDeck.body.data.id}/cards`)
      .send({ front: 'a', back: 'b' })
      .expect(201);

    const response = await request(app).get('/api/progress').expect(200);

    expect(response.body.data.process.total).toBe(1);
    expect(response.body.data.technical.total).toBe(0);
    expect(response.body.data.overall.total).toBe(1);
  });
});

describe('unknown routes', () => {
  it('returns a structured 404', async () => {
    const response = await request(app).get('/api/nope').expect(404);
    expect(response.body.error.code).toBe('NOT_FOUND');
  });
});
