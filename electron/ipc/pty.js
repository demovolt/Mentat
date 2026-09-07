'use strict';

const { execFileSync } = require('child_process');
const { parseWslPath, winToLinux, getWslHostIp, getOwnLinuxIp } = require('../helpers');
const { terminalStatuses, terminalSessionActive, terminalSessionIds, terminalAgents } = require('../terminal-state');
const { log } = require('../logger');

const SAFE_ID_RE = /^[a-zA-Z0-9_-]+$/;
const SAFE_HOST_RE = /^(\d{1,3}\.){3}\d{1,3}$|^[a-zA-Z0-9][-a-zA-Z0-9.]*$/;
const ALLOWED_AI_EXES = new Set(['claude', 'codex', 'claude.exe', 'codex.exe']);

const BLOCKED_ENV_PREFIXES = ['npm_', 'ELECTRON_'];
const BLOCKED_ENV_KEYS = new Set([
  'NODE_ENV', 'NODE_OPTIONS', 'NODE_EXTRA_CA_CERTS', 'NODE_TLS_REJECT_UNAUTHORIZED',
]);

function safeEnv() {
  const env = {};
  for (const [key, val] of Object.entries(process.env)) {
    if (BLOCKED_ENV_KEYS.has(key)) continue;
    if (BLOCKED_ENV_PREFIXES.some(p => key.startsWith(p))) continue;
    env[key] = val;
  }
  return env;
}

function register(ipcMain, { pty, ptyProcesses, getWindow, getShellProfiles, getStatusPort }) {
  ipcMain.on('pty:create', (_e, { termId, worktreePath, shellId, type, aiCommand, sessionId }) => {
    if (!pty) return;
    log('INFO', 'PTY create:', termId, 'path:', worktreePath, 'type:', type || 'shell', 'shell:', shellId || 'default');

    const wsl = parseWslPath(worktreePath);
    const profile = shellId ? getShellProfiles().find(p => p.id === shellId) : null;

    const spawnWsl = profile?.wsl || (!profile && wsl && process.platform === 'win32');
    const spawnWinShell = process.platform !== 'win32' && profile && !profile.wsl &&
      profile.cmd && /\.exe$/i.test(profile.cmd);

    let statusHost;
    if (spawnWsl) {
      statusHost = getWslHostIp(profile?.distro || wsl?.distro);
    } else if (spawnWinShell) {
      statusHost = getOwnLinuxIp();
    }

    const statusEnv = {};
    if (statusHost) statusEnv.MENTAT_STATUS_HOST = statusHost;
    if (spawnWsl) {
      const wslVars = statusHost ? 'MENTAT_TERM_ID:MENTAT_STATUS_HOST' : 'MENTAT_TERM_ID';
      const existing = process.env.WSLENV;
      statusEnv.WSLENV = existing ? `${existing}:${wslVars}` : wslVars;

      const distro = profile?.distro || wsl?.distro;
      const host = statusHost || '127.0.0.1';
      if (SAFE_ID_RE.test(termId) && SAFE_HOST_RE.test(host)) {
        try {
          execFileSync('wsl.exe',
            ['-d', distro, '--', 'bash', '-c',
             `printf 'export MENTAT_TERM_ID=%s\\nexport MENTAT_STATUS_HOST=%s\\n' '${termId}' '${host}' > /tmp/mentat_env.sh`],
            { timeout: 3000 });
        } catch (e) { log('WARN', 'WSL env setup failed:', e.message); }
      }
    }

    const statusPort = getStatusPort ? getStatusPort() : 27182;
    const spawnOpts = (cwd, extraEnv = {}) => ({
      name: 'xterm-256color', cols: 80, rows: 24,
      cwd, env: { ...safeEnv(), MENTAT_TERM_ID: termId, MENTAT_STATUS_PORT: String(statusPort), ...extraEnv },
    });

    let proc;

    if (type === 'ai') {
      const rawExe = (aiCommand || 'claude').trim().split(/\s+/)[0];
      const claudeExe = ALLOWED_AI_EXES.has(rawExe) ? rawExe : 'claude';
      const resumeArgs = sessionId ? ['--resume', sessionId] : [];

      terminalSessionActive.set(termId, true);
      const win = getWindow();
      if (win && !win.isDestroyed())
        win.webContents.send('worktree:status-changed', { termId, status: null, sessionActive: true });

      if (wsl && process.platform === 'win32') {
        const allArgs = [claudeExe, ...resumeArgs];
        const cmdStr = allArgs.map(a => `'${a.replace(/'/g, "'\\''")}'`).join(' ');
        proc = pty.spawn(
          'wsl.exe',
          ['-d', wsl.distro, '--cd', wsl.linuxPath, '--', 'bash', '--login', '-c', `exec ${cmdStr}`],
          spawnOpts(process.env.USERPROFILE || 'C:\\', statusEnv)
        );
      } else {
        proc = pty.spawn(claudeExe, [...resumeArgs], spawnOpts(worktreePath, statusEnv));
      }
    } else if (profile?.wsl) {
      const linuxPath = wsl ? wsl.linuxPath : worktreePath;
      proc = pty.spawn('wsl.exe', ['-d', profile.distro, '--cd', linuxPath],
        spawnOpts(process.env.USERPROFILE || 'C:\\', statusEnv));
    } else if (profile) {
      const winCwd = wsl ? winToLinux(wsl.distro, wsl.linuxPath) : worktreePath;
      proc = pty.spawn(profile.cmd, profile.args || [],
        spawnOpts(winCwd, statusEnv));
    }

    if (!proc) {
      if (wsl && process.platform === 'win32') {
        proc = pty.spawn('wsl.exe', ['-d', wsl.distro, '--cd', wsl.linuxPath],
          spawnOpts(process.env.USERPROFILE || 'C:\\', statusEnv));
      } else {
        const shell = process.platform === 'win32'
          ? (process.env.COMSPEC || 'powershell.exe')
          : (process.env.SHELL || '/bin/bash');
        proc = pty.spawn(shell, [], spawnOpts(worktreePath));
      }
    }

    let ptyBuffer = '';
    let ptyFlushTimer = null;

    const flushPtyBuffer = () => {
      const win = getWindow();
      if (ptyBuffer && win && !win.isDestroyed()) {
        try {
          win.webContents.send('pty:data', { termId, data: ptyBuffer });
        } catch { /* renderer frame disposed, ignore */ }
        ptyBuffer = '';
      }
      ptyFlushTimer = null;
    };

    ptyProcesses.set(termId, proc);

    const PTY_BUFFER_CAP = 65536; // 64 KB — flush immediately if exceeded
    proc.onData(data => {
      ptyBuffer += data;
      if (ptyBuffer.length >= PTY_BUFFER_CAP) {
        clearTimeout(ptyFlushTimer);
        ptyFlushTimer = null;
        flushPtyBuffer();
      } else if (!ptyFlushTimer) {
        ptyFlushTimer = setTimeout(flushPtyBuffer, 16);
      }
    });

    proc.onExit(({ exitCode }) => {
      if (ptyFlushTimer) { clearTimeout(ptyFlushTimer); flushPtyBuffer(); }
      ptyProcesses.delete(termId);
      log('INFO', 'PTY exited:', termId, 'exitCode:', exitCode);
      if (type === 'ai') {
        terminalSessionActive.set(termId, false);
        terminalStatuses.delete(termId);
        const win = getWindow();
        if (win && !win.isDestroyed()) {
          win.webContents.send('worktree:status-changed', { termId, status: null, sessionActive: false });
          win.webContents.send('pty:exited', { termId });
        }
      }
    });
  });

  ipcMain.on('pty:write', (_e, { termId, data }) => {
    try { ptyProcesses.get(termId)?.write(data); } catch {}
  });

  ipcMain.on('pty:resize', (_e, { termId, cols, rows }) => {
    try { ptyProcesses.get(termId)?.resize(cols, rows); } catch {}
  });

  ipcMain.on('pty:close', (_e, { termId }) => {
    log('INFO', 'PTY close:', termId);
    const proc = ptyProcesses.get(termId);
    if (proc) { proc.kill(); ptyProcesses.delete(termId); }
    terminalStatuses.delete(termId);
    terminalSessionActive.delete(termId);
    terminalSessionIds.delete(termId);
    terminalAgents.delete(termId);
  });
}

module.exports = { register };
