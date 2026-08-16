'use strict';

const { execFileSync } = require('child_process');
const { parseWslPath, getWslHostIp, getOwnLinuxIp } = require('../helpers');
const { terminalStatuses, terminalSessionActive } = require('../terminal-state');
const { log } = require('../logger');

const SAFE_ID_RE = /^[a-zA-Z0-9_-]+$/;
const SAFE_HOST_RE = /^(\d{1,3}\.){3}\d{1,3}$|^[a-zA-Z0-9][-a-zA-Z0-9.]*$/;
const ALLOWED_AI_EXES = new Set(['claude', 'codex', 'claude.exe', 'codex.exe']);

function register(ipcMain, { pty, ptyProcesses, getWindow, getShellProfiles }) {
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
        } catch {}
      }
    }

    const baseEnv = {
      PATH: process.env.PATH,
      HOME: process.env.HOME,
      USER: process.env.USER,
      SHELL: process.env.SHELL,
      TERM: process.env.TERM,
      LANG: process.env.LANG,
      USERPROFILE: process.env.USERPROFILE,
      APPDATA: process.env.APPDATA,
      LOCALAPPDATA: process.env.LOCALAPPDATA,
      WSLENV: process.env.WSLENV,
      COMSPEC: process.env.COMSPEC,
      SYSTEMROOT: process.env.SystemRoot || process.env.SYSTEMROOT,
    };
    Object.keys(baseEnv).forEach(k => baseEnv[k] === undefined && delete baseEnv[k]);

    const spawnOpts = (cwd, extraEnv = {}) => ({
      name: 'xterm-256color', cols: 80, rows: 24,
      cwd, env: { ...baseEnv, MENTAT_TERM_ID: termId, ...extraEnv },
    });

    let proc;

    if (type === 'ai') {
      const parts = (aiCommand || 'claude').trim().split(/\s+/);
      const [rawExe, ...claudeArgs] = parts;
      const claudeExe = ALLOWED_AI_EXES.has(rawExe) ? rawExe : 'claude';
      const resumeArgs = sessionId ? ['--resume', sessionId] : [];

      terminalSessionActive.set(termId, true);
      const win = getWindow();
      if (win && !win.isDestroyed())
        win.webContents.send('worktree:status-changed', { termId, status: null, sessionActive: true });

      if (wsl && process.platform === 'win32') {
        const allArgs = [claudeExe, ...resumeArgs, ...claudeArgs];
        const cmdStr = allArgs.map(a => `'${a.replace(/'/g, "'\\''")}'`).join(' ');
        proc = pty.spawn(
          'wsl.exe',
          ['-d', wsl.distro, '--cd', wsl.linuxPath, '--', 'bash', '--login', '-c', `exec ${cmdStr}`],
          spawnOpts(process.env.USERPROFILE || 'C:\\', statusEnv)
        );
      } else {
        proc = pty.spawn(claudeExe, [...resumeArgs, ...claudeArgs], spawnOpts(worktreePath, statusEnv));
      }
    } else if (profile?.wsl) {
      const linuxPath = wsl ? wsl.linuxPath : worktreePath;
      proc = pty.spawn('wsl.exe', ['-d', profile.distro, '--cd', linuxPath],
        spawnOpts(process.env.USERPROFILE || 'C:\\', statusEnv));
    } else if (profile) {
      proc = pty.spawn(profile.cmd, profile.args || [],
        spawnOpts(wsl ? (process.env.USERPROFILE || 'C:\\') : worktreePath, statusEnv));
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
        win.webContents.send('pty:data', { termId, data: ptyBuffer });
        ptyBuffer = '';
      }
      ptyFlushTimer = null;
    };

    ptyProcesses.set(termId, proc);

    proc.onData(data => {
      ptyBuffer += data;
      if (!ptyFlushTimer) {
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
  });
}

module.exports = { register };
