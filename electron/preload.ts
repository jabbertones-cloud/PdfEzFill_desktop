import { contextBridge, ipcRenderer } from 'electron';

// Expose safe APIs to renderer (React app)
contextBridge.exposeInMainWorld('electronAPI', {
  // File dialogs
  openPdfDialog: () => ipcRenderer.invoke('dialog:openPdf'),
  savePdfDialog: (defaultName: string) => ipcRenderer.invoke('dialog:savePdf', defaultName),

  // File system
  writePdf: (filePath: string, base64: string) => ipcRenderer.invoke('fs:writePdf', filePath, base64),

  // App info
  getVersion: () => ipcRenderer.invoke('app:version'),
  getDataPaths: () => ipcRenderer.invoke('app:dataPaths'),

  // External links (Stripe purchase page, etc.)
  openExternal: (url: string) => ipcRenderer.invoke('shell:openExternal', url),

  // Updates
  checkForUpdates: () => ipcRenderer.invoke('app:checkUpdates'),
  installUpdate: () => ipcRenderer.invoke('app:installUpdate'),

  // Event listeners (main → renderer)
  onOpenPdf: (callback: (filePath: string) => void) => {
    ipcRenderer.on('open-pdf', (_event, filePath) => callback(filePath));
    return () => ipcRenderer.removeAllListeners('open-pdf');
  },
  onUpdateAvailable: (callback: () => void) => {
    ipcRenderer.on('update-available', callback);
    return () => ipcRenderer.removeAllListeners('update-available');
  },
  onUpdateDownloaded: (callback: () => void) => {
    ipcRenderer.on('update-downloaded', callback);
    return () => ipcRenderer.removeAllListeners('update-downloaded');
  },

  // Platform
  isMac: process.platform === 'darwin',
  isDesktop: true,
});

// Type declarations for renderer
declare global {
  interface Window {
    electronAPI: {
      openPdfDialog: () => Promise<string[]>;
      savePdfDialog: (defaultName: string) => Promise<string | undefined>;
      writePdf: (filePath: string, base64: string) => Promise<{ success: boolean }>;
      getVersion: () => Promise<string>;
      getDataPaths: () => Promise<{ userData: string; db: string; storage: string }>;
      openExternal: (url: string) => Promise<void>;
      checkForUpdates: () => Promise<void>;
      installUpdate: () => Promise<void>;
      onOpenPdf: (cb: (filePath: string) => void) => () => void;
      onUpdateAvailable: (cb: () => void) => () => void;
      onUpdateDownloaded: (cb: () => void) => () => void;
      isMac: boolean;
      isDesktop: boolean;
    };
    __openLicense?: () => void;
  }
}
