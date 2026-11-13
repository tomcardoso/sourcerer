import { useEffect, useState } from 'react';
import './App.css';
import Setup from './screens/Setup';
import Unlock from './screens/Unlock';
import AppShell from './shell/AppShell';
import ScreenshotPickerModal from './contacts/ScreenshotPickerModal';
import Button from './shell/Button';
import Modal from './shell/Modal';
import DiagnosticsModal from './shell/DiagnosticsModal';

type AppScreen = 'loading' | 'setup' | 'locked' | 'unlocked';

export default function App() {
  const [screen, setScreen] = useState<AppScreen>('loading');
  const [showExtensionApproval, setShowExtensionApproval] = useState(false);
  const [pendingScreenshotTempId, setPendingScreenshotTempId] = useState<string | null>(null);
  const [showDiagnostics, setShowDiagnostics] = useState(false);

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
    // Help > Export Diagnostics Report… works on every screen, locked or not.
    const removeDiagnostics = window.sourcerer.onOpenDiagnostics(() => setShowDiagnostics(true));
    // Chosen from the menu while no window was open (macOS): this window was opened for it.
    window.sourcerer.takePendingDiagnostics().then((pending) => { if (pending) setShowDiagnostics(true); });
    return () => {
      removeLocked();
      removeAccess();
      removeScreenshot();
      removeDiagnostics();
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
    <Modal title="Browser extension requesting access" onDismiss={handleDeny}>
      <p className="form-description">
        The Sourcerer browser extension wants to connect to this app. Approve only if you
        just triggered this from the extension.
      </p>
      <div className="form-actions">
        <Button variant="secondary" onClick={handleDeny}>
          Deny
        </Button>
        <Button variant="primary" onClick={handleApprove}>
          Approve
        </Button>
      </div>
    </Modal>
  ) : null;

  const diagnosticsModal = showDiagnostics ? (
    <DiagnosticsModal onClose={() => setShowDiagnostics(false)} />
  ) : null;

  if (screen === 'loading') {
    return (
      <div className="app-loading">
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

  if (screen === 'setup') return <>{extensionModal}{screenshotModal}{diagnosticsModal}<Setup onComplete={() => setScreen('locked')} /></>;
  if (screen === 'locked') {
    return (
      <>
        {extensionModal}
        {screenshotModal}
        {diagnosticsModal}
        <Unlock onUnlocked={() => setScreen('unlocked')} onOpenDiagnostics={() => setShowDiagnostics(true)} />
      </>
    );
  }
  return <>{extensionModal}{screenshotModal}{diagnosticsModal}<AppShell /></>;
}
