import { useState, type FormEvent, type ChangeEvent } from 'react';
import { WordmarkLogo } from '../components/WordmarkLogo';
import Button from '../shell/Button';
import './Unlock.css';

interface Props {
  onUnlocked: () => void;
}

export default function Unlock({ onUnlocked }: Props) {
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempts, setAttempts] = useState(0);

  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    setPassword(e.target.value);
    setError(null);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!password) return;

    setSubmitting(true);
    setError(null);

    const result = await window.sourcerer.unlock(password);

    if (result.success) {
      onUnlocked();
    } else {
      const next = attempts + 1;
      setAttempts(next);
      setError(result.error ?? 'Incorrect password.');
      setPassword('');
      setSubmitting(false);
    }
  }

  return (
    <div className="unlock-root">
      <div className="unlock-card">
        <WordmarkLogo size={64} className="unlock-wordmark" />
        <p className="unlock-subtitle">Enter your password to continue.</p>

        <form onSubmit={handleSubmit} noValidate>
          <div className="unlock-field">
            <label htmlFor="password" className="unlock-label">
              Password
            </label>
            <input
              id="password"
              type="password"
              className="unlock-input"
              value={password}
              onChange={handleChange}
              disabled={submitting}
              autoFocus
              autoComplete="current-password"
            />
          </div>

          {error && (
            <div className="unlock-error">
              {error}
              {attempts >= 3 && (
                <div className="unlock-error-hint">
                  Remember: there is no password recovery mechanism.
                </div>
              )}
            </div>
          )}

          <Button variant="primary" full type="submit" disabled={submitting || !password}>
            {submitting ? 'Unlocking…' : 'Unlock'}
          </Button>
        </form>
      </div>
    </div>
  );
}
