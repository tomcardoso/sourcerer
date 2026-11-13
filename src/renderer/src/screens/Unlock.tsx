import { useState, type FormEvent, type ChangeEvent } from 'react';
import { WordmarkLogo } from '../components/WordmarkLogo';
import Button from '../shell/Button';
import './Unlock.css';

interface Props {
  onUnlocked: () => void;
  onOpenDiagnostics: () => void;
}

export default function Unlock({ onUnlocked, onOpenDiagnostics }: Props) {
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // True when unlocking failed for a reason other than the password.
  const [appProblem, setAppProblem] = useState(false);
  const [attempts, setAttempts] = useState(0);

  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    setPassword(e.target.value);
    setError(null);
    setAppProblem(false);
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
      if (result.reason === 'wrong-password') setAttempts(attempts + 1);
      setAppProblem(result.reason === 'failed');
      setError(result.error ?? 'Incorrect password.');
      setPassword('');
      setSubmitting(false);
    }
  }

  return (
    <div className="unlock-root">
      <div className="unlock-card">
        <WordmarkLogo size={64} className="unlock-wordmark" />
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
              {!appProblem && attempts >= 3 && (
                <div className="unlock-error-hint">
                  Remember: there is no password recovery mechanism.
                </div>
              )}
              {appProblem && (
                <div className="unlock-error-hint">
                  To report this, export a diagnostics report and attach it to the issue.
                  <button type="button" className="unlock-error-link" onClick={onOpenDiagnostics}>
                    Export diagnostics report
                  </button>
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
