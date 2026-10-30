'use strict';

const { app } = require('electron');
const { execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const REQUIRED_HOOKS = {
  SessionStart: [
    { hooks: [{ type: 'command', command: 'bash ~/.claude/mentat-hook.sh session_start' }] },
  ],
  SessionEnd: [
    { hooks: [{ type: 'command', command: 'bash ~/.claude/mentat-hook.sh session_stop' }] },
  ],
  UserPromptSubmit: [
    { hooks: [{ type: 'command', command: 'bash ~/.claude/mentat-hook.sh thinking' }] },
  ],
  PreToolUse: [
    { hooks: [{ type: 'command', command: 'bash ~/.claude/mentat-hook.sh working' }] },
    { matcher: 'AskUserQuestion', hooks: [{ type: 'command', command: 'bash ~/.claude/mentat-hook.sh waiting' }] },
    { matcher: 'Agent', hooks: [{ type: 'command', command: 'bash ~/.claude/mentat-hook.sh agent_start' }] },
    { matcher: 'Bash',  hooks: [{ type: 'command', command: 'bash ~/.claude/mentat-hook.sh process_start' }] },
  ],
  PostToolUse: [
    { matcher: 'Agent', hooks: [{ type: 'command', command: 'bash ~/.claude/mentat-hook.sh agent_stop' }] },
    { matcher: 'Bash',  hooks: [{ type: 'command', command: 'bash ~/.claude/mentat-hook.sh process_pid' }] },
  ],
  Notification: [
    { hooks: [{ type: 'command', command: 'bash ~/.claude/mentat-hook.sh waiting' }] },
  ],
  Stop: [
    { hooks: [{ type: 'command', command: 'bash ~/.claude/mentat-hook.sh idle' }] },
  ],
};

function getScriptDir() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'app.asar.unpacked', 'script');
  }
  return path.join(app.getAppPath(), 'script');
}

function mergeSettings(existing, required) {
  const result = { ...existing };
  if (!result.hooks) result.hooks = {};
  for (const [event, entries] of Object.entries(required)) {
    const prev = result.hooks[event] || [];
    const kept = prev.filter(entry =>
      !(entry.hooks || []).some(h => (h.command || '').includes('mentat-hook'))
    );
    result.hooks[event] = [...kept, ...entries];
  }
  return result;
}

function readJsonSafe(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return {}; }
}

function writeJson(file, obj) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(obj, null, 2));
}

function wslExec(cmd, opts = {}) {
  return execFileSync('wsl.exe', ['--', 'bash', '-c', cmd], { encoding: 'utf8', timeout: 10000, ...opts });
}

async function installHooks() {
  const scriptDir = getScriptDir();
  const results = [];

  const push = (label, ok, error) => results.push({ label, ok, error: error || null });

  if (process.platform === 'win32') {
    const winHome = process.env.USERPROFILE || '';
    const shContent  = fs.readFileSync(path.join(scriptDir, 'mentat-hook.sh'),  'utf8');
    const ps1Content = fs.readFileSync(path.join(scriptDir, 'mentat-hook.ps1'), 'utf8');

    // Windows: copy .ps1 to %USERPROFILE%\.claude\
    try {
      const dest = path.join(winHome, '.claude', 'mentat-hook.ps1');
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, ps1Content);
      push('Windows .claude\\mentat-hook.ps1', true);
    } catch (e) { push('Windows .claude\\mentat-hook.ps1', false, e.message); }

    // Windows: copy .sh to %USERPROFILE%\.claude\ (for bash in PATH)
    try {
      const dest = path.join(winHome, '.claude', 'mentat-hook.sh');
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, shContent);
      push('Windows .claude\\mentat-hook.sh', true);
    } catch (e) { push('Windows .claude\\mentat-hook.sh', false, e.message); }

    // WSL: copy .sh via stdin pipe
    try {
      wslExec('mkdir -p ~/.claude && cat > ~/.claude/mentat-hook.sh && chmod +x ~/.claude/mentat-hook.sh', { input: shContent });
      push('WSL ~/.claude/mentat-hook.sh', true);
    } catch (e) { push('WSL ~/.claude/mentat-hook.sh', false, e.message); }

    // Windows: update settings.json
    try {
      const file = path.join(winHome, '.claude', 'settings.json');
      writeJson(file, mergeSettings(readJsonSafe(file), REQUIRED_HOOKS));
      push('Windows .claude\\settings.json', true);
    } catch (e) { push('Windows .claude\\settings.json', false, e.message); }

    // WSL: update settings.json
    try {
      const existing = JSON.parse(wslExec('cat ~/.claude/settings.json 2>/dev/null || echo "{}"').trim());
      const updated = JSON.stringify(mergeSettings(existing, REQUIRED_HOOKS), null, 2);
      wslExec('mkdir -p ~/.claude && cat > ~/.claude/settings.json', { input: updated });
      push('WSL ~/.claude/settings.json', true);
    } catch (e) { push('WSL ~/.claude/settings.json', false, e.message); }

  } else {
    const home = process.env.HOME || '';
    const shContent = fs.readFileSync(path.join(scriptDir, 'mentat-hook.sh'), 'utf8');

    // Linux: copy .sh
    try {
      const dest = path.join(home, '.claude', 'mentat-hook.sh');
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, shContent);
      fs.chmodSync(dest, 0o755);
      push('~/.claude/mentat-hook.sh', true);
    } catch (e) { push('~/.claude/mentat-hook.sh', false, e.message); }

    // Linux: update settings.json
    try {
      const file = path.join(home, '.claude', 'settings.json');
      writeJson(file, mergeSettings(readJsonSafe(file), REQUIRED_HOOKS));
      push('~/.claude/settings.json', true);
    } catch (e) { push('~/.claude/settings.json', false, e.message); }
  }

  return results;
}

module.exports = { installHooks };
