/**
 * Renderer (client) type for Electron preload API.
 * Ensures window.electronAPI is typed when using from React/Vite.
 */
export {};

declare global {
  interface Window {
    electronAPI?: {
      openPdfDialog?: () => Promise<string[]>;
      savePdfDialog?: (defaultName: string) => Promise<string | undefined>;
      writePdf?: (filePath: string, base64: string) => Promise<{ success: boolean }>;
      getVersion?: () => Promise<string>;
      getDataPaths?: () => Promise<{ userData: string; db: string; storage: string }>;
      openExternal?: (url: string) => Promise<void>;
      checkForUpdates?: () => Promise<void>;
      installUpdate?: () => Promise<void>;
      onOpenPdf?: (cb: (filePath: string) => void) => () => void;
      onUpdateAvailable?: (cb: () => void) => () => void;
      onUpdateDownloaded?: (cb: () => void) => () => void;
      onNavigateTo?: (cb: (path: string) => void) => () => void;
      isMac?: boolean;
      isDesktop?: boolean;
    };
    __openLicense?: () => void;
  }
}
