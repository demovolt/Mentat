'use strict';

const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');

// ── Windows hooks ─────────────────────────────────────────────────────────────

function setupWindowsHooks() {
  if (process.platform !== 'win32') return;
  const userProfile = process.env.USERPROFILE;
  if (!userProfile) return;

  const claudeDir = path.join(userProfile, '.claude');
  const scriptPath = path.join(claudeDir, 'mentat-hook.ps1');

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

// ── Claude wrappers ───────────────────────────────────────────────────────────

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

const SAFE_DISTRO_RE = /^[a-zA-Z0-9][-a-zA-Z0-9_ .]*$/;

function setupWslClaudeWrapper() {
  if (process.platform !== 'win32') return;
  try {
    const raw = execFileSync('wsl.exe', ['-l', '-q'], { encoding: 'utf16le', timeout: 4000 });
    const distro = raw.split('\n').map(l => l.replace(/\0/g, '').trim()).find(l => l);
    if (!distro || !SAFE_DISTRO_RE.test(distro)) return;

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

// ── Codex wrappers ────────────────────────────────────────────────────────────

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
  if (process.platform !== 'win32') return;
  try {
    const raw = execFileSync('wsl.exe', ['-l', '-q'], { encoding: 'utf16le', timeout: 4000 });
    const distro = raw.split('\n').map(l => l.replace(/\0/g, '').trim()).find(l => l);
    if (!distro || !SAFE_DISTRO_RE.test(distro)) return;

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

module.exports = {
  setupWindowsHooks,
  setupUnixClaudeWrapper,
  setupWslClaudeWrapper,
  setupPowerShellWrapper,
  setupUnixCodexWrapper,
  setupWslCodexWrapper,
  setupPowerShellCodexWrapper,
};
