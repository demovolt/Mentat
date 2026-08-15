'use strict';

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const http = require('http');
const os = require('os');
const { parseWorktrees, parseWslPath, winToLinux, isRunningInWSL, gitRun } = require('./helpers');

const isDev = process.env.ELECTRON_IS_DEV === '1';

// ── Logger ────────────────────────────────────────────────────────────────────

let logEnabled = false;
let logStream = null;

function getLogPath() {
  return isDev
    ? path.join(app.getAppPath(), 'mentat.log')
    : path.join(path.dirname(process.execPath), 'mentat.log');
}

function log(level, ...args) {
  if (!logEnabled) return;
  const line = `[${new Date().toISOString()}] [${level}] ${args.join(' ')}`;
  if (!logStream) logStream = fs.createWriteStream(getLogPath(), { flags: 'a' });
  logStream.write(line + '\n');
}

function setLoggingEnabled(enabled) {
  logEnabled = !!enabled;
  if (!enabled && logStream) { logStream.end(); logStream = null; }
  if (enabled) log('INFO', 'Logging enabled. Path:', getLogPath());
}

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

let pty;
try {
  pty = require('node-pty');
} catch (e) {
  console.error('node-pty unavailable:', e.message);
}

const ptyProcesses = new Map();
let mainWindow;

// ── Claude activity status ────────────────────────────────────────────────────

const terminalStatuses = new Map();
const terminalSessionActive = new Map();
const terminalSessionIds = new Map();
let statusServer = null;

function startStatusServer() {
  statusServer = http.createServer((req, res) => {
    if (req.method !== 'POST') { res.writeHead(404).end(); return; }

    if (req.url === '/session') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        try {
          const { termId, sessionId } = JSON.parse(body);
          if (!termId || !sessionId) { res.writeHead(400).end(); return; }
          if (!terminalSessionIds.has(termId)) {
            terminalSessionIds.set(termId, sessionId);
            log('INFO', 'Session id assigned:', termId, sessionId);
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send('session:id-updated', { termId, sessionId });
            }
          }
          res.writeHead(200).end('ok');
        } catch { res.writeHead(400).end(); }
      });
      return;
    }

    if (req.url !== '/status') { res.writeHead(404).end(); return; }
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const { termId, status } = JSON.parse(body);
        const validStatuses = ['working', 'idle', 'thinking', 'waiting', 'session_start', 'session_stop'];
        if (!termId || !validStatuses.includes(status)) {
          res.writeHead(400).end(); return;
        }
        log('INFO', 'Status update:', termId, status);
        if (status === 'session_start') {
          terminalSessionActive.set(termId, true);
        } else if (status === 'session_stop') {
          terminalSessionActive.set(termId, false);
          terminalStatuses.delete(termId);
        } else {
          terminalSessionActive.set(termId, true);
          terminalStatuses.set(termId, status);
        }
        const sessionActive = terminalSessionActive.get(termId) ?? false;
        const currentStatus = terminalStatuses.get(termId) ?? null;
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('worktree:status-changed', { termId, status: currentStatus, sessionActive });
        }
        res.writeHead(200).end('ok');
      } catch { res.writeHead(400).end(); }
    });
  });
  statusServer.on('error', err => {
    log('ERROR', 'Status server error:', err.message);
    if (err.code !== 'EADDRINUSE') console.error('[mentat] status server:', err);
  });
  statusServer.listen(27182, '0.0.0.0', () => {
    log('INFO', 'Status server listening on :27182');
  });
}

// ── Config ────────────────────────────────────────────────────────────────────

const configFile = path.join(app.getPath('userData'), 'config.json');

function loadConfig() {
  try {
    const raw = JSON.parse(fs.readFileSync(configFile, 'utf8'));
    if (!raw.workspace && raw.repoPath) {
      raw.workspace = [{ path: raw.repoPath }];
    }
    if (!raw.workspace) raw.workspace = [];
    if (!raw.aiCommand) raw.aiCommand = 'claude';
    return raw;
  } catch (e) {
    log('WARN', 'Config load failed (using defaults):', e.message);
    return { workspace: [], aiCommand: 'claude' };
  }
}

function saveConfig(cfg) {
  fs.mkdirSync(path.dirname(configFile), { recursive: true });
  fs.writeFileSync(configFile, JSON.stringify(cfg, null, 2));
  log('INFO', 'Config saved');
}

const stateFile = path.join(app.getPath('userData'), 'state.json');

function loadState() {
  try { return JSON.parse(fs.readFileSync(stateFile, 'utf8')); }
  catch { return null; }
}

function saveState(state) {
  fs.writeFileSync(stateFile, JSON.stringify(state, null, 2));
}

// ── WSL path helpers ──────────────────────────────────────────────────────────

// ── Cross-boundary status host detection ─────────────────────────────────────

// Case 1: Win Electron + WSL terminal — Windows host IP as seen from WSL
function getWslHostIp(distro) {
  if (process.platform !== 'win32') return null;

  // Primary: query Windows-side WSL virtual adapter (works regardless of WSL config)
  try {
    const ps = `(Get-NetIPAddress -AddressFamily IPv4 | Where-Object {$_.InterfaceAlias -like '*WSL*'} | Select-Object -First 1).IPAddress`;
    const out = execFileSync('powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', ps],
      { encoding: 'utf8', timeout: 5000 });
    const ip = out.trim();
    if (ip && /^\d+\.\d+\.\d+\.\d+$/.test(ip)) return ip;
  } catch {}

  // Fallback: ask WSL for its default gateway and parse "via X.X.X.X"
  try {
    const args = distro
      ? ['-d', distro, '--', 'bash', '-c', 'ip -4 route show default 2>/dev/null | head -1']
      : ['--', 'bash', '-c', 'ip -4 route show default 2>/dev/null | head -1'];
    const out = execFileSync('wsl.exe', args, { encoding: 'utf8', timeout: 5000 });
    const m = out.match(/via\s+(\d+\.\d+\.\d+\.\d+)/);
    if (m) return m[1];
  } catch {}

  return null;
}

// Case 4: Linux Electron + Windows shell — WSL's own IP as seen from Windows
function getOwnLinuxIp() {
  if (process.platform === 'win32') return null;
  for (const ifaces of Object.values(os.networkInterfaces())) {
    const ipv4 = ifaces.find(i => i.family === 'IPv4' && !i.internal);
    if (ipv4) return ipv4.address;
  }
  return null;
}

// Adds Windows Firewall inbound rule for port 27182 (silent if no elevation)
function ensureFirewallRule() {
  if (process.platform !== 'win32') return;
  try {
    execFileSync('netsh', ['advfirewall', 'firewall', 'show', 'rule', 'name=Mentat Status API'],
      { stdio: 'pipe' });
  } catch {
    try {
      execFileSync('netsh', ['advfirewall', 'firewall', 'add', 'rule',
        'name=Mentat Status API', 'dir=in', 'action=allow', 'protocol=TCP', 'localport=27182'],
        { stdio: 'pipe' });
    } catch { /* no elevation — Windows will show firewall dialog on first connection */ }
  }
}

// Writes PowerShell hook helper + hooks config to %USERPROFILE%\.claude on Windows
function setupWindowsHooks() {
  if (process.platform !== 'win32') return;
  const userProfile = process.env.USERPROFILE;
  if (!userProfile) return;

  const claudeDir = path.join(userProfile, '.claude');
  const scriptPath = path.join(claudeDir, 'mentat-hook.ps1');
  const settingsPath = path.join(claudeDir, 'settings.json');

  const psScript = [
    'param([string]$status)',
    'if (-not $env:MENTAT_TERM_ID) { exit 0 }',
    "$h = if ($env:MENTAT_STATUS_HOST) { $env:MENTAT_STATUS_HOST } else { '127.0.0.1' }",
    'if ($status -eq \'idle\') {',
    '    try {',
    '        $raw = [Console]::In.ReadToEnd()',
    '        $json = $raw | ConvertFrom-Json -ErrorAction SilentlyContinue',
    '        if ($json -and $json.session_id) {',
    '            $sesBody = \'{"termId":"\' + $env:MENTAT_TERM_ID + \'","sessionId":"\' + $json.session_id + \'"}\' ',
    '            try { curl.exe -s -X POST "http://$($h):27182/session" -H \'Content-Type: application/json\' -d $sesBody 2>$null } catch {}',
    '        }',
    '    } catch {}',
    '}',
    '$body = \'{"termId":"\' + $env:MENTAT_TERM_ID + \'","status":"\' + $status + \'"}\' ',
    'try { curl.exe -s -X POST "http://$($h):27182/status" -H \'Content-Type: application/json\' -d $body 2>$null } catch {}',
  ].join('\n');

  try {
    fs.mkdirSync(claudeDir, { recursive: true });
    fs.writeFileSync(scriptPath, psScript, 'utf8');
  } catch (e) {
    console.error('[mentat] setupWindowsHooks failed:', e.message);
  }
}

// Writes claude wrapper function + sources it from .bashrc/.zshrc (Linux/WSL)
const BASH_WRAP_CONTENT = [
  'claude() {',
  '  local _h="${MENTAT_STATUS_HOST:-127.0.0.1}"',
  '  if [ -n "$MENTAT_TERM_ID" ]; then',
  '    curl -s -o /dev/null -m 2 -X POST "http://$_h:27182/status" \\',
  '      -H \'Content-Type: application/json\' \\',
  '      -d "{\\"termId\\":\\"$MENTAT_TERM_ID\\",\\"status\\":\\"session_start\\"}" 2>/dev/null || true',
  '  fi',
  '  command claude "$@"',
  '  local _ec=$?',
  '  if [ -n "$MENTAT_TERM_ID" ]; then',
  '    curl -s -o /dev/null -m 2 -X POST "http://$_h:27182/status" \\',
  '      -H \'Content-Type: application/json\' \\',
  '      -d "{\\"termId\\":\\"$MENTAT_TERM_ID\\",\\"status\\":\\"session_stop\\"}" 2>/dev/null || true',
  '  fi',
  '  return $_ec',
  '}',
].join('\n');

// Linux / macOS: write wrapper directly to filesystem
function setupUnixClaudeWrapper() {
  if (process.platform === 'win32') return;
  const homeDir = process.env.HOME;
  if (!homeDir) return;

  const sourceMarker = '# mentat-claude-wrap';
  const sourceLine = `${sourceMarker}\n[ -f "$HOME/.claude/mentat-claude-wrap.sh" ] && . "$HOME/.claude/mentat-claude-wrap.sh"`;

  try {
    const claudeDir = path.join(homeDir, '.claude');
    fs.mkdirSync(claudeDir, { recursive: true });
    fs.writeFileSync(path.join(claudeDir, 'mentat-claude-wrap.sh'), BASH_WRAP_CONTENT, 'utf8');

    for (const rc of ['.bashrc', '.zshrc']) {
      const rcPath = path.join(homeDir, rc);
      let content = '';
      try { content = fs.readFileSync(rcPath, 'utf8'); } catch {}
      if (!content.includes(sourceMarker)) {
        fs.appendFileSync(rcPath, `\n${sourceLine}\n`);
      }
    }
  } catch (e) {
    console.error('[mentat] setupUnixClaudeWrapper failed:', e.message);
  }
}

// Windows + WSL: write wrapper into default WSL distro via wsl.exe
function setupWslClaudeWrapper() {
  if (process.platform !== 'win32') return;
  try {
    const raw = execFileSync('wsl.exe', ['-l', '-q'], { encoding: 'utf16le', timeout: 4000 });
    const distro = raw.split('\n').map(l => l.replace(/\0/g, '').trim()).find(l => l);
    if (!distro) return;

    const b64 = Buffer.from(BASH_WRAP_CONTENT, 'utf8').toString('base64');
    const bashCmd = [
      `mkdir -p ~/.claude`,
      `echo '${b64}' | base64 -d > ~/.claude/mentat-claude-wrap.sh`,
      `grep -q 'mentat-claude-wrap' ~/.bashrc 2>/dev/null || printf '\\n# mentat-claude-wrap\\n[ -f "$HOME/.claude/mentat-claude-wrap.sh" ] && . "$HOME/.claude/mentat-claude-wrap.sh"\\n' >> ~/.bashrc`,
      `grep -q 'mentat-claude-wrap' ~/.zshrc 2>/dev/null || printf '\\n# mentat-claude-wrap\\n[ -f "$HOME/.claude/mentat-claude-wrap.sh" ] && . "$HOME/.claude/mentat-claude-wrap.sh"\\n' >> ~/.zshrc`,
    ].join(' && ');

    execFileSync('wsl.exe', ['-d', distro, '--', 'bash', '-c', bashCmd], { timeout: 10000 });
  } catch (e) {
    console.error('[mentat] setupWslClaudeWrapper failed:', e.message);
  }
}

// Windows + PowerShell: add claude wrapper function to PS profile (PS5 + PS7)
function setupPowerShellWrapper() {
  if (process.platform !== 'win32') return;
  const userProfile = process.env.USERPROFILE;
  if (!userProfile) return;

  const claudeDir = path.join(userProfile, '.claude');
  const wrapScript = path.join(claudeDir, 'mentat-claude-wrap.ps1');

  const psContent = [
    '$_cmd = Get-Command claude.exe -ErrorAction SilentlyContinue',
    '$script:_mentatClaudeExe = if ($_cmd) { $_cmd.Source } else { "claude.exe" }',
    'function global:claude {',
    '  $h = if ($env:MENTAT_STATUS_HOST) { $env:MENTAT_STATUS_HOST } else { "127.0.0.1" }',
    '  if ($env:MENTAT_TERM_ID) {',
    '    $body = \'{"termId":"\' + $env:MENTAT_TERM_ID + \'","status":"session_start"}\'',
    '    try { curl.exe -s -o NUL -X POST "http://${h}:27182/status" -H "Content-Type: application/json" -d $body 2>$null } catch {}',
    '  }',
    '  & $script:_mentatClaudeExe @args',
    '  if ($env:MENTAT_TERM_ID) {',
    '    $body = \'{"termId":"\' + $env:MENTAT_TERM_ID + \'","status":"session_stop"}\'',
    '    try { curl.exe -s -o NUL -X POST "http://${h}:27182/status" -H "Content-Type: application/json" -d $body 2>$null } catch {}',
    '  }',
    '}',
  ].join('\n');

  const sourceMarker = '# mentat-claude-wrap';
  const sourceLine = [
    sourceMarker,
    `$_wrap = Join-Path $env:USERPROFILE '.claude\\mentat-claude-wrap.ps1'`,
    `if (Test-Path $_wrap) { . $_wrap }`,
  ].join('\n');

  try {
    fs.mkdirSync(claudeDir, { recursive: true });
    fs.writeFileSync(wrapScript, psContent, 'utf8');

    const psProfiles = [
      path.join(userProfile, 'Documents', 'WindowsPowerShell', 'Microsoft.PowerShell_profile.ps1'),
      path.join(userProfile, 'Documents', 'PowerShell', 'Microsoft.PowerShell_profile.ps1'),
    ];
    for (const profilePath of psProfiles) {
      fs.mkdirSync(path.dirname(profilePath), { recursive: true });
      let content = '';
      try { content = fs.readFileSync(profilePath, 'utf8'); } catch {}
      if (!content.includes(sourceMarker)) {
        fs.appendFileSync(profilePath, `\n${sourceLine}\n`);
      }
    }
  } catch (e) {
    console.error('[mentat] setupPowerShellWrapper failed:', e.message);
  }
}

<<<<<<< Updated upstream
// ── Codex wrappers & hooks ────────────────────────────────────────────────────

const BASH_CODEX_WRAP_CONTENT = [
  'codex() {',
  '  local _h="${MENTAT_STATUS_HOST:-127.0.0.1}"',
  '  if [ -n "$MENTAT_TERM_ID" ]; then',
  '    curl -s -o /dev/null -m 2 -X POST "http://$_h:27182/status" \\',
  '      -H \'Content-Type: application/json\' \\',
  '      -d "{\\"termId\\":\\"$MENTAT_TERM_ID\\",\\"status\\":\\"session_start\\"}" 2>/dev/null || true',
  '  fi',
  '  command codex "$@"',
  '  local _ec=$?',
  '  if [ -n "$MENTAT_TERM_ID" ]; then',
  '    curl -s -o /dev/null -m 2 -X POST "http://$_h:27182/status" \\',
  '      -H \'Content-Type: application/json\' \\',
  '      -d "{\\"termId\\":\\"$MENTAT_TERM_ID\\",\\"status\\":\\"session_stop\\"}" 2>/dev/null || true',
  '  fi',
  '  return $_ec',
  '}',
].join('\n');

function setupUnixCodexWrapper() {
  if (process.platform === 'win32') return;
  const homeDir = process.env.HOME;
  if (!homeDir) return;

  const sourceMarker = '# mentat-codex-wrap';
  const sourceLine = `${sourceMarker}\n[ -f "$HOME/.codex/mentat-codex-wrap.sh" ] && . "$HOME/.codex/mentat-codex-wrap.sh"`;

  try {
    const codexDir = path.join(homeDir, '.codex');
    fs.mkdirSync(codexDir, { recursive: true });
    fs.writeFileSync(path.join(codexDir, 'mentat-codex-wrap.sh'), BASH_CODEX_WRAP_CONTENT, 'utf8');

    for (const rc of ['.bashrc', '.zshrc']) {
      const rcPath = path.join(homeDir, rc);
      let content = '';
      try { content = fs.readFileSync(rcPath, 'utf8'); } catch {}
      if (!content.includes(sourceMarker)) {
        fs.appendFileSync(rcPath, `\n${sourceLine}\n`);
      }
    }
  } catch (e) {
    console.error('[mentat] setupUnixCodexWrapper failed:', e.message);
  }
}

function setupWslCodexWrapper() {
=======
// Shell script that Claude's Stop hook runs — reads session_id from stdin and POSTs to /session
const SESSION_HOOK_SCRIPT = [
  '#!/bin/bash',
  'data=$(cat)',
  'session_id=$(echo "$data" | python3 -c "import sys,json; print(json.load(sys.stdin).get(\'session_id\',\'\'))" 2>/dev/null)',
  'term_id="$MENTAT_TERM_ID"',
  '_h="${MENTAT_STATUS_HOST:-127.0.0.1}"',
  '[ -n "$session_id" ] && [ -n "$term_id" ] && \\',
  '  curl -s -o /dev/null -m 2 -X POST "http://$_h:27182/session" \\',
  '    -H \'Content-Type: application/json\' \\',
  '    -d "{\\"termId\\":\\"$term_id\\",\\"sessionId\\":\\"$session_id\\"}" 2>/dev/null || true',
].join('\n');
function setupUnixSessionHook() {
  if (process.platform === 'win32') return;
  const homeDir = process.env.HOME;
  if (!homeDir) return;
  const claudeDir = path.join(homeDir, '.claude');
  const scriptPath = path.join(claudeDir, 'mentat-session-hook.sh');
  try {
    fs.mkdirSync(claudeDir, { recursive: true });
    fs.writeFileSync(scriptPath, SESSION_HOOK_SCRIPT, { encoding: 'utf8', mode: 0o755 });
  } catch (e) {
    console.error('[mentat] setupUnixSessionHook failed:', e.message);
  }
}

function setupWslSessionHook() {
>>>>>>> Stashed changes
  if (process.platform !== 'win32') return;
  try {
    const raw = execFileSync('wsl.exe', ['-l', '-q'], { encoding: 'utf16le', timeout: 4000 });
    const distro = raw.split('\n').map(l => l.replace(/\0/g, '').trim()).find(l => l);
    if (!distro) return;

<<<<<<< Updated upstream
    const b64 = Buffer.from(BASH_CODEX_WRAP_CONTENT, 'utf8').toString('base64');
    const bashCmd = [
      `mkdir -p ~/.codex`,
      `echo '${b64}' | base64 -d > ~/.codex/mentat-codex-wrap.sh`,
      `grep -q 'mentat-codex-wrap' ~/.bashrc 2>/dev/null || printf '\\n# mentat-codex-wrap\\n[ -f "$HOME/.codex/mentat-codex-wrap.sh" ] && . "$HOME/.codex/mentat-codex-wrap.sh"\\n' >> ~/.bashrc`,
      `grep -q 'mentat-codex-wrap' ~/.zshrc 2>/dev/null || printf '\\n# mentat-codex-wrap\\n[ -f "$HOME/.codex/mentat-codex-wrap.sh" ] && . "$HOME/.codex/mentat-codex-wrap.sh"\\n' >> ~/.zshrc`,
    ].join(' && ');

    execFileSync('wsl.exe', ['-d', distro, '--', 'bash', '-c', bashCmd], { timeout: 10000 });
  } catch (e) {
    console.error('[mentat] setupWslCodexWrapper failed:', e.message);
  }
}

function setupPowerShellCodexWrapper() {
  if (process.platform !== 'win32') return;
  const userProfile = process.env.USERPROFILE;
  if (!userProfile) return;

  const codexDir = path.join(userProfile, '.codex');
  const wrapScript = path.join(codexDir, 'mentat-codex-wrap.ps1');

  const psContent = [
    '$_cmd = Get-Command codex.exe -ErrorAction SilentlyContinue',
    '$script:_mentatCodexExe = if ($_cmd) { $_cmd.Source } else { "codex.exe" }',
    'function global:codex {',
    '  $h = if ($env:MENTAT_STATUS_HOST) { $env:MENTAT_STATUS_HOST } else { "127.0.0.1" }',
    '  if ($env:MENTAT_TERM_ID) {',
    '    $body = \'{"termId":"\' + $env:MENTAT_TERM_ID + \'","status":"session_start"}\'',
    '    try { curl.exe -s -o NUL -X POST "http://${h}:27182/status" -H "Content-Type: application/json" -d $body 2>$null } catch {}',
    '  }',
    '  & $script:_mentatCodexExe @args',
    '  if ($env:MENTAT_TERM_ID) {',
    '    $body = \'{"termId":"\' + $env:MENTAT_TERM_ID + \'","status":"session_stop"}\'',
    '    try { curl.exe -s -o NUL -X POST "http://${h}:27182/status" -H "Content-Type: application/json" -d $body 2>$null } catch {}',
    '  }',
    '}',
  ].join('\n');

  const sourceMarker = '# mentat-codex-wrap';
  const sourceLine = [
    sourceMarker,
    `$_wrap = Join-Path $env:USERPROFILE '.codex\\mentat-codex-wrap.ps1'`,
    `if (Test-Path $_wrap) { . $_wrap }`,
  ].join('\n');

  try {
    fs.mkdirSync(codexDir, { recursive: true });
    fs.writeFileSync(wrapScript, psContent, 'utf8');

    const psProfiles = [
      path.join(userProfile, 'Documents', 'WindowsPowerShell', 'Microsoft.PowerShell_profile.ps1'),
      path.join(userProfile, 'Documents', 'PowerShell', 'Microsoft.PowerShell_profile.ps1'),
    ];
    for (const profilePath of psProfiles) {
      fs.mkdirSync(path.dirname(profilePath), { recursive: true });
      let content = '';
      try { content = fs.readFileSync(profilePath, 'utf8'); } catch {}
      if (!content.includes(sourceMarker)) {
        fs.appendFileSync(profilePath, `\n${sourceLine}\n`);
      }
    }
  } catch (e) {
    console.error('[mentat] setupPowerShellCodexWrapper failed:', e.message);
  }
}

const CODEX_HOOK_MARKER = '"_mentat": true';

function setupUnixCodexHooks() {
  if (process.platform === 'win32') return;
  const homeDir = process.env.HOME;
  if (!homeDir) return;

  try {
    const codexDir = path.join(homeDir, '.codex');
    fs.mkdirSync(codexDir, { recursive: true });

    const hookScript = path.join(codexDir, 'mentat-hook.sh');
    const hookContent = [
      '#!/bin/bash',
      'status="$1"',
      '[ -z "$MENTAT_TERM_ID" ] && exit 0',
      'h="${MENTAT_STATUS_HOST:-127.0.0.1}"',
      'curl -s -o /dev/null -m 2 -X POST "http://$h:27182/status" \\',
      '  -H \'Content-Type: application/json\' \\',
      '  -d "{\\"termId\\":\\"$MENTAT_TERM_ID\\",\\"status\\":\\"$status\\"}" 2>/dev/null || true',
    ].join('\n');
    fs.writeFileSync(hookScript, hookContent, { mode: 0o755 });

    const hooksPath = path.join(codexDir, 'hooks.json');
    let existing = {};
    try { existing = JSON.parse(fs.readFileSync(hooksPath, 'utf8')); } catch {}

    if (!existing._mentat) {
      const hooks = {
        _mentat: true,
        hooks: {
          PreToolUse: [{ hooks: [{ type: 'command', command: `bash ~/.codex/mentat-hook.sh working` }] }],
          Stop: [{ hooks: [{ type: 'command', command: `bash ~/.codex/mentat-hook.sh idle` }] }],
        },
      };
      fs.writeFileSync(hooksPath, JSON.stringify(hooks, null, 2), 'utf8');
    }
  } catch (e) {
    console.error('[mentat] setupUnixCodexHooks failed:', e.message);
  }
}

function setupWslCodexHooks() {
  if (process.platform !== 'win32') return;
  try {
    const raw = execFileSync('wsl.exe', ['-l', '-q'], { encoding: 'utf16le', timeout: 4000 });
    const distro = raw.split('\n').map(l => l.replace(/\0/g, '').trim()).find(l => l);
    if (!distro) return;

    const hookContent = [
      '#!/bin/bash',
      'status="$1"',
      '[ -z "$MENTAT_TERM_ID" ] && exit 0',
      'h="${MENTAT_STATUS_HOST:-127.0.0.1}"',
      'curl -s -o /dev/null -m 2 -X POST "http://$h:27182/status" \\',
      '  -H \'Content-Type: application/json\' \\',
      '  -d "{\\"termId\\":\\"$MENTAT_TERM_ID\\",\\"status\\":\\"$status\\"}" 2>/dev/null || true',
    ].join('\n');
    const b64Hook = Buffer.from(hookContent, 'utf8').toString('base64');

    const hooksJson = JSON.stringify({
      _mentat: true,
      hooks: {
        PreToolUse: [{ hooks: [{ type: 'command', command: 'bash ~/.codex/mentat-hook.sh working' }] }],
        Stop: [{ hooks: [{ type: 'command', command: 'bash ~/.codex/mentat-hook.sh idle' }] }],
      },
    }, null, 2);
    const b64Hooks = Buffer.from(hooksJson, 'utf8').toString('base64');

    const bashCmd = [
      `mkdir -p ~/.codex`,
      `echo '${b64Hook}' | base64 -d > ~/.codex/mentat-hook.sh`,
      `chmod +x ~/.codex/mentat-hook.sh`,
      `grep -q '_mentat' ~/.codex/hooks.json 2>/dev/null || echo '${b64Hooks}' | base64 -d > ~/.codex/hooks.json`,
    ].join(' && ');

    execFileSync('wsl.exe', ['-d', distro, '--', 'bash', '-c', bashCmd], { timeout: 10000 });
  } catch (e) {
    console.error('[mentat] setupWslCodexHooks failed:', e.message);
  }
}

function setupWindowsCodexHooks() {
  if (process.platform !== 'win32') return;
  const userProfile = process.env.USERPROFILE;
  if (!userProfile) return;

  const codexDir = path.join(userProfile, '.codex');
  const claudeDir = path.join(userProfile, '.claude');
  const scriptPath = path.join(claudeDir, 'mentat-hook.ps1');
  const hooksPath = path.join(codexDir, 'hooks.json');

  try {
    fs.mkdirSync(codexDir, { recursive: true });

    let existing = {};
    try { existing = JSON.parse(fs.readFileSync(hooksPath, 'utf8')); } catch {}

    if (!existing._mentat) {
      const mkHook = (status) => ({
        hooks: [{ type: 'command', command: `powershell.exe -NoProfile -NonInteractive -File "${scriptPath}" ${status}` }],
      });
      const hooks = {
        _mentat: true,
        hooks: {
          ...(existing.hooks || {}),
          PreToolUse: [mkHook('working')],
          Stop: [mkHook('idle')],
        },
      };
      fs.writeFileSync(hooksPath, JSON.stringify(hooks, null, 2), 'utf8');
    }
  } catch (e) {
    console.error('[mentat] setupWindowsCodexHooks failed:', e.message);
=======
    const b64Script = Buffer.from(SESSION_HOOK_SCRIPT, 'utf8').toString('base64');

    const bashCmd = [
      `mkdir -p ~/.claude`,
      `echo '${b64Script}' | base64 -d > ~/.claude/mentat-session-hook.sh`,
      `chmod +x ~/.claude/mentat-session-hook.sh`,
    ].join(' && ');
    execFileSync('wsl.exe', ['-d', distro, '--', 'bash', '-c', bashCmd], { timeout: 10000 });
  } catch (e) {
    console.error('[mentat] setupWslSessionHook failed:', e.message);
>>>>>>> Stashed changes
  }
}

// ── Git helpers ───────────────────────────────────────────────────────────────

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

app.whenReady().then(() => {
  const cfg = loadConfig();
  if (cfg.settings?.loggingEnabled) setLoggingEnabled(true);
  log('INFO', 'App ready');
  createWindow();
  startStatusServer();
  ensureFirewallRule();
  setupWindowsHooks();
  setupUnixClaudeWrapper();
  setupWslClaudeWrapper();
  setupPowerShellWrapper();
<<<<<<< Updated upstream
  setupUnixCodexWrapper();
  setupWslCodexWrapper();
  setupPowerShellCodexWrapper();
  setupUnixCodexHooks();
  setupWslCodexHooks();
  setupWindowsCodexHooks();
=======
  setupUnixSessionHook();
  setupWslSessionHook();
>>>>>>> Stashed changes
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  log('INFO', 'All windows closed');
  statusServer?.close();
  if (logStream) { logStream.end(); logStream = null; }
  if (process.platform !== 'darwin') app.quit();
});

// ── Window controls ───────────────────────────────────────────────────────────

ipcMain.on('window:minimize', () => mainWindow?.minimize());
ipcMain.on('window:toggle-maximize', () => {
  if (!mainWindow) return;
  mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize();
});
ipcMain.on('window:close', () => mainWindow?.close());

// ── Shell profiles ────────────────────────────────────────────────────────────

function getShellProfiles() {
  if (process.platform === 'win32') {
    const profiles = [
      { id: 'powershell', name: 'PowerShell', cmd: 'powershell.exe', args: ['-NoLogo'] },
      { id: 'cmd', name: 'Command Prompt', cmd: 'cmd.exe', args: [] },
    ];
    try {
      execFileSync('pwsh.exe', ['--version'], { encoding: 'utf8' });
      profiles.unshift({ id: 'pwsh', name: 'PowerShell 7', cmd: 'pwsh.exe', args: ['-NoLogo'] });
    } catch {}
    try {
      const out = execFileSync('wsl.exe', ['--list', '--quiet'], { encoding: 'utf16le' });
      out.split('\n').map(s => s.replace(/\0/g, '').trim()).filter(Boolean).forEach(distro => {
        profiles.push({ id: `wsl:${distro}`, name: `WSL (${distro})`, wsl: true, distro });
      });
    } catch {}
    return profiles;
  }

  // Linux shells
  const seen = new Set();
  const profiles = [];
  for (const s of [process.env.SHELL, '/bin/bash', '/bin/zsh', '/usr/bin/zsh', '/bin/fish', '/bin/sh'].filter(Boolean)) {
    if (!seen.has(s) && fs.existsSync(s)) {
      seen.add(s);
      const name = path.basename(s);
      profiles.push({ id: name, name: name.charAt(0).toUpperCase() + name.slice(1), cmd: s, args: [] });
    }
  }

  // If running inside WSL — also add Windows shells via /mnt/c
  if (isRunningInWSL()) {
    const winShells = [
      { id: 'powershell', name: 'PowerShell', cmd: '/mnt/c/WINDOWS/System32/WindowsPowerShell/v1.0/powershell.exe', args: ['-NoLogo'] },
      { id: 'cmd', name: 'Command Prompt', cmd: '/mnt/c/WINDOWS/System32/cmd.exe', args: [] },
    ];
    // PowerShell 7
    const pwshPaths = [
      '/mnt/c/Program Files/PowerShell/7/pwsh.exe',
      '/mnt/c/Program Files/PowerShell/7-preview/pwsh.exe',
    ];
    for (const p of pwshPaths) {
      if (fs.existsSync(p)) {
        winShells.unshift({ id: 'pwsh', name: 'PowerShell 7', cmd: p, args: ['-NoLogo'] });
        break;
      }
    }
    for (const s of winShells) {
      if (fs.existsSync(s.cmd)) profiles.push(s);
    }
  }

  return profiles;
}

// ── Logging IPC ───────────────────────────────────────────────────────────────

ipcMain.handle('logging:set-enabled', (_e, enabled) => setLoggingEnabled(enabled));
ipcMain.handle('logging:get-path', () => getLogPath());
ipcMain.on('log:renderer-error', (_e, msg) => log('ERROR', '[renderer]', msg));

// ── Config IPC ────────────────────────────────────────────────────────────────

ipcMain.handle('config:get', () => loadConfig());
ipcMain.handle('config:save', (_e, cfg) => saveConfig(cfg));
ipcMain.handle('state:get', () => loadState());
ipcMain.handle('state:save', (_e, state) => saveState(state));
ipcMain.handle('shell:get-profiles', () => getShellProfiles());

// ── Dialog ────────────────────────────────────────────────────────────────────

ipcMain.handle('dialog:open-folder', async () => {
  if (process.platform === 'win32') {
    // Shell.Application.BrowseForFolder shows the full shell namespace
    // including Linux/WSL — unlike Electron's native dialog.
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
  // Linux / macOS
  const { dialog } = require('electron');
  const result = await dialog.showOpenDialog({ properties: ['openDirectory'] });
  return result.canceled ? null : result.filePaths[0];
});

// ── Git IPC ───────────────────────────────────────────────────────────────────

ipcMain.handle('git:detect-repo', (_e, dirPath) => {
  try {
    const wsl = parseWslPath(dirPath);
    const linuxRoot = gitRun(dirPath, ['rev-parse', '--show-toplevel']);
    return wsl ? winToLinux(wsl.distro, linuxRoot) : linuxRoot;
  } catch { return null; }
});

ipcMain.handle('git:get-branches', (_e, repoPath) => {
  try {
    return gitRun(repoPath, ['branch', '--format=%(refname:short)']).split('\n').filter(Boolean);
  } catch { return []; }
});

ipcMain.handle('git:get-worktrees', (_e, repoPath) => {
  try {
    const wsl = parseWslPath(repoPath);
    const wts = parseWorktrees(gitRun(repoPath, ['worktree', 'list', '--porcelain']));
    // Convert Linux paths → Windows UNC paths for WSL repos
    return wsl ? wts.map(wt => ({ ...wt, path: winToLinux(wsl.distro, wt.path) })) : wts;
  } catch { return []; }
});

ipcMain.handle('git:create-worktree', (_e, { repoPath, branch, baseBranch }) => {
  try {
    log('INFO', 'git:create-worktree', branch, 'from', baseBranch);
    const dirName = branch.replace(/\//g, '-').replace(/[^a-zA-Z0-9._-]/g, '_');
    const wsl = parseWslPath(repoPath);

    if (wsl) {
      const parentDir = wsl.linuxPath.replace(/\/[^/]+$/, '');
      const newLinuxPath = `${parentDir}/${dirName}`;
      gitRun(repoPath, ['worktree', 'add', '-b', branch, newLinuxPath, baseBranch]);
      try {
        execFileSync('wsl.exe', ['-d', wsl.distro, '--', 'bash', '-c',
          `mkdir -p "${newLinuxPath}/internalFolder" && ` +
          `GITDIR=$(git -C "${newLinuxPath}" rev-parse --git-dir) && ` +
          `mkdir -p "$GITDIR/info" && ` +
          `echo "internalFolder/" >> "$GITDIR/info/exclude"`
        ], { encoding: 'utf8', timeout: 5000 });
      } catch (e) {
        log('WARN', 'internalFolder setup failed:', e.message);
        console.error('[mentat] internalFolder setup failed:', e.message);
      }
      return { success: true };
    }

    const worktreePath = path.join(path.dirname(repoPath), dirName);
    gitRun(repoPath, ['worktree', 'add', '-b', branch, worktreePath, baseBranch]);
    try {
      fs.mkdirSync(path.join(worktreePath, 'internalFolder'), { recursive: true });
      const gitDir = gitRun(worktreePath, ['rev-parse', '--git-dir']);
      const absoluteGitDir = path.isAbsolute(gitDir) ? gitDir : path.resolve(worktreePath, gitDir);
      const infoDir = path.join(absoluteGitDir, 'info');
      fs.mkdirSync(infoDir, { recursive: true });
      fs.appendFileSync(path.join(infoDir, 'exclude'), '\ninternalFolder/\n');
    } catch (e) {
      log('WARN', 'internalFolder setup failed:', e.message);
      console.error('[mentat] internalFolder setup failed:', e.message);
    }
    return { success: true };
  } catch (e) {
    log('ERROR', 'git:create-worktree failed:', e.message);
    return { success: false, error: e.message };
  }
});

ipcMain.handle('git:remove-worktree', (_e, { repoPath, worktreePath }) => {
  try {
    log('INFO', 'git:remove-worktree', worktreePath);
    const wsl = parseWslPath(worktreePath);
    const target = wsl ? wsl.linuxPath : worktreePath;
    try { gitRun(repoPath, ['worktree', 'remove', '--force', target]); } catch {}
    // Гарантированно удаляем директорию если git её не убрал
    if (fs.existsSync(worktreePath)) fs.rmSync(worktreePath, { recursive: true, force: true });
    return { success: true };
  } catch (e) {
    log('ERROR', 'git:remove-worktree failed:', e.message);
    return { success: false, error: e.message };
  }
});

ipcMain.handle('git:get-prunable-worktrees', (_e, repoPath) => {
  try {
    const wsl = parseWslPath(repoPath);
    try { gitRun(repoPath, ['fetch', '--prune']); } catch {}
    const goneBranches = new Set(
      gitRun(repoPath, ['branch', '-vv'])
        .split('\n')
        .filter(l => l.includes(': gone]'))
        .map(l => l.trim().replace(/^[*+]\s+/, '').split(/\s+/)[0])
    );
    const wts = parseWorktrees(gitRun(repoPath, ['worktree', 'list', '--porcelain']));
    const prunable = wts.slice(1).filter(wt => wt.branch && goneBranches.has(wt.branch));
    const result = wsl ? prunable.map(wt => ({ ...wt, path: winToLinux(wsl.distro, wt.path) })) : prunable;
    return { success: true, worktrees: result };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('git:delete-branch', (_e, { repoPath, branch }) => {
  try {
    gitRun(repoPath, ['branch', '-D', branch]);
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('git:current-branch', (_e, dirPath) => {
  try { return gitRun(dirPath, ['rev-parse', '--abbrev-ref', 'HEAD']); }
  catch { return null; }
});

ipcMain.handle('git:status', (_e, dirPath) => {
  try { return { success: true, output: gitRun(dirPath, ['status', '--porcelain']) }; }
  catch (e) { return { success: false, error: e.stderr || e.message }; }
});

ipcMain.handle('git:pull', (_e, dirPath, branch) => {
  try { return { success: true, output: gitRun(dirPath, ['pull', 'origin', branch]) }; }
  catch (e) { return { success: false, error: e.stderr || e.message }; }
});

ipcMain.handle('git:add', (_e, dirPath, files) => {
  try { return { success: true, output: gitRun(dirPath, ['add', '--', ...files]) }; }
  catch (e) { return { success: false, error: e.stderr || e.message }; }
});

ipcMain.handle('git:commit', (_e, dirPath, message) => {
  try { return { success: true, output: gitRun(dirPath, ['commit', '-m', message]) }; }
  catch (e) { return { success: false, error: e.stderr || e.message }; }
});

ipcMain.handle('git:push', (_e, dirPath, branch) => {
  try { return { success: true, output: gitRun(dirPath, ['push', '-u', 'origin', branch]) }; }
  catch (e) { return { success: false, error: e.stderr || e.message }; }
});

// ── PTY IPC ───────────────────────────────────────────────────────────────────

ipcMain.on('pty:create', (_e, { termId, worktreePath, shellId, type, aiCommand, sessionId }) => {
  if (!pty) return;
  log('INFO', 'PTY create:', termId, 'path:', worktreePath, 'type:', type || 'shell', 'shell:', shellId || 'default');

  const wsl = parseWslPath(worktreePath);
  const profile = shellId ? getShellProfiles().find(p => p.id === shellId) : null;

  // Determine MENTAT_STATUS_HOST for cross-boundary spawns
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
    // Layer 1: WSLENV — tells WSL2 which Windows vars to forward to the Linux shell
    const wslVars = statusHost ? 'MENTAT_TERM_ID:MENTAT_STATUS_HOST' : 'MENTAT_TERM_ID';
    const existing = process.env.WSLENV;
    statusEnv.WSLENV = existing ? `${existing}:${wslVars}` : wslVars;

    // Layer 2: env file — fallback for distros/configs where WSLENV is not honoured
    const distro = profile?.distro || wsl?.distro;
    const host = statusHost || '127.0.0.1';
    try {
      execFileSync('wsl.exe',
        ['-d', distro, '--', 'bash', '-c',
         `printf 'export MENTAT_TERM_ID=%s\\nexport MENTAT_STATUS_HOST=%s\\n' '${termId}' '${host}' > /tmp/mentat_env.sh`],
        { timeout: 3000 });
    } catch {}
  }

  const spawnOpts = (cwd, extraEnv = {}) => ({
    name: 'xterm-256color', cols: 80, rows: 24,
    cwd, env: { ...process.env, MENTAT_TERM_ID: termId, ...extraEnv },
  });

  let proc;

  if (type === 'ai') {
    const parts = (aiCommand || 'claude').trim().split(/\s+/);
    const [claudeExe, ...claudeArgs] = parts;
    const resumeArgs = sessionId ? ['--resume', sessionId] : [];

    terminalSessionActive.set(termId, true);
    if (mainWindow && !mainWindow.isDestroyed())
      mainWindow.webContents.send('worktree:status-changed', { termId, status: null, sessionActive: true });

    if (wsl && process.platform === 'win32') {
      // Use bash --login to source ~/.bashrc / ~/.bash_profile so user's PATH
      // (e.g. ~/.local/bin, ~/.npm/bin) is available and claude can be found.
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
    if (ptyBuffer && !mainWindow?.isDestroyed()) {
      mainWindow.webContents.send('pty:data', { termId, data: ptyBuffer });
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
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('worktree:status-changed', { termId, status: null, sessionActive: false });
        mainWindow.webContents.send('pty:exited', { termId });
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
