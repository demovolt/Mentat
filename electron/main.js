'use strict';

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const http = require('http');

const { getLogPath, log, setLoggingEnabled, closeLogStream } = require('./logger');
const { loadConfig, saveConfig, loadState, saveState } = require('./config');
const { startStatusServer } = require('./status-server');
const { ensureFirewallRule } = require('./helpers');
const {
  setupWindowsHooks,
  setupUnixClaudeWrapper, setupWslClaudeWrapper, setupPowerShellWrapper,
  setupUnixCodexWrapper, setupWslCodexWrapper, setupPowerShellCodexWrapper,
} = require('./wrappers');
const { setupUnixCodexHooks, setupWslCodexHooks, setupWindowsCodexHooks } = require('./codex-hooks');
const { setupUnixClaudeHooks, setupWslClaudeHooks, hasMentatHooks } = require('./claude-hooks');
const { getShellProfiles } = require('./shell-profiles');
const gitIpc = require('./ipc/git');
const ptyIpc = require('./ipc/pty');

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

function getWorktrees() {
  const { execSync } = require('child_process');
  const cfg = loadConfig();
  const result = [];
  for (const ws of cfg.workspace || []) {
    const wsPath = typeof ws === 'string' ? ws : ws.path;
    if (!wsPath) continue;
    try {
      const raw = execSync('git worktree list --porcelain', { cwd: wsPath, encoding: 'utf8', timeout: 5000 });
      const worktrees = [];
      let current = {};
      for (const line of raw.split('\n')) {
        if (line.startsWith('worktree ')) { current = { path: line.slice(9) }; }
        else if (line.startsWith('branch ')) { current.branch = line.slice(7); worktrees.push(current); }
        else if (line === 'bare') { current.bare = true; worktrees.push(current); }
      }
      result.push({ workspace: wsPath, worktrees });
    } catch {}
  }
  return result;
}

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
    },
  });

  log('INFO', 'Window created');

  mainWindow.webContents.on('render-process-gone', (_e, details) => {
    log('ERROR', 'Renderer process gone:', JSON.stringify(details));
  });
  mainWindow.on('closed', () => log('INFO', 'Window closed'));

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }
}

// ── App lifecycle ─────────────────────────────────────────────────────────────

app.whenReady().then(() => {
  const cfg = loadConfig();
  if (cfg.settings?.loggingEnabled) setLoggingEnabled(true);
  log('INFO', 'App ready');
  createWindow();
  statusServer = startStatusServer(getWindow);
  ensureFirewallRule();
  setupWindowsHooks();
  setupUnixClaudeWrapper();
  setupWslClaudeWrapper();
  setupPowerShellWrapper();
  setupUnixCodexWrapper();
  setupWslCodexWrapper();
  setupPowerShellCodexWrapper();
  setupUnixCodexHooks();
  setupWslCodexHooks();
  setupWindowsCodexHooks();
  setupUnixClaudeHooks();
  setupWslClaudeHooks();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('before-quit', () => {
  for (const [termId, proc] of ptyProcesses) {
    try { proc.kill(); } catch {}
    ptyProcesses.delete(termId);
  }
  statusServer?.close();
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

ipcMain.handle('connection:check', async () => {
  const isWin = process.platform === 'win32';
  const results = [];

  if (isWin) {
    const base = process.env.USERPROFILE || '';
    const winScripts = [
      { id: 'win-claude-wrap', label: 'Claude wrapper', group: 'Windows (.claude)', file: path.join(base, '.claude', 'mentat-claude-wrap.ps1') },
      { id: 'win-codex-wrap',  label: 'Codex wrapper',  group: 'Windows (.codex)',  file: path.join(base, '.codex', 'mentat-codex-wrap.ps1') },
    ];
    for (const s of winScripts) results.push({ ...s, exists: fs.existsSync(s.file) });

    const wslEntries = [
      { id: 'wsl-claude-wrap',    label: 'Claude wrapper', group: 'WSL (.claude)', wslPath: '~/.claude/mentat-claude-wrap.sh' },
      { id: 'wsl-codex-wrap',     label: 'Codex wrapper',  group: 'WSL (.codex)',  wslPath: '~/.codex/mentat-codex-wrap.sh' },
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
      { id: 'claude-wrap',  label: 'Claude wrapper', group: 'Claude', file: path.join(home, '.claude', 'mentat-claude-wrap.sh') },
      { id: 'codex-wrap',   label: 'Codex wrapper',  group: 'Codex',  file: path.join(home, '.codex', 'mentat-codex-wrap.sh') },
    ];
    for (const s of scripts) results.push({ ...s, exists: fs.existsSync(s.file) });

    // Check if mentat hooks are registered in Claude settings
    const settingsPath = path.join(home, '.claude', 'settings.json');
    let hooksRegistered = false;
    try {
      const s = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
      hooksRegistered = hasMentatHooks(s);
    } catch {}
    results.push({ id: 'claude-hooks', label: 'Claude hooks', group: 'Claude', exists: hooksRegistered });
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
ptyIpc.register(ipcMain, { pty, ptyProcesses, getWindow, getShellProfiles });
