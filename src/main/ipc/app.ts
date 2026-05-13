import { ipcMain } from 'electron';
import { getDatabase } from '../database';
import { autoLock } from '../auto-lock';
import type { User } from '@shared/types';

export function registerAppHandlers(): void {
  ipcMain.handle('app:lock', (): void => {
    autoLock.lock();
  });

  ipcMain.handle('app:get-user', (): User => {
    // calendar_token is a sensitive secret; it is exposed only via the dedicated
    // settings:get-calendar-url handler which constructs the full URL server-side.
    return getDatabase()
      .prepare(
        `SELECT id, first_name, last_name, email, created_at, idle_timeout_seconds,
                phone_country, outreach_reminders_enabled, outreach_require_interaction,
                staleness_enabled, staleness_threshold_days, alert_notifications_enabled,
                reminder_notifications_enabled, rss_poll_interval_hours, wayback_enabled
         FROM users WHERE id = 1`,
      )
      .get() as User;
  });
}
