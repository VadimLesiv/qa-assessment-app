import { useState, type FormEvent } from 'react';
import { Navigate, Link } from 'react-router-dom';
import { ApiRequestError } from '../lib/api';
import { usePlayer } from '../lib/PlayerContext';

export function RegisterPage() {
  const { isAuthenticated, register } = usePlayer();
  const [name, setName] = useState('');
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
      await register({ name, email, password });
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.fieldSummary : 'Could not create account');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="page auth-page">
      <form className="panel auth-panel" onSubmit={(e) => void submit(e)}>
        <h1 className="page-title">Create your profile</h1>
        <p className="page-subtitle">Track your own XP and appear on the leaderboard.</p>

        <label className="auth-field">
          Display name
          <input
            className="input"
            required
            maxLength={60}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>

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
            autoComplete="new-password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>

        {error && <p className="auth-error">{error}</p>}

        <button type="submit" className="btn btn--primary btn--block" disabled={submitting}>
          {submitting ? 'Creating account…' : 'Create account'}
        </button>

        <p className="auth-switch">
          Already have an account? <Link to="/login">Sign in</Link>
        </p>
      </form>
    </main>
  );
}
