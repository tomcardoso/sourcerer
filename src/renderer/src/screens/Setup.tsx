import { useState, type FormEvent, type ChangeEvent } from 'react';
import { validateEmail } from '@shared/validation';
import { WordmarkLogo } from '../components/WordmarkLogo';
import Button from '../shell/Button';
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
  if (!validateEmail(form.email)) return 'Enter a valid email address.';
  if (form.password.length < 12) return 'Password must be at least 12 characters.';
  if (form.password !== form.confirmPassword) return 'Passwords do not match.';
  if (!form.acknowledgedNoRecovery)
    return 'You must acknowledge that lost passwords cannot be recovered.';
  return null;
}

export default function Setup({ onComplete }: Props) {
  const [step, setStep] = useState<'vault' | 'profile'>('vault');
  const [vaultLoading, setVaultLoading] = useState(false);
  const [vaultError, setVaultError] = useState<string | null>(null);

  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function advanceToProfile() {
    await window.sourcerer.expandForSetup();
    setStep('profile');
  }

  async function handlePickVaultLocation() {
    setVaultLoading(true);
    setVaultError(null);
    const result = await window.sourcerer.pickVaultLocation();
    if (!result) {
      setVaultLoading(false);
      return;
    }
    if (result.error) {
      setVaultError(result.error);
      setVaultLoading(false);
      return;
    }
    await advanceToProfile();
    setVaultLoading(false);
  }

  async function handleOpenExistingVault() {
    setVaultLoading(true);
    setVaultError(null);
    const result = await window.sourcerer.openExistingVault();
    setVaultLoading(false);
    if (result === null) return;
    if (result.success) {
      onComplete();
    } else {
      setVaultError(result.error ?? 'Could not open vault.');
    }
  }

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

  if (step === 'vault') {
    return (
      <div className="setup-root">
        <div className="setup-card">
          <WordmarkLogo size={64} className="setup-wordmark" />
          <p className="setup-subtitle">Where should Sourcerer store your vault?</p>
          <p className="setup-hint setup-vault-hint">
            Your vault holds the encrypted database, salt file, and screenshots. Most users can
            leave it in the default location. You can always move it later from Settings.
          </p>
          <div className="setup-vault-options">
            <div className="setup-vault-option">
              <Button variant="accent" full onClick={advanceToProfile} disabled={vaultLoading}>
                Use default location
              </Button>
              <span className="setup-hint">Stores your vault in the app data folder on this machine.</span>
            </div>
            <div className="setup-vault-option">
              <span className="setup-vault-option-label">Want to choose where?</span>
              <Button variant="secondary" full onClick={handlePickVaultLocation} disabled={vaultLoading}>
                Choose a folder…
              </Button>
              <span className="setup-hint">Useful if you want to store your vault on an external drive or in Dropbox, OneDrive, or a similar folder to access it from multiple machines.</span>
            </div>
          </div>
          {vaultError && <div className="setup-error">{vaultError}</div>}
          <button
            type="button"
            className="setup-default-link"
            onClick={handleOpenExistingVault}
            disabled={vaultLoading}
          >
            Open existing vault…
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="setup-root">
      <div className="setup-card">
        <WordmarkLogo size={64} className="setup-wordmark" />
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
            <label htmlFor="password">Password</label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="new-password"
              value={form.password}
              onChange={handleChange}
              disabled={submitting}
            />
            <span className="setup-hint">Minimum 12 characters. This encrypts your database. Tip: a passphrase — four random words like "coral fence orbit lamp" — is easier to
              remember than a complex string and just as strong.
            </span>
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

          <Button variant="primary" full type="submit" disabled={submitting || !form.acknowledgedNoRecovery}>
            {submitting ? 'Setting up…' : 'Create my vault'}
          </Button>
        </form>
      </div>
    </div>
  );
}
