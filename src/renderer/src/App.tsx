import { useEffect, useState } from 'react';
import Setup from './screens/Setup';
import Unlock from './screens/Unlock';
import AppShell from './shell/AppShell';

type AppScreen = 'loading' | 'setup' | 'locked' | 'unlocked';

export default function App() {
  const [screen, setScreen] = useState<AppScreen>('loading');

  useEffect(() => {
    window.sourcerer.checkFirstLaunch().then(({ isFirstLaunch }) => {
      setScreen(isFirstLaunch ? 'setup' : 'locked');
    });

    const removeListener = window.sourcerer.onLocked(() => setScreen('locked'));
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

  if (screen === 'setup') return <Setup onComplete={() => setScreen('locked')} />;
  if (screen === 'locked') return <Unlock onUnlocked={() => setScreen('unlocked')} />;
  return <AppShell />;
}
