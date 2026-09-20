import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { buildPptx } from './helpers/pptx.js';

const app = createApp();

let token: string;

/** Every route that touches player state now requires a bearer token. */
function api() {
  return {
    get: (url: string) => request(app).get(url).set('Authorization', `Bearer ${token}`),
    post: (url: string) => request(app).post(url).set('Authorization', `Bearer ${token}`),
    put: (url: string) => request(app).put(url).set('Authorization', `Bearer ${token}`),
    delete: (url: string) => request(app).delete(url).set('Authorization', `Bearer ${token}`),
  };
}

/** Creates a section + deck and returns both ids, for tests that need a target. */
async function makeDeck(name = 'Test Deck') {
  const section = await api()
    .post('/api/sections')
    .send({ name: `Section ${Math.random().toString(36).slice(2, 8)}`, track: 'TECHNICAL' })
    .expect(201);

  const deck = await api()
    .post(`/api/sections/${section.body.data.id}/subsections`)
    .send({ name })
    .expect(201);

  return { sectionId: section.body.data.id as string, deckId: deck.body.data.id as string };
}

/** Adds one more deck to an existing section and returns its id. */
async function addDeck(sectionId: string, name: string) {
  const deck = await api().post(`/api/sections/${sectionId}/subsections`).send({ name }).expect(201);
  return deck.body.data.id as string;
}

beforeEach(async () => {
  // Deleting sections cascades to decks, cards, questions and progress.
  await prisma.section.deleteMany();
  await prisma.quizAttempt.deleteMany();
  await prisma.earnedBadge.deleteMany();
  await prisma.player.deleteMany();

  const registered = await request(app)
    .post('/api/auth/register')
    .send({ name: 'Tester', email: `tester-${Math.random().toString(36).slice(2)}@example.com`, password: 'password123' })
    .expect(201);
  token = registered.body.data.token;
});

describe('GET /api/health', () => {
  it('reports ok', async () => {
    const response = await request(app).get('/api/health').expect(200);
    expect(response.body.status).toBe('ok');
  });
});

describe('sections', () => {
  it('creates a section and derives a unique slug', async () => {
    const first = await api()
      .post('/api/sections')
      .send({ name: 'Test Design', track: 'TECHNICAL' })
      .expect(201);
    const second = await api()
      .post('/api/sections')
      .send({ name: 'Test Design', track: 'TECHNICAL' })
      .expect(201);

    expect(first.body.data.slug).toBe('test-design');
    // A duplicate name must not collide on the unique slug column.
    expect(second.body.data.slug).toBe('test-design-2');
  });

  it('rejects an invalid track', async () => {
    const response = await api()
      .post('/api/sections')
      .send({ name: 'Nope', track: 'SOMETHING_ELSE' })
      .expect(400);

    expect(response.body.error.code).toBe('VALIDATION_FAILED');
    expect(response.body.error.details.track).toBeDefined();
  });

  it('rejects a blank name', async () => {
    const response = await api().post('/api/sections').send({ name: '   ', track: 'PROCESS' }).expect(400);
    expect(response.body.error.details.name).toContain('Name is required');
  });

  it('filters the list by track', async () => {
    await api().post('/api/sections').send({ name: 'P', track: 'PROCESS' }).expect(201);
    await api().post('/api/sections').send({ name: 'T', track: 'TECHNICAL' }).expect(201);

    const response = await api().get('/api/sections?track=PROCESS').expect(200);

    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].name).toBe('P');
  });

  it('renames a section via PUT and keeps the slug in step', async () => {
    const created = await api()
      .post('/api/sections')
      .send({ name: 'Old Name', track: 'PROCESS' })
      .expect(201);

    const updated = await api()
      .put(`/api/sections/${created.body.data.id}`)
      .send({ name: 'New Name' })
      .expect(200);

    expect(updated.body.data.name).toBe('New Name');
    expect(updated.body.data.slug).toBe('new-name');
  });

  it('returns 404 for a section that does not exist', async () => {
    await api().get('/api/sections/does-not-exist').expect(404);
    await api().put('/api/sections/does-not-exist').send({ name: 'x' }).expect(404);
    await api().delete('/api/sections/does-not-exist').expect(404);
  });

  it('reorders sections to match the ids it is given', async () => {
    const ids: string[] = [];
    for (const name of ['First', 'Second', 'Third']) {
      const created = await api().post('/api/sections').send({ name, track: 'PROCESS' }).expect(201);
      ids.push(created.body.data.id);
    }

    // Drag the last section to the front.
    await api()
      .put('/api/sections/reorder')
      .send({ ids: [ids[2], ids[0], ids[1]] })
      .expect(204);

    const listed = await api().get('/api/sections').expect(200);
    expect(listed.body.data.map((s: { name: string }) => s.name)).toEqual(['Third', 'First', 'Second']);
    expect(listed.body.data.map((s: { order: number }) => s.order)).toEqual([0, 1, 2]);
  });

  it('rejects a reorder naming an unknown or duplicated section', async () => {
    const created = await api().post('/api/sections').send({ name: 'Only', track: 'PROCESS' }).expect(201);
    const id = created.body.data.id;

    await api().put('/api/sections/reorder').send({ ids: [id, 'ghost'] }).expect(400);
    await api().put('/api/sections/reorder').send({ ids: [id, id] }).expect(400);
    await api().put('/api/sections/reorder').send({ ids: [] }).expect(400);
  });

  it('cascades a delete down to cards', async () => {
    const { sectionId, deckId } = await makeDeck();
    await api().post(`/api/subsections/${deckId}/cards`).send({ front: 'F', back: 'B' }).expect(201);

    await api().delete(`/api/sections/${sectionId}`).expect(204);

    expect(await prisma.subSection.count({ where: { id: deckId } })).toBe(0);
    expect(await prisma.card.count({ where: { subSectionId: deckId } })).toBe(0);
  });
});

describe('sub-sections', () => {
  it('creates a deck under a section', async () => {
    const { deckId } = await makeDeck('Boundary Values');
    const response = await api().get(`/api/subsections/${deckId}`).expect(200);

    expect(response.body.data.name).toBe('Boundary Values');
    expect(response.body.data.cards).toEqual([]);
  });

  it('refuses to create a deck under a missing section', async () => {
    await api().post('/api/sections/nope/subsections').send({ name: 'Orphan' }).expect(404);
  });

  it('moves a deck to a different section', async () => {
    const a = await makeDeck();
    const b = await makeDeck();

    const response = await api()
      .put(`/api/subsections/${a.deckId}`)
      .send({ sectionId: b.sectionId })
      .expect(200);

    expect(response.body.data.sectionId).toBe(b.sectionId);
  });

  it('rejects a move to a section that does not exist', async () => {
    const { deckId } = await makeDeck();
    await api().put(`/api/subsections/${deckId}`).send({ sectionId: 'ghost' }).expect(400);
  });

  it('reorders decks inside one section', async () => {
    const { sectionId, deckId: first } = await makeDeck('First');
    const second = await addDeck(sectionId, 'Second');
    const third = await addDeck(sectionId, 'Third');

    await api()
      .put('/api/subsections/reorder')
      .send({ groups: [{ sectionId, subSectionIds: [third, first, second] }] })
      .expect(204);

    const listed = await api().get(`/api/sections/${sectionId}/subsections`).expect(200);
    expect(listed.body.data.map((d: { name: string }) => d.name)).toEqual(['Third', 'First', 'Second']);
    expect(listed.body.data.map((d: { order: number }) => d.order)).toEqual([0, 1, 2]);
  });

  it('moves a deck between sections and closes the gap it left', async () => {
    const source = await makeDeck('Stays');
    const moving = await addDeck(source.sectionId, 'Moves');
    const target = await makeDeck('Already there');

    await api()
      .put('/api/subsections/reorder')
      .send({
        groups: [
          { sectionId: source.sectionId, subSectionIds: [source.deckId] },
          { sectionId: target.sectionId, subSectionIds: [moving, target.deckId] },
        ],
      })
      .expect(204);

    const left = await api().get(`/api/sections/${source.sectionId}/subsections`).expect(200);
    expect(left.body.data.map((d: { name: string }) => d.name)).toEqual(['Stays']);

    const arrived = await api().get(`/api/sections/${target.sectionId}/subsections`).expect(200);
    expect(arrived.body.data.map((d: { name: string }) => d.name)).toEqual(['Moves', 'Already there']);
    expect(arrived.body.data[0].sectionId).toBe(target.sectionId);
  });

  it('rejects a reorder with an unknown section, unknown deck or a repeated deck', async () => {
    const { sectionId, deckId } = await makeDeck();

    await api()
      .put('/api/subsections/reorder')
      .send({ groups: [{ sectionId: 'ghost', subSectionIds: [deckId] }] })
      .expect(400);

    await api()
      .put('/api/subsections/reorder')
      .send({ groups: [{ sectionId, subSectionIds: ['ghost'] }] })
      .expect(400);

    await api()
      .put('/api/subsections/reorder')
      .send({ groups: [{ sectionId, subSectionIds: [deckId, deckId] }] })
      .expect(400);
  });

  it('leaves the order untouched when a reorder fails part way through', async () => {
    const { sectionId, deckId: first } = await makeDeck('First');
    const second = await addDeck(sectionId, 'Second');

    await api()
      .put('/api/subsections/reorder')
      .send({ groups: [{ sectionId, subSectionIds: [second, first, 'ghost'] }] })
      .expect(400);

    const listed = await api().get(`/api/sections/${sectionId}/subsections`).expect(200);
    expect(listed.body.data.map((d: { name: string }) => d.name)).toEqual(['First', 'Second']);
  });
});

describe('cards', () => {
  it('supports the full GET / PUT / DELETE lifecycle', async () => {
    const { deckId } = await makeDeck();

    const created = await api()
      .post(`/api/subsections/${deckId}/cards`)
      .send({ front: 'What is QA?', back: 'Quality Assurance', bullets: ['one', 'two'] })
      .expect(201);
    const cardId = created.body.data.id;
    expect(created.body.data.bullets).toEqual(['one', 'two']);

    const fetched = await api().get(`/api/cards/${cardId}`).expect(200);
    expect(fetched.body.data.front).toBe('What is QA?');
    expect(fetched.body.data.status).toBe('NEW');

    const updated = await api()
      .put(`/api/cards/${cardId}`)
      .send({ front: 'What is Quality Assurance?', bullets: ['only one'] })
      .expect(200);
    expect(updated.body.data.front).toBe('What is Quality Assurance?');
    expect(updated.body.data.bullets).toEqual(['only one']);
    // An untouched field must survive a partial update.
    expect(updated.body.data.back).toBe('Quality Assurance');

    await api().delete(`/api/cards/${cardId}`).expect(204);
    await api().get(`/api/cards/${cardId}`).expect(404);
  });

  it('rejects an empty update', async () => {
    const { deckId } = await makeDeck();
    const created = await api()
      .post(`/api/subsections/${deckId}/cards`)
      .send({ front: 'F', back: 'B' })
      .expect(201);

    await api().put(`/api/cards/${created.body.data.id}`).send({}).expect(400);
  });

  it('keeps insertion order', async () => {
    const { deckId } = await makeDeck();
    for (const front of ['first', 'second', 'third']) {
      await api().post(`/api/subsections/${deckId}/cards`).send({ front, back: 'x' }).expect(201);
    }

    const response = await api().get(`/api/subsections/${deckId}/cards`).expect(200);
    expect(response.body.data.map((c: { front: string }) => c.front)).toEqual(['first', 'second', 'third']);
  });
});

describe('card progress and XP', () => {
  it('awards XP for a first flip and for mastering a card', async () => {
    const { deckId } = await makeDeck();
    const created = await api()
      .post(`/api/subsections/${deckId}/cards`)
      .send({ front: 'F', back: 'B' })
      .expect(201);

    const response = await api()
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
    const created = await api()
      .post(`/api/subsections/${deckId}/cards`)
      .send({ front: 'F', back: 'B' })
      .expect(201);
    const url = `/api/cards/${created.body.data.id}/progress`;

    await api().put(url).send({ status: 'KNOWN', flipped: true }).expect(200);
    const second = await api().put(url).send({ status: 'KNOWN', flipped: true }).expect(200);

    expect(second.body.data.xpEarned).toBe(0);
  });

  it('unlocks the deck-completion badge only when every card is known', async () => {
    const { deckId } = await makeDeck();
    const ids: string[] = [];
    for (const front of ['a', 'b']) {
      const created = await api()
        .post(`/api/subsections/${deckId}/cards`)
        .send({ front, back: 'x' })
        .expect(201);
      ids.push(created.body.data.id);
    }

    const first = await api()
      .put(`/api/cards/${ids[0]}/progress`)
      .send({ status: 'KNOWN', flipped: true })
      .expect(200);
    expect(first.body.data.newBadges.map((b: { code: string }) => b.code)).not.toContain('DECK_DONE');

    const second = await api()
      .put(`/api/cards/${ids[1]}/progress`)
      .send({ status: 'KNOWN', flipped: true })
      .expect(200);
    expect(second.body.data.newBadges.map((b: { code: string }) => b.code)).toContain('DECK_DONE');
  });

  it('rejects an unknown status', async () => {
    const { deckId } = await makeDeck();
    const created = await api()
      .post(`/api/subsections/${deckId}/cards`)
      .send({ front: 'F', back: 'B' })
      .expect(201);

    await api().put(`/api/cards/${created.body.data.id}/progress`).send({ status: 'MASTERED' }).expect(400);
  });
});

describe('quiz', () => {
  /** Seeds a deck with one question and returns its id and correct index. */
  async function makeQuestion(deckId: string, correctIndex = 1) {
    const response = await api()
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

    const response = await api().get(`/api/subsections/${deckId}/quiz`).expect(200);

    expect(response.body.data[0].correctIndex).toBeUndefined();
    expect(response.body.data[0].explanation).toBeNull();
  });

  it('rejects a question whose correctIndex is out of range', async () => {
    const { deckId } = await makeDeck();

    const response = await api()
      .post(`/api/subsections/${deckId}/quiz/questions`)
      .send({ prompt: 'p', options: ['a', 'b'], correctIndex: 5 })
      .expect(400);

    expect(response.body.error.details.correctIndex).toBeDefined();
  });

  it('grades a submission and awards XP and stars', async () => {
    const { deckId } = await makeDeck();
    const questionId = await makeQuestion(deckId, 1);

    const response = await api()
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

    const response = await api()
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

    await api()
      .post(`/api/subsections/${a.deckId}/quiz/attempts`)
      .send({ answers: [{ questionId: foreignQuestion, selectedIndex: 0 }], durationMs: 1000 })
      .expect(400);
  });

  it('generates a quiz from the deck cards once there are enough of them', async () => {
    const { deckId } = await makeDeck();
    for (let i = 1; i <= 5; i++) {
      await api()
        .post(`/api/subsections/${deckId}/cards`)
        .send({ front: `Term ${i}`, back: `Definition number ${i}` })
        .expect(201);
    }

    const response = await api().post(`/api/subsections/${deckId}/quiz/generate`).expect(201);
    expect(response.body.data.length).toBeGreaterThan(0);
    expect(response.body.data[0].options).toHaveLength(4);
  });

  it('will not generate a quiz from a deck with too few cards', async () => {
    const { deckId } = await makeDeck();
    await api().post(`/api/subsections/${deckId}/cards`).send({ front: 'a', back: 'b' }).expect(201);

    await api().post(`/api/subsections/${deckId}/quiz/generate`).expect(400);
  });

  it('deletes a question', async () => {
    const { deckId } = await makeDeck();
    const questionId = await makeQuestion(deckId);

    await api().delete(`/api/questions/${questionId}`).expect(204);
    const response = await api().get(`/api/subsections/${deckId}/quiz`).expect(200);
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

    const response = await api()
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

    const response = await api()
      .post(`/api/subsections/${deckId}/import`)
      .attach('file', buffer, 'deck.pptx')
      .expect(201);

    expect(response.body.data.imported).toBe(2);
    expect(response.body.data.newBadges.map((b: { code: string }) => b.code)).toContain('IMPORTER');

    const cards = await api().get(`/api/subsections/${deckId}/cards`).expect(200);
    expect(cards.body.data[0].front).toBe('What is regression testing?');
    expect(cards.body.data[0].sourceSlide).toBe(1);
    expect(cards.body.data[0].notes).toBe('Mention automation.');
  });

  it('appends to a deck that already has cards rather than replacing them', async () => {
    const { deckId } = await makeDeck();
    await api().post(`/api/subsections/${deckId}/cards`).send({ front: 'Manual', back: 'x' }).expect(201);

    const buffer = await buildPptx([{ title: 'Imported', bullets: ['y'] }]);
    await api().post(`/api/subsections/${deckId}/import`).attach('file', buffer, 'd.pptx').expect(201);

    const cards = await api().get(`/api/subsections/${deckId}/cards`).expect(200);
    expect(cards.body.data.map((c: { front: string }) => c.front)).toEqual(['Manual', 'Imported']);
  });

  it('rejects a file that is not a .pptx', async () => {
    const { deckId } = await makeDeck();

    await api()
      .post(`/api/subsections/${deckId}/import`)
      .attach('file', Buffer.from('hello'), 'notes.txt')
      .expect(415);
  });

  it('rejects a request with no file attached', async () => {
    const { deckId } = await makeDeck();
    await api().post(`/api/subsections/${deckId}/import`).expect(400);
  });
});

describe('progress rollup', () => {
  it('splits totals by track', async () => {
    const process = await api()
      .post('/api/sections')
      .send({ name: 'Proc', track: 'PROCESS' })
      .expect(201);
    const procDeck = await api()
      .post(`/api/sections/${process.body.data.id}/subsections`)
      .send({ name: 'D' })
      .expect(201);
    await api()
      .post(`/api/subsections/${procDeck.body.data.id}/cards`)
      .send({ front: 'a', back: 'b' })
      .expect(201);

    const response = await api().get('/api/progress').expect(200);

    expect(response.body.data.process.total).toBe(1);
    expect(response.body.data.technical.total).toBe(0);
    expect(response.body.data.overall.total).toBe(1);
  });
});

describe('auth', () => {
  it('registers, then rejects a second registration with the same email', async () => {
    const email = `dupe-${Math.random().toString(36).slice(2)}@example.com`;
    await request(app)
      .post('/api/auth/register')
      .send({ name: 'A', email, password: 'password123' })
      .expect(201);

    const second = await request(app)
      .post('/api/auth/register')
      .send({ name: 'B', email, password: 'password123' })
      .expect(409);
    expect(second.body.error.code).toBe('CONFLICT');
  });

  it('logs in with the right password and rejects the wrong one', async () => {
    const email = `login-${Math.random().toString(36).slice(2)}@example.com`;
    await request(app).post('/api/auth/register').send({ name: 'A', email, password: 'password123' }).expect(201);

    const wrong = await request(app).post('/api/auth/login').send({ email, password: 'nope-nope' }).expect(401);
    expect(wrong.body.error.code).toBe('INVALID_CREDENTIALS');

    const right = await request(app).post('/api/auth/login').send({ email, password: 'password123' }).expect(200);
    expect(right.body.data.token).toBeTruthy();
    expect(right.body.data.profile.name).toBe('A');
  });

  it('rejects protected routes with no token and with a garbage token', async () => {
    await request(app).get('/api/profile').expect(401);
    await request(app).get('/api/profile').set('Authorization', 'Bearer garbage').expect(401);
  });

  it('resolves the current session via /auth/me', async () => {
    const response = await api().get('/api/auth/me').expect(200);
    expect(response.body.data.name).toBe('Tester');
  });
});

describe('leaderboard', () => {
  it('ranks players by XP, highlighting the caller', async () => {
    const other = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Rival', email: `rival-${Math.random().toString(36).slice(2)}@example.com`, password: 'password123' })
      .expect(201);

    const { deckId } = await makeDeck();
    const card = await api().post(`/api/subsections/${deckId}/cards`).send({ front: 'F', back: 'B' }).expect(201);
    await api().put(`/api/cards/${card.body.data.id}/progress`).send({ status: 'KNOWN', flipped: true }).expect(200);

    const board = await api().get('/api/leaderboard').expect(200);

    expect(board.body.data[0].name).toBe('Tester');
    expect(board.body.data[0].xp).toBe(20);
    expect(board.body.data[0].isYou).toBe(true);
    expect(board.body.data.map((e: { name: string }) => e.name)).toContain(other.body.data.profile.name);
  });
});

describe('unknown routes', () => {
  it('returns a structured 404', async () => {
    const response = await request(app).get('/api/nope').expect(404);
    expect(response.body.error.code).toBe('NOT_FOUND');
  });
});
