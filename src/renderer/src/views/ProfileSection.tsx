import { useEffect, useRef, useState } from 'react';
import type { User } from '@shared/types';
import { isValidEmail } from '../contacts/contactValidation';
import Button from '../shell/Button';

interface Props {
  user: User | null;
  onUserUpdated: (user: User) => void;
}

export default function ProfileSection({ user, onUserUpdated }: Props) {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);
  const emailValid = !email.trim() || isValidEmail(email);
  const profileSavedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordResult, setPasswordResult] = useState<{ ok: boolean; msg: string } | null>(null);

  useEffect(() => {
    if (user) {
      setFirstName(user.first_name);
      setLastName(user.last_name);
      setEmail(user.email);
    }
  }, [user?.id]);

  useEffect(() => {
    return () => {
      if (profileSavedTimerRef.current) clearTimeout(profileSavedTimerRef.current);
    };
  }, []);

  const profileDirty =
    user &&
    (firstName !== user.first_name || lastName !== user.last_name || email !== user.email);

  async function handleProfileSave() {
    if (!firstName.trim() || !email.trim() || !isValidEmail(email)) return;
    setProfileSaving(true);
    try {
      const updated = await window.sourcerer.updateUser({ firstName, lastName, email });
      onUserUpdated(updated);
      setProfileSaved(true);
      if (profileSavedTimerRef.current) clearTimeout(profileSavedTimerRef.current);
      profileSavedTimerRef.current = setTimeout(() => setProfileSaved(false), 2000);
    } finally {
      setProfileSaving(false);
    }
  }

  async function handleChangePassword() {
    if (newPassword.length < 12) {
      setPasswordResult({ ok: false, msg: 'New password must be at least 12 characters.' });
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordResult({ ok: false, msg: 'New passwords do not match.' });
      return;
    }
    setPasswordSaving(true);
    setPasswordResult(null);
    try {
      const result = await window.sourcerer.changePassword(currentPassword, newPassword);
      if (result.success) {
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
        setPasswordResult({ ok: true, msg: 'Password updated successfully.' });
      } else {
        setPasswordResult({ ok: false, msg: result.error ?? 'Failed to change password.' });
      }
    } finally {
      setPasswordSaving(false);
    }
  }

  return (
    <>
      <div className="sv-section">
        <div className="sv-section-title">Profile</div>
        <p className="sv-hint">Your name and email are attached to notes and interactions you log across projects.</p>
        <div className="sv-fields">
          <div className="sv-field">
            <label className="sv-label">First name</label>
            <input
              className="sv-input"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleProfileSave(); }}
            />
          </div>
          <div className="sv-field">
            <label className="sv-label">Last name</label>
            <input
              className="sv-input"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleProfileSave(); }}
            />
          </div>
          <div className="sv-field sv-field--full">
            <label className="sv-label">Email</label>
            <input
              className="sv-input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleProfileSave(); }}
            />
            {!emailValid && (
              <p className="sv-field-error">Enter a valid email address.</p>
            )}
          </div>
        </div>
        <div className="sv-profile-actions">
          <Button
            variant="accent"
            size="sm"
            onClick={handleProfileSave}
            disabled={profileSaving || !profileDirty || !firstName.trim() || !email.trim() || !emailValid}
          >
            {profileSaved ? 'Saved!' : profileSaving ? 'Saving…' : 'Save profile'}
          </Button>
        </div>
      </div>

      <div className="sv-section">
        <div className="sv-section-title">Security</div>
        <p className="sv-hint">
          Change your Sourcerer password. You'll need to enter your current password to confirm the change.
        </p>
        <div className="sv-fields">
          <div className="sv-field sv-field--full">
            <label className="sv-label">Current password</label>
            <input
              className="sv-input"
              type="password"
              value={currentPassword}
              onChange={(e) => { setCurrentPassword(e.target.value); setPasswordResult(null); }}
              autoComplete="current-password"
            />
          </div>
          <div className="sv-field">
            <label className="sv-label">New password</label>
            <input
              className="sv-input"
              type="password"
              value={newPassword}
              onChange={(e) => { setNewPassword(e.target.value); setPasswordResult(null); }}
              autoComplete="new-password"
            />
          </div>
          <div className="sv-field">
            <label className="sv-label">Confirm new password</label>
            <input
              className="sv-input"
              type="password"
              value={confirmPassword}
              onChange={(e) => { setConfirmPassword(e.target.value); setPasswordResult(null); }}
              autoComplete="new-password"
              onKeyDown={(e) => { if (e.key === 'Enter') handleChangePassword(); }}
            />
          </div>
        </div>
        <p className="sv-hint sv-hint--small">
          Minimum 12 characters. Tip: a passphrase like "coral fence orbit lamp" is easier to remember and just as strong.
        </p>
        {passwordResult && (
          <p className={passwordResult.ok ? 'sv-success' : 'sv-error-inline'}>
            {passwordResult.msg}
          </p>
        )}
        <div className="sv-profile-actions">
          <Button
            variant="accent"
            size="sm"
            onClick={handleChangePassword}
            disabled={passwordSaving || !currentPassword || !newPassword || !confirmPassword}
          >
            {passwordSaving ? 'Updating…' : 'Update password'}
          </Button>
        </div>
      </div>
    </>
  );
}
