import { useState, type FormEvent, type ChangeEvent } from 'react';
import './Setup.css';

interface Props {
  onComplete: () => void;
}

interface FormState {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  confirmPassword: string;
  acknowledgedNoRecovery: boolean;
}

const INITIAL_FORM: FormState = {
  firstName: '',
  lastName: '',
  email: '',
  password: '',
  confirmPassword: '',
  acknowledgedNoRecovery: false,
};

function validate(form: FormState): string | null {
  if (!form.firstName.trim()) return 'First name is required.';
  if (!form.lastName.trim()) return 'Last name is required.';
  if (!form.email.trim()) return 'Email address is required.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) return 'Enter a valid email address.';
  if (form.password.length < 12) return 'Password must be at least 12 characters.';
  if (form.password !== form.confirmPassword) return 'Passwords do not match.';
  if (!form.acknowledgedNoRecovery)
    return 'You must acknowledge that lost passwords cannot be recovered.';
  return null;
}

export default function Setup({ onComplete }: Props) {
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    const { name, value, type, checked } = e.target;
    setForm((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
    setError(null);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();

    const validationError = validate(form);
    if (validationError) {
      setError(validationError);
      return;
    }

    setSubmitting(true);
    setError(null);

    const result = await window.sourcerer.completeSetup({
      firstName: form.firstName.trim(),
      lastName: form.lastName.trim(),
      email: form.email.trim().toLowerCase(),
      password: form.password,
    });

    if (result.success) {
      onComplete();
    } else {
      setError(result.error ?? 'Setup failed. Please try again.');
      setSubmitting(false);
    }
  }

  return (
    <div className="setup-root">
      <div className="setup-card">
        <h1 className="setup-title">Welcome to Sourcerer</h1>
        <p className="setup-subtitle">
          Set up your profile and master password to get started.
        </p>

        <div className="setup-warning">
          <strong>No password recovery.</strong> If you forget your master password, your data
          cannot be recovered. There is no reset mechanism. Write it down and keep it somewhere
          safe.
        </div>

        <form onSubmit={handleSubmit} noValidate>
          <div className="setup-row">
            <div className="setup-field">
              <label htmlFor="firstName">First name</label>
              <input
                id="firstName"
                name="firstName"
                type="text"
                autoComplete="given-name"
                value={form.firstName}
                onChange={handleChange}
                disabled={submitting}
                autoFocus
              />
            </div>
            <div className="setup-field">
              <label htmlFor="lastName">Last name</label>
              <input
                id="lastName"
                name="lastName"
                type="text"
                autoComplete="family-name"
                value={form.lastName}
                onChange={handleChange}
                disabled={submitting}
              />
            </div>
          </div>

          <div className="setup-field">
            <label htmlFor="email">Email address</label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              value={form.email}
              onChange={handleChange}
              disabled={submitting}
            />
            <span className="setup-hint">
              Used to attribute your contributions in shared projects.
            </span>
          </div>

          <div className="setup-field">
            <label htmlFor="password">Master password</label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="new-password"
              value={form.password}
              onChange={handleChange}
              disabled={submitting}
            />
            <span className="setup-hint">Minimum 12 characters. This encrypts your database.</span>
          </div>

          <div className="setup-field">
            <label htmlFor="confirmPassword">Confirm password</label>
            <input
              id="confirmPassword"
              name="confirmPassword"
              type="password"
              autoComplete="new-password"
              value={form.confirmPassword}
              onChange={handleChange}
              disabled={submitting}
            />
          </div>

          <label className="setup-checkbox-label">
            <input
              name="acknowledgedNoRecovery"
              type="checkbox"
              checked={form.acknowledgedNoRecovery}
              onChange={handleChange}
              disabled={submitting}
            />
            I understand that if I forget my password, my data cannot be recovered.
          </label>

          {error && <div className="setup-error">{error}</div>}

          <button className="setup-submit" type="submit" disabled={submitting}>
            {submitting ? 'Setting up…' : 'Create my vault'}
          </button>
        </form>
      </div>
    </div>
  );
}
