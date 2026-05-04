import { useEffect, useState } from 'react';
import Setup from './screens/Setup';

type AppScreen = 'loading' | 'setup' | 'locked';

export default function App() {
  const [screen, setScreen] = useState<AppScreen>('loading');

  useEffect(() => {
    window.sourceror.checkFirstLaunch().then(({ isFirstLaunch }) => {
      setScreen(isFirstLaunch ? 'setup' : 'locked');
    });
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
        }}
      >
        Loading…
      </div>
    );
  }

  if (screen === 'setup') {
    return <Setup onComplete={() => setScreen('locked')} />;
  }

  // Placeholder: unlock screen will be built next
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
      <div style={{ fontSize: 32 }}>🔒</div>
      <div style={{ fontWeight: 600, color: 'var(--color-text)' }}>Sourceror is locked</div>
      <div style={{ fontSize: 13 }}>Unlock screen coming soon.</div>
    </div>
  );
}
