import { useEffect, useState } from 'react';
import Setup from './screens/Setup';
import Unlock from './screens/Unlock';
import AppShell from './shell/AppShell';

type AppScreen = 'loading' | 'setup' | 'locked' | 'unlocked';

export default function App() {
  const [screen, setScreen] = useState<AppScreen>('loading');
  const [showExtensionApproval, setShowExtensionApproval] = useState(false);

  useEffect(() => {
    window.sourcerer.checkFirstLaunch().then(({ isFirstLaunch }) => {
      setScreen(isFirstLaunch ? 'setup' : 'locked');
    });

    const removeLocked = window.sourcerer.onLocked(() => setScreen('locked'));
    const removeAccess = window.sourcerer.onExtensionAccessRequest(() =>
      setShowExtensionApproval(true),
    );
    return () => {
      removeLocked();
      removeAccess();
    };
  }, []);

  async function handleApprove() {
    await window.sourcerer.approveExtension();
    setShowExtensionApproval(false);
  }

  async function handleDeny() {
    await window.sourcerer.denyExtension();
    setShowExtensionApproval(false);
  }

  const extensionModal = showExtensionApproval ? (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.55)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
      }}
    >
      <div
        style={{
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: 10,
          padding: '28px 24px 20px',
          width: 340,
          boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
        }}
      >
        <h3 style={{ margin: '0 0 10px', fontSize: 15, fontWeight: 600 }}>
          Browser extension requesting access
        </h3>
        <p style={{ margin: '0 0 20px', fontSize: 13, color: 'var(--color-text-muted)', lineHeight: 1.5 }}>
          The Sourcerer browser extension wants to connect to this app. Approve only if you
          just triggered this from the extension.
        </p>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button className="modal-btn-cancel" onClick={handleDeny}>
            Deny
          </button>
          <button className="modal-btn-create" onClick={handleApprove}>
            Approve
          </button>
        </div>
      </div>
    </div>
  ) : null;

  if (screen === 'loading') {
    return (
      <div
        style={{
          height: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--color-text-muted)',
          fontSize: 14,
        }}
      >
        Loading…
      </div>
    );
  }

  if (screen === 'setup') return <>{extensionModal}<Setup onComplete={() => setScreen('locked')} /></>;
  if (screen === 'locked') return <>{extensionModal}<Unlock onUnlocked={() => setScreen('unlocked')} /></>;
  return <>{extensionModal}<AppShell /></>;
}
