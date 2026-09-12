import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { QuizQuestion, QuizResult } from '@qa/shared';
import { api, ApiRequestError } from '../lib/api';
import { Empty, ErrorBanner, Loading } from '../components/States';
import { useToast } from '../components/Toast';
import { usePlayer } from '../lib/PlayerContext';

const OPTION_KEYS = ['A', 'B', 'C', 'D', 'E', 'F'];

export function QuizPage() {
  const { subSectionId } = useParams<{ subSectionId: string }>();
  const [questions, setQuestions] = useState<QuizQuestion[] | null>(null);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [result, setResult] = useState<QuizResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Wall-clock duration is reported with the attempt for the results screen.
  const startedAt = useRef(Date.now());
  const toast = useToast();
  const { setProfile } = usePlayer();
  const navigate = useNavigate();

  const load = useCallback(async () => {
    if (!subSectionId) return;
    try {
      const data = await api.getQuiz(subSectionId);
      setQuestions(data);
      startedAt.current = Date.now();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not load the quiz');
    }
  }, [subSectionId]);

  useEffect(() => {
    void load();
  }, [load]);

  const generate = async () => {
    if (!subSectionId) return;
    setBusy(true);
    try {
      const data = await api.generateQuiz(subSectionId);
      setQuestions(data);
      startedAt.current = Date.now();
      toast.info('Quiz generated', `${data.length} questions built from this deck`);
    } catch (err) {
      toast.error(err instanceof ApiRequestError ? err.message : 'Could not generate a quiz');
    } finally {
      setBusy(false);
    }
  };

  const submit = async () => {
    if (!subSectionId || !questions) return;
    setBusy(true);
    try {
      const payload = {
        answers: questions
          .filter((q) => answers[q.id] !== undefined)
          .map((q) => ({ questionId: q.id, selectedIndex: answers[q.id]! })),
        durationMs: Date.now() - startedAt.current,
      };

      const data = await api.submitQuiz(subSectionId, payload);
      setResult(data);
      setProfile(data.profile);
      toast.xp(data.attempt.xpEarned, `${data.attempt.score}/${data.attempt.total} correct`);
      toast.badges(data.newBadges);
    } catch (err) {
      toast.error(err instanceof ApiRequestError ? err.message : 'Could not submit your answers');
    } finally {
      setBusy(false);
    }
  };

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

  if (!questions) return <Loading label="Loading quiz…" />;

  /* ---------------------------------------------------------------- */
  /* Results                                                           */
  /* ---------------------------------------------------------------- */

  if (result) {
    const { attempt } = result;
    const percent = Math.round((attempt.score / attempt.total) * 100);

    return (
      <main className="page">
        <div className="quiz-shell">
          <div className="panel result-hero">
            <div className="result-score">
              {attempt.score}/{attempt.total}
            </div>
            <div style={{ color: 'var(--text-2)', marginTop: 6, fontWeight: 600 }}>{percent}% correct</div>

            <div className="stars" role="img" aria-label={`${attempt.stars} out of 5 stars`}>
              {[1, 2, 3, 4, 5].map((n) => (
                <span key={n} className={`star${n <= attempt.stars ? ' is-lit' : ''}`} aria-hidden="true">
                  ★
                </span>
              ))}
            </div>

            <div className="row" style={{ justifyContent: 'center', gap: 22 }}>
              <span className="pill">⚡ +{attempt.xpEarned} XP</span>
              <span className="pill">⏱ {Math.round(attempt.durationMs / 1000)}s</span>
              <span className="pill">🎖 Level {result.profile.level}</span>
            </div>
          </div>

          <h3 style={{ margin: '30px 0 14px', fontSize: 18 }}>Review</h3>
          <div className="stack">
            {result.answers.map((answer, i) => (
              <div key={answer.questionId} className="panel">
                <div className="row" style={{ alignItems: 'flex-start', gap: 10 }}>
                  <span style={{ fontSize: 19 }} aria-hidden="true">
                    {answer.correct ? '✅' : '❌'}
                  </span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, marginBottom: 8 }}>
                      {i + 1}. {answer.prompt}
                    </div>
                    {!answer.correct && (
                      <div style={{ fontSize: 14, color: 'var(--text-2)' }}>
                        You chose{' '}
                        <strong style={{ color: 'var(--rose)' }}>{OPTION_KEYS[answer.selectedIndex]}</strong>
                        {' · '}correct answer was{' '}
                        <strong style={{ color: 'var(--emerald)' }}>{OPTION_KEYS[answer.correctIndex]}</strong>
                      </div>
                    )}
                    {answer.explanation && <div className="quiz-explanation">{answer.explanation}</div>}
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="deck-controls" style={{ marginTop: 26 }}>
            <button
              type="button"
              className="btn"
              onClick={() => {
                setResult(null);
                setAnswers({});
                setIndex(0);
                startedAt.current = Date.now();
              }}
            >
              ↻ Retry
            </button>
            <button type="button" className="btn btn--primary" onClick={() => navigate(`/decks/${subSectionId}`)}>
              Back to deck
            </button>
          </div>
        </div>
      </main>
    );
  }

  /* ---------------------------------------------------------------- */
  /* Empty state - offer to generate questions from the deck's cards   */
  /* ---------------------------------------------------------------- */

  if (questions.length === 0) {
    return (
      <main className="page">
        <Empty icon="🎯" title="No questions in this deck yet">
          <p style={{ maxWidth: '48ch', lineHeight: 1.6 }}>
            Generate a quiz automatically from the deck's cards, or add questions by hand from the Manage
            page.
          </p>
          <div className="row" style={{ justifyContent: 'center' }}>
            <button type="button" className="btn btn--primary" onClick={() => void generate()} disabled={busy}>
              {busy ? 'Generating…' : '✨ Generate from cards'}
            </button>
            <Link to={`/decks/${subSectionId}`} className="btn">
              Back to deck
            </Link>
          </div>
        </Empty>
      </main>
    );
  }

  /* ---------------------------------------------------------------- */
  /* Taking the quiz                                                   */
  /* ---------------------------------------------------------------- */

  const question = questions[index];
  if (!question) return <Loading />;

  const selected = answers[question.id];
  const answeredCount = Object.keys(answers).length;
  const allAnswered = answeredCount === questions.length;
  const isLast = index === questions.length - 1;

  return (
    <main className="page">
      <div className="quiz-shell">
        <div className="quiz-progress">
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => navigate(-1)}>
            ← Exit
          </button>
          <div style={{ flex: 1 }}>
            <div className="xp-bar-label">
              <span>
                Question {index + 1} of {questions.length}
              </span>
              <span className={`difficulty-${question.difficulty}`}>{question.difficulty}</span>
            </div>
            <div className="xp-bar-track">
              <div className="xp-bar-fill" style={{ width: `${((index + 1) / questions.length) * 100}%` }} />
            </div>
          </div>
        </div>

        <div className="panel">
          <h2 className="quiz-question">{question.prompt}</h2>

          <div className="quiz-options">
            {question.options.map((option, i) => (
              <button
                key={i}
                type="button"
                className={`quiz-option${selected === i ? ' is-selected' : ''}`}
                onClick={() => setAnswers((prev) => ({ ...prev, [question.id]: i }))}
              >
                <span className="quiz-option-key" aria-hidden="true">
                  {OPTION_KEYS[i]}
                </span>
                <span>{option}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="deck-controls">
          <button type="button" className="btn" onClick={() => setIndex((i) => i - 1)} disabled={index === 0}>
            ← Prev
          </button>

          <span className="deck-counter">
            {answeredCount}/{questions.length} answered
          </span>

          {isLast ? (
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => void submit()}
              disabled={busy || answeredCount === 0}
              title={allAnswered ? 'Submit' : 'You can submit with unanswered questions skipped'}
            >
              {busy ? 'Scoring…' : 'Submit answers'}
            </button>
          ) : (
            <button type="button" className="btn btn--primary" onClick={() => setIndex((i) => i + 1)}>
              Next →
            </button>
          )}
        </div>
      </div>
    </main>
  );
}
