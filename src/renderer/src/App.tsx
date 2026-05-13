import { useEffect, useState } from 'react';
import './App.css';
import Setup from './screens/Setup';
import Unlock from './screens/Unlock';
import AppShell from './shell/AppShell';
import ScreenshotPickerModal from './contacts/ScreenshotPickerModal';

type AppScreen = 'loading' | 'setup' | 'locked' | 'unlocked';

export default function App() {
  const [screen, setScreen] = useState<AppScreen>('loading');
  const [showExtensionApproval, setShowExtensionApproval] = useState(false);
  const [pendingScreenshotTempId, setPendingScreenshotTempId] = useState<string | null>(null);

  useEffect(() => {
    window.sourcerer.checkFirstLaunch().then(({ isFirstLaunch }) => {
      setScreen(isFirstLaunch ? 'setup' : 'locked');
    });

    const removeLocked = window.sourcerer.onLocked(() => setScreen('locked'));
    const removeAccess = window.sourcerer.onExtensionAccessRequest(() =>
      setShowExtensionApproval(true),
    );
    const removeScreenshot = window.sourcerer.onScreenshotReceived((tempId) =>
      setPendingScreenshotTempId(tempId),
    );
    return () => {
      removeLocked();
      removeAccess();
      removeScreenshot();
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
    <div className="ext-approval-overlay">
      <div className="ext-approval-card">
        <h3>Browser extension requesting access</h3>
        <p>
          The Sourcerer browser extension wants to connect to this app. Approve only if you
          just triggered this from the extension.
        </p>
        <div className="ext-approval-actions">
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

  const screenshotModal = pendingScreenshotTempId ? (
    <ScreenshotPickerModal
      tempId={pendingScreenshotTempId}
      onClose={() => setPendingScreenshotTempId(null)}
    />
  ) : null;

  if (screen === 'setup') return <>{extensionModal}{screenshotModal}<Setup onComplete={() => setScreen('locked')} /></>;
  if (screen === 'locked') return <>{extensionModal}{screenshotModal}<Unlock onUnlocked={() => setScreen('unlocked')} /></>;
  return <>{extensionModal}{screenshotModal}<AppShell /></>;
}
