// Stub for the 'electron' module used in production code.
// Vitest in Node mode cannot load the real Electron runtime.
// Tests that need specific behaviour (e.g. Notification) use vi.mock() directly.
export const app = {};
export const ipcMain = { handle: () => {} };
export const ipcRenderer = { invoke: () => Promise.resolve() };
export const dialog = {
  showOpenDialog: () => Promise.resolve({ canceled: true, filePaths: [] }),
  showSaveDialog: () => Promise.resolve({ canceled: true }),
};
export const shell = {};
export class BrowserWindow {
  static getAllWindows() { return []; }
  webContents = { send: () => {} };
}
export class Notification {
  show() {}
}
export const nativeTheme = { shouldUseDarkColors: false };
export default { app, ipcMain, ipcRenderer, dialog, shell, BrowserWindow, Notification, nativeTheme };
