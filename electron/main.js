'use strict';

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const http = require('http');

const { getLogPath, log, setLoggingEnabled, closeLogStream } = require('./logger');
const { loadConfig, saveConfig, loadState, saveState } = require('./config');
const { startStatusServer, clearAllPidMonitors } = require('./status-server');
const { ensureFirewallRule } = require('./helpers');
const { getShellProfiles } = require('./shell-profiles');
const gitIpc = require('./ipc/git');
const ptyIpc = require('./ipc/pty');
const { installHooks } = require('./hooks-installer');

const isDev = process.env.ELECTRON_IS_DEV === '1';

// ── Global exception handlers ─────────────────────────────────────────────────

process.on('uncaughtException', (err) => {
  log('ERROR', 'uncaughtException:', err.stack || err.message);
  console.error('[mentat] uncaughtException:', err);
});

process.on('unhandledRejection', (reason) => {
  const msg = reason instanceof Error ? reason.stack : String(reason);
  log('ERROR', 'unhandledRejection:', msg);
  console.error('[mentat] unhandledRejection:', reason);
});

// ── PTY ───────────────────────────────────────────────────────────────────────

let pty;
try {
  pty = require('node-pty');
} catch (e) {
  console.error('node-pty unavailable:', e.message);
}

const ptyProcesses = new Map();
let mainWindow;
let statusServer;

const getWindow = () => mainWindow;

// ── Window ────────────────────────────────────────────────────────────────────

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 500,
    frame: false,
    backgroundColor: '#0f0f0f',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      devTools: isDev,
    },
  });

  log('INFO', 'Window created');

  mainWindow.webContents.on('render-process-gone', (_e, details) => {
    log('ERROR', 'Renderer process gone:', JSON.stringify(details));
    console.error('[mentat] render-process-gone:', details.reason, 'exitCode:', details.exitCode);
  });
  mainWindow.on('closed', () => log('INFO', 'Window closed'));

  if (!isDev) {
    mainWindow.webContents.session?.webRequest?.onHeadersReceived((details, callback) => {
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          'Content-Security-Policy': [
            "default-src 'self'; script-src 'self' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; font-src 'self' data:; img-src 'self' data: blob:; connect-src 'self' http://127.0.0.1:* ws://127.0.0.1:*",
          ],
        },
      });
    });
  }

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }
}

// ── App lifecycle ─────────────────────────────────────────────────────────────

let statusPort = 27182;

app.whenReady().then(() => {
  const cfg = loadConfig();
  if (cfg.settings?.loggingEnabled) setLoggingEnabled(true);
  log('INFO', 'App ready');
  createWindow();
  statusServer = startStatusServer(getWindow, (port) => { statusPort = port; });
  setImmediate(ensureFirewallRule);
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('before-quit', () => {
  clearAllPidMonitors();
  for (const proc of ptyProcesses.values()) {
    try { proc.kill(); } catch {}
  }
  ptyProcesses.clear();
  if (statusServer) {
    try { statusServer.closeAllConnections?.(); } catch {}
    statusServer.close();
  }
  closeLogStream();
});

app.on('window-all-closed', () => {
  log('INFO', 'All windows closed');
  if (process.platform !== 'darwin') app.quit();
});

// ── IPC: Window controls ──────────────────────────────────────────────────────

ipcMain.on('window:minimize', () => mainWindow?.minimize());
ipcMain.on('window:toggle-maximize', () => {
  if (!mainWindow) return;
  mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize();
});
ipcMain.on('window:close', () => mainWindow?.close());

// ── IPC: Logging ──────────────────────────────────────────────────────────────

ipcMain.handle('logging:set-enabled', (_e, enabled) => setLoggingEnabled(enabled));
ipcMain.handle('logging:get-path', () => getLogPath());
ipcMain.handle('app:version', () => app.getVersion());
ipcMain.on('log:renderer-error', (_e, msg) => log('ERROR', '[renderer]', msg));

// ── IPC: Config & state ───────────────────────────────────────────────────────

ipcMain.handle('config:get', () => loadConfig());
ipcMain.handle('config:save', (_e, cfg) => saveConfig(cfg));
ipcMain.handle('state:get', () => loadState());
ipcMain.handle('state:save', (_e, state) => saveState(state));
ipcMain.handle('shell:get-profiles', () => getShellProfiles());

// ── IPC: Dialog ───────────────────────────────────────────────────────────────

ipcMain.handle('dialog:open-folder', async () => {
  if (process.platform === 'win32') {
    try {
      const ps = `$sh = New-Object -ComObject Shell.Application; $f = $sh.BrowseForFolder(0, 'Select repository folder', 0, 0); if ($f) { Write-Output $f.Self.Path }`;
      const result = execFileSync(
        'powershell.exe',
        ['-NoProfile', '-NonInteractive', '-Command', ps],
        { encoding: 'utf8' }
      ).trim();
      return result || null;
    } catch {
      return null;
    }
  }
  const { dialog } = require('electron');
  const result = await dialog.showOpenDialog({ properties: ['openDirectory'] });
  return result.canceled ? null : result.filePaths[0];
});

// ── IPC: Connection check ─────────────────────────────────────────────────────

ipcMain.handle('hooks:install', async () => {
  try {
    const results = await installHooks();
    log('INFO', 'Hooks install:', JSON.stringify(results));
    return { ok: true, results };
  } catch (e) {
    log('ERROR', 'Hooks install failed:', e.message);
    return { ok: false, error: e.message, results: [] };
  }
});

ipcMain.handle('connection:check', async () => {
  const isWin = process.platform === 'win32';
  const results = [];

  if (isWin) {
    const base = process.env.USERPROFILE || '';
    const winScripts = [
      { id: 'win-claude-hook', label: 'Claude hook', group: 'Windows (.claude)', file: path.join(base, '.claude', 'mentat-hook.ps1') },
      { id: 'win-codex-hook',  label: 'Codex hook',  group: 'Windows (.codex)',  file: path.join(base, '.codex', 'mentat-hook.ps1') },
    ];
    for (const s of winScripts) results.push({ ...s, exists: fs.existsSync(s.file) });

    const wslEntries = [
      { id: 'wsl-claude-hook', label: 'Claude hook', group: 'WSL (.claude)', wslPath: '~/.claude/mentat-hook.sh' },
      { id: 'wsl-codex-hook',  label: 'Codex hook',  group: 'WSL (.codex)',  wslPath: '~/.codex/mentat-hook.sh' },
    ];
    try {
      const cmd = wslEntries.map(s => `[ -f ${s.wslPath} ] && echo 1 || echo 0`).join(';');
      const out = execFileSync('wsl.exe', ['--', 'bash', '-c', cmd], { encoding: 'utf8', timeout: 5000 });
      const lines = out.trim().split('\n').map(l => l.trim());
      wslEntries.forEach((s, i) => results.push({ ...s, exists: lines[i] === '1' }));
    } catch {
      wslEntries.forEach(s => results.push({ ...s, exists: false }));
    }
  } else {
    const home = process.env.HOME || '';
    const scripts = [
      { id: 'claude-hook', label: 'Claude hook', group: 'Claude', file: path.join(home, '.claude', 'mentat-hook.sh') },
      { id: 'codex-hook',  label: 'Codex hook',  group: 'Codex',  file: path.join(home, '.codex', 'mentat-hook.sh') },
    ];
    for (const s of scripts) results.push({ ...s, exists: fs.existsSync(s.file) });

  }

  let serverRunning = false;
  try {
    const body = '{"termId":"__check__","status":"idle"}';
    await new Promise((resolve) => {
      const req = http.request(
        { host: '127.0.0.1', port: 27182, path: '/status', method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } },
        (res) => { res.resume(); serverRunning = res.statusCode < 500; resolve(); }
      );
      req.setTimeout(1500, () => { req.destroy(); resolve(); });
      req.on('error', () => resolve());
      req.write(body);
      req.end();
    });
  } catch {}

  return { scripts: results, serverRunning };
});

ipcMain.handle('connection:send-test-status', async (_e, status) => {
  const body = JSON.stringify({ termId: '__mentat_test__', status });
  try {
    const code = await new Promise((resolve, reject) => {
      const req = http.request(
        { host: '127.0.0.1', port: 27182, path: '/status', method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } },
        (res) => { res.resume(); resolve(res.statusCode); }
      );
      req.setTimeout(2000, () => { req.destroy(); reject(new Error('timeout')); });
      req.on('error', reject);
      req.write(body);
      req.end();
    });
    return { ok: code < 300 };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// ── IPC: Git & PTY ────────────────────────────────────────────────────────────

gitIpc.register(ipcMain);
ptyIpc.register(ipcMain, { pty, ptyProcesses, getWindow, getShellProfiles, getStatusPort: () => statusPort });
