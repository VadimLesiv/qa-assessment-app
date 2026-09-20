import { useState, type FormEvent } from 'react';
import { Navigate, Link } from 'react-router-dom';
import { ApiRequestError } from '../lib/api';
import { usePlayer } from '../lib/PlayerContext';

export function LoginPage() {
  const { isAuthenticated, login } = usePlayer();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (isAuthenticated) return <Navigate to="/" replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await login({ email, password });
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.fieldSummary : 'Could not sign in');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="page auth-page">
      <form className="panel auth-panel" onSubmit={(e) => void submit(e)}>
        <h1 className="page-title">Sign in</h1>
        <p className="page-subtitle">Study, quiz, and climb the leaderboard.</p>

        <label className="auth-field">
          Email
          <input
            className="input"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>

        <label className="auth-field">
          Password
          <input
            className="input"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>

        {error && <p className="auth-error">{error}</p>}

        <button type="submit" className="btn btn--primary btn--block" disabled={submitting}>
          {submitting ? 'Signing in…' : 'Sign in'}
        </button>

        <p className="auth-switch">
          No account yet? <Link to="/register">Create one</Link>
        </p>
      </form>
    </main>
  );
}
