'use strict';

const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');

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

    if (existing.description !== 'mentat') {
      const hooks = {
        description: 'mentat',
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
      description: 'mentat',
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
      `grep -q '"description": "mentat"' ~/.codex/hooks.json 2>/dev/null || echo '${b64Hooks}' | base64 -d > ~/.codex/hooks.json`,
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

    if (existing.description !== 'mentat') {
      const mkHook = (status) => ({
        hooks: [{ type: 'command', command: `powershell.exe -NoProfile -NonInteractive -File "${scriptPath}" ${status}` }],
      });
      const hooks = {
        description: 'mentat',
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
  }
}

module.exports = { setupUnixCodexHooks, setupWslCodexHooks, setupWindowsCodexHooks };
