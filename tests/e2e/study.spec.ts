import { expect, test } from '@playwright/test';

/**
 * End-to-end coverage of the learner's main path: pick a section, flip through a
 * deck, watch progress move, and take a quiz.
 *
 * These run against the seeded curriculum, so `npm run db:seed` must have been
 * run at least once.
 */

test.describe('dashboard', () => {
  test('shows both assessment tracks with progress', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByRole('heading', { name: 'Your QA training ground' })).toBeVisible();
    await expect(page.getByRole('heading', { name: /Process Assessment/ })).toBeVisible();
    await expect(page.getByRole('heading', { name: /Technical Assessment/ })).toBeVisible();

    // The HUD reports the player's level.
    await expect(page.locator('.level-orb')).toBeVisible();
  });

  test('opens a section and lists its decks', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /QA Fundamentals/ }).click();

    await expect(page).toHaveURL(/\/sections\//);
    await expect(page.getByRole('heading', { name: 'QA Fundamentals' })).toBeVisible();
    await expect(page.getByText('Testing Principles')).toBeVisible();
  });
});

test.describe('studying a deck', () => {
  test('flips a card to reveal the answer', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /QA Fundamentals/ }).click();
    await page.getByRole('button', { name: 'Study' }).first().click();

    const card = page.locator('.flashcard');
    await expect(card).toBeVisible();
    await expect(card).not.toHaveClass(/is-flipped/);

    await card.click();
    await expect(card).toHaveClass(/is-flipped/);

    // Flipping back returns to the prompt.
    await card.click();
    await expect(card).not.toHaveClass(/is-flipped/);
  });

  test('navigates between cards and updates the counter', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /QA Fundamentals/ }).click();
    await page.getByRole('button', { name: 'Study' }).first().click();

    await expect(page.locator('.deck-counter')).toContainText('1 /');

    await page.getByRole('button', { name: 'Next →' }).click();
    await expect(page.locator('.deck-counter')).toContainText('2 /');

    await page.getByRole('button', { name: '← Prev' }).click();
    await expect(page.locator('.deck-counter')).toContainText('1 /');
  });

  test('the space bar flips the card', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /QA Fundamentals/ }).click();
    await page.getByRole('button', { name: 'Study' }).first().click();

    await page.keyboard.press('Space');
    await expect(page.locator('.flashcard')).toHaveClass(/is-flipped/);
  });

  test('marking a card as known records it and advances the deck', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /Test Design Techniques/ }).click();
    await page.getByRole('button', { name: 'Study' }).first().click();

    await expect(page.locator('.deck-counter')).toContainText('1 /');

    await page.getByRole('button', { name: '✓ I know this' }).click();

    // The deck moves on, and card 1's dot turns green.
    //
    // XP is deliberately not asserted here: the progress endpoint is
    // idempotent, so a card already mastered by an earlier run earns 0 XP and
    // shows no toast. Mastery state is the durable outcome worth checking.
    await expect(page.locator('.deck-counter')).toContainText('2 /');
    await expect(page.locator('.deck-dot').first()).toHaveClass(/is-known/);
  });

  test('awards XP the first time a freshly created card is mastered', async ({ page }) => {
    // A brand new deck guarantees unmastered cards, so the reward path is
    // exercised deterministically regardless of previous runs.
    const name = `XP Probe ${Date.now()}`;

    await page.goto('/manage');
    await page.getByRole('button', { name: '＋ New section' }).click();
    await page.getByPlaceholder('e.g. Test Design Techniques').fill(name);
    await page.getByRole('button', { name: 'Save' }).click();

    const section = page.locator('.panel').filter({ hasText: name });
    await section.getByRole('button', { name: '＋ Deck' }).click();
    await page.getByPlaceholder('e.g. Boundary Value Analysis').fill('Probe Deck');
    await page.getByRole('button', { name: 'Save' }).click();

    await section.getByRole('button', { name: 'Cards' }).click();
    await page.getByRole('button', { name: '＋ Add card' }).click();
    await page.getByPlaceholder('What is boundary value analysis?').fill('Probe question?');
    await page.getByPlaceholder(/Testing at the edges/).fill('Probe answer.');
    await page.getByRole('button', { name: 'Save card' }).click();
    await expect(page.getByText('Probe question?')).toBeVisible();

    // Studying is reached from the dashboard, not the Manage page.
    await page.goto('/');
    await page.getByRole('button', { name: new RegExp(name) }).click();
    await page.getByRole('button', { name: 'Study' }).first().click();

    await page.locator('.flashcard').click();
    await page.getByRole('button', { name: '✓ I know this' }).click();

    // 5 XP for the first flip + 15 for mastering it.
    await expect(page.locator('.toast').filter({ hasText: '+20 XP' })).toBeVisible();

    await page.goto('/manage');
    await page.locator('.panel').filter({ hasText: name }).getByRole('button', { name: '🗑' }).first().click();
    await page.getByRole('button', { name: 'Delete' }).click();
  });

  test('shows a status dot for every card in the deck', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /Agile QA Process/ }).click();
    await page.getByRole('button', { name: 'Study' }).first().click();

    const dots = page.locator('.deck-dot');
    await expect(dots.first()).toBeVisible();
    expect(await dots.count()).toBeGreaterThan(1);
  });
});

test.describe('quiz', () => {
  test('runs a quiz end to end and shows a star rating', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /QA Fundamentals/ }).click();
    await page.getByRole('button', { name: '🎯 Quiz' }).first().click();

    await expect(page.locator('.quiz-question')).toBeVisible();

    // Answer every question, choosing the first option each time.
    for (;;) {
      await page.locator('.quiz-option').first().click();
      const next = page.getByRole('button', { name: 'Next →' });
      if (await next.isVisible()) await next.click();
      else break;
    }

    await page.getByRole('button', { name: 'Submit answers' }).click();

    await expect(page.locator('.result-score')).toBeVisible();
    await expect(page.locator('.stars')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Review' })).toBeVisible();
  });

  test('does not leak the correct answer before submitting', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /QA Fundamentals/ }).click();
    await page.getByRole('button', { name: '🎯 Quiz' }).first().click();

    await expect(page.locator('.quiz-question')).toBeVisible();
    // No option is styled as correct or wrong until the attempt is graded.
    await expect(page.locator('.quiz-option.is-correct')).toHaveCount(0);
    await expect(page.locator('.quiz-option.is-wrong')).toHaveCount(0);
  });
});

test.describe('content management', () => {
  test('creates, renames and deletes a section', async ({ page }) => {
    const name = `E2E Section ${Date.now()}`;
    const renamed = `${name} renamed`;

    await page.goto('/manage');
    await page.getByRole('button', { name: '＋ New section' }).click();
    await page.getByPlaceholder('e.g. Test Design Techniques').fill(name);
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText(name)).toBeVisible();

    // Rename it through the same modal.
    await page
      .locator('.panel')
      .filter({ hasText: name })
      .getByRole('button', { name: '✎ Rename' })
      .click();
    await page.getByPlaceholder('e.g. Test Design Techniques').fill(renamed);
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText(renamed)).toBeVisible();

    await page.locator('.panel').filter({ hasText: renamed }).getByRole('button', { name: '🗑' }).click();
    await page.getByRole('button', { name: 'Delete' }).click();
    await expect(page.getByText(renamed)).toHaveCount(0);
  });

  test('adds a deck and a card by hand', async ({ page }) => {
    const sectionName = `E2E Cards ${Date.now()}`;

    await page.goto('/manage');
    await page.getByRole('button', { name: '＋ New section' }).click();
    await page.getByPlaceholder('e.g. Test Design Techniques').fill(sectionName);
    await page.getByRole('button', { name: 'Save' }).click();

    const section = page.locator('.panel').filter({ hasText: sectionName });
    await section.getByRole('button', { name: '＋ Deck' }).click();
    await page.getByPlaceholder('e.g. Boundary Value Analysis').fill('E2E Deck');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(section.getByText('E2E Deck')).toBeVisible();

    await section.getByRole('button', { name: 'Cards' }).click();
    await page.getByRole('button', { name: '＋ Add card' }).click();
    await page.getByPlaceholder('What is boundary value analysis?').fill('E2E question?');
    await page.getByPlaceholder(/Testing at the edges/).fill('E2E answer.');
    await page.getByRole('button', { name: 'Save card' }).click();

    await expect(page.getByText('E2E question?')).toBeVisible();

    // Clean up so repeated runs do not accumulate sections.
    await page.locator('.panel').filter({ hasText: sectionName }).getByRole('button', { name: '🗑' }).first().click();
    await page.getByRole('button', { name: 'Delete' }).click();
  });
});

test.describe('profile', () => {
  test('shows the badge shelf with locked and earned badges', async ({ page }) => {
    await page.goto('/profile');

    await expect(page.getByRole('heading', { name: 'Badge shelf' })).toBeVisible();
    expect(await page.locator('.badge').count()).toBeGreaterThan(5);
  });
});
