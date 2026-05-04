import type { BrowserWindow } from 'electron';
import { closeDatabase, isDatabaseOpen } from './database';

const IDLE_CHECK_INTERVAL_MS = 60_000;
const DEFAULT_IDLE_THRESHOLD_MS = 15 * 60 * 1000;

class AutoLockManager {
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastInteractionAt = Date.now();
  private idleThresholdMs = DEFAULT_IDLE_THRESHOLD_MS;

  start(win: BrowserWindow): void {
    this.lastInteractionAt = Date.now();

    win.webContents.on('input-event', () => {
      this.lastInteractionAt = Date.now();
    });

    this.timer = setInterval(() => {
      if (!isDatabaseOpen()) return;
      if (Date.now() - this.lastInteractionAt > this.idleThresholdMs) {
        closeDatabase();
        win.webContents.send('app:locked');
      }
    }, IDLE_CHECK_INTERVAL_MS);
  }

  /** Reset the idle clock — call this after any user-initiated IPC action. */
  resetInteraction(): void {
    this.lastInteractionAt = Date.now();
  }

  setIdleThreshold(ms: number): void {
    this.idleThresholdMs = ms;
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}

export const autoLock = new AutoLockManager();
