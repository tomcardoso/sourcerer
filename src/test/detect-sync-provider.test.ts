import { describe, it, expect } from 'vitest';
import { detectSyncProvider } from '../main/utils';

describe('detectSyncProvider', () => {
  describe('iCloud Drive — Mobile Documents path', () => {
    it('detects iCloud Drive', () => {
      expect(detectSyncProvider('/Users/tom/Library/Mobile Documents/com~apple~CloudDocs/Vault.sourcerer')).toBe('iCloud Drive');
    });
  });

  describe('CloudStorage mount (macOS Ventura+)', () => {
    it('detects OneDrive', () => {
      expect(detectSyncProvider('/Users/tom/Library/CloudStorage/OneDrive-Personal/Vault.sourcerer')).toBe('OneDrive');
    });

    it('detects Google Drive', () => {
      expect(detectSyncProvider('/Users/tom/Library/CloudStorage/GoogleDrive-tom@gmail.com/My Drive/Vault.sourcerer')).toBe('Google Drive');
    });

    it('detects Dropbox', () => {
      expect(detectSyncProvider('/Users/tom/Library/CloudStorage/Dropbox/Vault.sourcerer')).toBe('Dropbox');
    });

    it('detects Box', () => {
      expect(detectSyncProvider('/Users/tom/Library/CloudStorage/Box-tom@box.com/Vault.sourcerer')).toBe('Box');
    });

    it('falls back to iCloud Drive for unknown CloudStorage provider', () => {
      expect(detectSyncProvider('/Users/tom/Library/CloudStorage/SomeUnknownProvider/Vault.sourcerer')).toBe('iCloud Drive');
    });
  });

  describe('legacy / Windows path detection', () => {
    it('detects OneDrive via folder name with trailing slash', () => {
      expect(detectSyncProvider('/Users/tom/OneDrive/Vault.sourcerer')).toBe('OneDrive');
    });

    it('detects OneDrive — Business (dash variant)', () => {
      expect(detectSyncProvider('/Users/tom/OneDrive - Acme Corp/Vault.sourcerer')).toBe('OneDrive');
    });

    it('detects OneDrive on Windows', () => {
      expect(detectSyncProvider('C:\\Users\\tom\\OneDrive\\Vault.sourcerer')).toBe('OneDrive');
    });

    it('detects Google Drive on Windows', () => {
      expect(detectSyncProvider('C:\\Users\\tom\\Google Drive\\Vault.sourcerer')).toBe('Google Drive');
    });

    it('detects Box Sync', () => {
      expect(detectSyncProvider('/Users/tom/Box Sync/Vault.sourcerer')).toBe('Box');
    });

    it('detects Box Drive', () => {
      expect(detectSyncProvider('/Users/tom/Box Drive/Vault.sourcerer')).toBe('Box');
    });

    it('detects Dropbox via common folder name', () => {
      expect(detectSyncProvider('/Users/tom/Dropbox/Vault.sourcerer')).toBe('Dropbox');
    });

    it('detects Dropbox on Windows', () => {
      expect(detectSyncProvider('C:\\Users\\tom\\Dropbox\\Vault.sourcerer')).toBe('Dropbox');
    });
  });

  describe('local paths', () => {
    it('returns null for a path in Documents', () => {
      expect(detectSyncProvider('/Users/tom/Documents/Vault.sourcerer')).toBeNull();
    });

    it('returns null for a path on an external drive', () => {
      expect(detectSyncProvider('/Volumes/MyDrive/Backups/Vault.sourcerer')).toBeNull();
    });

    it('returns null for a Windows local path', () => {
      expect(detectSyncProvider('C:\\Users\\tom\\Documents\\Vault.sourcerer')).toBeNull();
    });
  });
});
