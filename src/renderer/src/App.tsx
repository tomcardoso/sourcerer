import { useEffect, useState } from 'react';
import Setup from './screens/Setup';
import Unlock from './screens/Unlock';

type AppScreen = 'loading' | 'setup' | 'locked' | 'unlocked';

export default function App() {
  const [screen, setScreen] = useState<AppScreen>('loading');

  useEffect(() => {
    window.sourceror.checkFirstLaunch().then(({ isFirstLaunch }) => {
      setScreen(isFirstLaunch ? 'setup' : 'locked');
    });

    // Main process fires this when the idle timer expires
    const removeListener = window.sourceror.onLocked(() => {
      setScreen('locked');
    });

    return removeListener;
  }, []);

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

  if (screen === 'setup') {
    return <Setup onComplete={() => setScreen('locked')} />;
  }

  if (screen === 'locked') {
    return <Unlock onUnlocked={() => setScreen('unlocked')} />;
  }

  // Placeholder — main app shell is next
  return (
    <div
      style={{
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        color: 'var(--color-text-muted)',
      }}
    >
      <div style={{ fontSize: 32 }}>✓</div>
      <div style={{ fontWeight: 600, color: 'var(--color-text)', fontSize: 16 }}>
        Sourceror is unlocked
      </div>
      <div style={{ fontSize: 13 }}>Main app shell coming soon.</div>
    </div>
  );
}
