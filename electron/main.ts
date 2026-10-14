import { app, BrowserWindow, shell, ipcMain, dialog, Menu, nativeImage } from 'electron';
import { spawn, ChildProcess } from 'child_process';
import { createServer } from 'net';
import path from 'path';
import { fileURLToPath } from 'url';
import * as fs from 'fs';
import log from 'electron-log';
import { autoUpdater } from 'electron-updater';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// In dev: electron/main.ts is at pdfezfill_desktop/electron/ → APP_ROOT = pdfezfill_desktop/
// In prod: compiled main.js is at dist/electron/main/ → APP_ROOT = dist/ (server bundle lives there)
const isDev = process.env.NODE_ENV === 'development';
const APP_ROOT = isDev
  ? path.join(__dirname, '..')      // pdfezfill_desktop/electron/../  = pdfezfill_desktop/
  : path.join(__dirname, '..', '..', '..'); // dist/electron/main/../../..  = pdfezfill_desktop/

let mainWindow: BrowserWindow | null = null;
let expressProcess: ChildProcess | null = null;
let ocrProcess: ChildProcess | null = null;
let expressPort = 5000;

// ─── Logging ───────────────────────────────────────────────────────────────
log.transports.file.level = 'info';
log.transports.console.level = isDev ? 'debug' : 'warn';
autoUpdater.logger = log;

// ─── Find a free port ──────────────────────────────────────────────────────
function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address() as { port: number };
      server.close(() => resolve(addr.port));
    });
    server.on('error', reject);
  });
}

// ─── Start Express server ──────────────────────────────────────────────────
async function startExpressServer(port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const serverEntry = isDev
      ? path.join(APP_ROOT, 'server', 'index-desktop.ts')
      : path.join(APP_ROOT, 'dist', 'index-desktop.cjs');

    const env = {
      ...process.env,
      NODE_ENV: isDev ? 'development' : 'production',
      PORT: String(port),
      DESKTOP_MODE: 'true',
      // Point to local SQLite DB in user data directory
      SQLITE_DB_PATH: path.join(app.getPath('userData'), 'pdfezfill.db'),
      // Local storage for PDFs
      LOCAL_STORAGE_PATH: path.join(app.getPath('userData'), 'storage'),
      // License key storage
      LICENSE_KEY_PATH: path.join(app.getPath('userData'), 'license.json'),
    };

    if (isDev) {
      expressProcess = spawn('npx', ['tsx', serverEntry], {
        env,
        cwd: APP_ROOT,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } else {
      expressProcess = spawn(process.execPath, [serverEntry], {
        env,
        cwd: APP_ROOT,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    }

    let started = false;
    const timeout = setTimeout(() => {
      if (!started) reject(new Error('Express server timed out'));
    }, 15000);

    expressProcess.stdout?.on('data', (data: Buffer) => {
      const msg = data.toString();
      log.info(`[server] ${msg.trim()}`);
      if (!started && msg.includes(`serving on port`)) {
        started = true;
        clearTimeout(timeout);
        resolve();
      }
    });

    expressProcess.stderr?.on('data', (data: Buffer) => {
      log.error(`[server:err] ${data.toString().trim()}`);
    });

    expressProcess.on('exit', (code) => {
      log.warn(`[server] exited with code ${code}`);
    });
  });
}

// ─── Start Python OCR sidecar ──────────────────────────────────────────────
async function startOcrSidecar(): Promise<void> {
  const ocrPort = 5050;

  // Check if OCR service is already running
  try {
    const response = await fetch(`http://127.0.0.1:${ocrPort}/health`);
    if (response.ok) {
      log.info('[ocr] OCR service already running');
      return;
    }
  } catch {
    // Not running, start it
  }

  const pythonExe = isDev
    ? 'python3'
    : path.join(process.resourcesPath, 'python', 'ocr_service');

  const scriptArg = isDev
    ? path.join(APP_ROOT, 'server', 'python', 'ocr_service.py')
    : '';

  const args = isDev ? [scriptArg] : [];

  log.info(`[ocr] Starting OCR sidecar at port ${ocrPort}`);
  ocrProcess = spawn(pythonExe, args, {
    env: { ...process.env, OCR_PORT: String(ocrPort) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  ocrProcess.stdout?.on('data', (d: Buffer) => log.info(`[ocr] ${d.toString().trim()}`));
  ocrProcess.stderr?.on('data', (d: Buffer) => log.warn(`[ocr:err] ${d.toString().trim()}`));

  // Wait up to 30s for OCR to start
  const start = Date.now();
  while (Date.now() - start < 30000) {
    try {
      const res = await fetch(`http://127.0.0.1:${ocrPort}/health`);
      if (res.ok) { log.info('[ocr] OCR sidecar ready'); return; }
    } catch {}
    await new Promise(r => setTimeout(r, 500));
  }
  log.warn('[ocr] OCR sidecar did not start in 30s — extraction will fall back to local engine');
}

// ─── Create main window ────────────────────────────────────────────────────
function createWindow(): void {
  const iconPath = path.join(APP_ROOT, 'assets', 'icon.png');

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    title: 'PdfEzFill',
    icon: fs.existsSync(iconPath) ? nativeImage.createFromPath(iconPath) : undefined,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false, // needed for preload IPC
    },
    backgroundColor: '#ffffff',
    show: false, // show after ready-to-show
  });

  const url = isDev
    ? `http://127.0.0.1:${expressPort}`
    : `http://127.0.0.1:${expressPort}`;

  mainWindow.loadURL(url);

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
    if (isDev) mainWindow?.webContents.openDevTools();
  });

  // Open external links in system browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://') || url.startsWith('http://')) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  mainWindow.on('closed', () => { mainWindow = null; });
}

// ─── App Menu ──────────────────────────────────────────────────────────────
function buildMenu(): void {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: 'PdfEzFill',
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        {
          label: 'License & Activation',
          click: () => mainWindow?.webContents.executeJavaScript('window.__openLicense?.()'),
        },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'File',
      submenu: [
        {
          label: 'Open PDF…',
          accelerator: 'CmdOrCtrl+O',
          click: async () => {
            const result = await dialog.showOpenDialog(mainWindow!, {
              properties: ['openFile'],
              filters: [{ name: 'PDF Files', extensions: ['pdf'] }],
            });
            if (!result.canceled && result.filePaths.length > 0) {
              mainWindow?.webContents.send('open-pdf', result.filePaths[0]);
            }
          },
        },
        { type: 'separator' },
        { role: 'close' },
      ],
    },
    { label: 'Edit', submenu: [
      { role: 'undo' }, { role: 'redo' }, { type: 'separator' },
      { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' },
    ]},
    { label: 'View', submenu: [
      { role: 'reload' }, { role: 'forceReload' },
      ...(isDev ? [{ role: 'toggleDevTools' as const }] : []),
      { type: 'separator' as const },
      { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' },
      { type: 'separator' as const },
      { role: 'togglefullscreen' },
    ]},
    { role: 'window', submenu: [{ role: 'minimize' }, { role: 'zoom' }, { role: 'front' }] },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ─── IPC handlers ──────────────────────────────────────────────────────────
function registerIpcHandlers(): void {
  // File picker for PDF drop zone
  ipcMain.handle('dialog:openPdf', async () => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'PDF Files', extensions: ['pdf'] }],
    });
    return result.filePaths;
  });

  // Save file dialog (for downloading filled PDFs)
  ipcMain.handle('dialog:savePdf', async (_event, defaultName: string) => {
    const result = await dialog.showSaveDialog(mainWindow!, {
      defaultPath: defaultName,
      filters: [{ name: 'PDF Files', extensions: ['pdf'] }],
    });
    return result.filePath;
  });

  // Save file to disk
  ipcMain.handle('fs:writePdf', async (_event, filePath: string, base64: string) => {
    fs.writeFileSync(filePath, Buffer.from(base64, 'base64'));
    return { success: true };
  });

  // Get app version
  ipcMain.handle('app:version', () => app.getVersion());

  // Open external URL (for purchase link)
  ipcMain.handle('shell:openExternal', (_event, url: string) => {
    shell.openExternal(url);
  });

  // Check for updates
  ipcMain.handle('app:checkUpdates', () => {
    if (!isDev) autoUpdater.checkForUpdatesAndNotify();
  });

  // Get data paths (for debug)
  ipcMain.handle('app:dataPaths', () => ({
    userData: app.getPath('userData'),
    db: path.join(app.getPath('userData'), 'pdfezfill.db'),
    storage: path.join(app.getPath('userData'), 'storage'),
  }));
}

// ─── Auto-updater ─────────────────────────────────────────────────────────
function setupAutoUpdater(): void {
  if (isDev) return;

  autoUpdater.on('update-available', () => {
    mainWindow?.webContents.send('update-available');
  });
  autoUpdater.on('update-downloaded', () => {
    mainWindow?.webContents.send('update-downloaded');
  });
  ipcMain.handle('app:installUpdate', () => {
    autoUpdater.quitAndInstall();
  });
}

// ─── App lifecycle ─────────────────────────────────────────────────────────
app.on('ready', async () => {
  try {
    // Ensure storage directories exist
    const storageDir = path.join(app.getPath('userData'), 'storage');
    fs.mkdirSync(storageDir, { recursive: true });

    expressPort = isDev ? 5000 : await findFreePort();

    log.info(`[app] Starting on port ${expressPort}`);

    // Start servers concurrently
    await Promise.all([
      startExpressServer(expressPort),
      startOcrSidecar(),
    ]);

    buildMenu();
    registerIpcHandlers();
    setupAutoUpdater();
    createWindow();

    if (!isDev) {
      autoUpdater.checkForUpdatesAndNotify();
    }
  } catch (err) {
    log.error('[app] Startup failed:', err);
    dialog.showErrorBox('Startup Error', `Failed to start PdfEzFill: ${err}`);
    app.quit();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (mainWindow === null) createWindow();
});

app.on('will-quit', () => {
  expressProcess?.kill('SIGTERM');
  ocrProcess?.kill('SIGTERM');
});
