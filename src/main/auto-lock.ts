import type { BrowserWindow } from 'electron';
import { closeDatabase, isDatabaseOpen } from './database';
import { closeAllSharedDbs } from './database/shared-db';
import { stopPoller } from './sync/poller';

const IDLE_CHECK_INTERVAL_MS = 60_000;
const DEFAULT_IDLE_THRESHOLD_MS = 15 * 60 * 1000;

const AUTH_WIDTH = 560;
const AUTH_HEIGHT = 720;

class AutoLockManager {
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastInteractionAt = Date.now();
  private idleThresholdMs = DEFAULT_IDLE_THRESHOLD_MS;
  private win: BrowserWindow | null = null;

  start(win: BrowserWindow): void {
    this.win = win;
    this.lastInteractionAt = Date.now();

    win.webContents.on('input-event', () => {
      this.lastInteractionAt = Date.now();
    });

    this.timer = setInterval(() => this.check(), IDLE_CHECK_INTERVAL_MS);
  }

  resetInteraction(): void {
    this.lastInteractionAt = Date.now();
  }

  setIdleThreshold(ms: number): void {
    this.idleThresholdMs = ms;
  }

  private check(): void {
    if (!isDatabaseOpen()) return;
    if (Date.now() - this.lastInteractionAt > this.idleThresholdMs) {
      stopPoller();
      closeAllSharedDbs();
      closeDatabase();
      if (this.win) {
        this.win.setResizable(false);
        this.win.setMinimumSize(0, 0);
        this.win.setSize(AUTH_WIDTH, AUTH_HEIGHT, true);
        this.win.center();
      }
      this.win?.webContents.send('app:locked');
    }
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}

export const autoLock = new AutoLockManager();
