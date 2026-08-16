'use strict';

const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');

const STATUS_PORT = 27182;

// ── Hook command builders ─────────────────────────────────────────────────────

function statusCmd(status) {
  const guard = `[ -n "$MENTAT_TERM_ID" ]`;
  const base = `http://\${MENTAT_STATUS_HOST:-127.0.0.1}:${STATUS_PORT}`;
  const body = `"{\\"termId\\":\\"$MENTAT_TERM_ID\\",\\"status\\":\\"${status}\\"}"`;
  return `${guard} && curl -sf -m 2 -X POST "${base}/status" -H 'Content-Type: application/json' -d ${body} 2>/dev/null || true`;
}

function agentCmd(event) {
  const guard = `[ -n "$MENTAT_TERM_ID" ]`;
  const base = `http://\${MENTAT_STATUS_HOST:-127.0.0.1}:${STATUS_PORT}`;
  const fields = event === 'start'
    ? `'termId':os.environ['MENTAT_TERM_ID'],'agentId':d.get('tool_use_id',''),'event':'start','description':d.get('tool_input',{}).get('description','')[:60]`
    : `'termId':os.environ['MENTAT_TERM_ID'],'agentId':d.get('tool_use_id',''),'event':'stop'`;
  const py = `python3 -c "import sys,json,os;d=json.load(sys.stdin);print(json.dumps({${fields}}))"`;
  return `${guard} && ${py} | curl -sf -m 2 -X POST "${base}/agent" -H 'Content-Type: application/json' --data-binary @- 2>/dev/null || true`;
}

// Stop hook: reads stdin for session_id, posts to /session then idle to /status
function stopCmd() {
  const guard = `[ -n "$MENTAT_TERM_ID" ]`;
  const base = `http://\${MENTAT_STATUS_HOST:-127.0.0.1}:${STATUS_PORT}`;
  const extract = `python3 -c "import sys,json;print(json.load(sys.stdin).get('session_id',''))" 2>/dev/null`;
  const sessionPost = `curl -sf -m 2 -X POST "${base}/session" -H 'Content-Type: application/json' -d "{\\"termId\\":\\"$MENTAT_TERM_ID\\",\\"sessionId\\":\\"$_sid\\"}" 2>/dev/null`;
  const idlePost = `curl -sf -m 2 -X POST "${base}/status" -H 'Content-Type: application/json' -d "{\\"termId\\":\\"$MENTAT_TERM_ID\\",\\"status\\":\\"idle\\"}" 2>/dev/null`;
  return `${guard} && { _d=$(cat); _sid=$(echo "$_d" | ${extract}); [ -n "$_sid" ] && ${sessionPost}; ${idlePost}; } || true`;
}

// ── Mentat hook detection ─────────────────────────────────────────────────────

function isMentatHookEntry(entry) {
  const cmds = (entry.hooks || []).map(h => h.command || '');
  return cmds.some(c => c.includes(`:${STATUS_PORT}/status`) || c.includes(`:${STATUS_PORT}/session`) || c.includes(`:${STATUS_PORT}/agent`));
}

function stripMentatHooks(list) {
  return (list || []).filter(entry => !isMentatHookEntry(entry));
}

// ── Settings builder ──────────────────────────────────────────────────────────

function buildClaudeSettings(existing, hostOverride) {
  void hostOverride; // reserved for future WSL host-IP injection into hook commands
  const settings = { ...existing };
  const hooks = {};

  for (const [event, entries] of Object.entries(settings.hooks || {})) {
    const kept = stripMentatHooks(entries);
    if (kept.length) hooks[event] = kept;
  }

  const mentatHooks = {
    UserPromptSubmit: [
      { hooks: [{ type: 'command', command: statusCmd('thinking') }] },
    ],
    PreToolUse: [
      { hooks: [{ type: 'command', command: statusCmd('working') }] },
      { matcher: 'AskUserQuestion', hooks: [{ type: 'command', command: statusCmd('waiting') }] },
      { matcher: 'Agent', hooks: [{ type: 'command', command: agentCmd('start') }] },
    ],
    PostToolUse: [
      { matcher: 'Agent', hooks: [{ type: 'command', command: agentCmd('stop') }] },
    ],
    Notification: [
      { hooks: [{ type: 'command', command: statusCmd('waiting') }] },
    ],
    Stop: [
      { hooks: [{ type: 'command', command: stopCmd() }] },
    ],
  };

  for (const [event, entries] of Object.entries(mentatHooks)) {
    hooks[event] = [...(hooks[event] || []), ...entries];
  }

  settings.hooks = hooks;

  // Remove legacy MCP registration if present from previous versions
  if (settings.mcpServers?.mentat) {
    delete settings.mcpServers.mentat;
    if (Object.keys(settings.mcpServers).length === 0) delete settings.mcpServers;
  }

  return settings;
}

// Check if mentat hooks are present in claude settings
function hasMentatHooks(settings) {
  for (const entries of Object.values(settings.hooks || {})) {
    if (entries.some(e => isMentatHookEntry(e))) return true;
  }
  return false;
}

// ── Unix setup ────────────────────────────────────────────────────────────────

function setupUnixClaudeHooks() {
  if (process.platform === 'win32') return;
  const homeDir = process.env.HOME;
  if (!homeDir) return;

  try {
    const claudeDir = path.join(homeDir, '.claude');
    fs.mkdirSync(claudeDir, { recursive: true });

    const settingsPath = path.join(claudeDir, 'settings.json');
    let existing = {};
    try { existing = JSON.parse(fs.readFileSync(settingsPath, 'utf8')); } catch {}
    const updated = buildClaudeSettings(existing);
    fs.writeFileSync(settingsPath, JSON.stringify(updated, null, 2), 'utf8');
  } catch (e) {
    console.error('[mentat] setupUnixClaudeHooks failed:', e.message);
  }
}

// ── WSL setup ─────────────────────────────────────────────────────────────────

function setupWslClaudeHooks() {
  if (process.platform !== 'win32') return;
  try {
    const raw = execFileSync('wsl.exe', ['-l', '-q'], { encoding: 'utf16le', timeout: 4000 });
    const distro = raw.split('\n').map(l => l.replace(/\0/g, '').trim()).find(l => l);
    if (!distro) return;

    const readSettingsCmd = `cat ~/.claude/settings.json 2>/dev/null || echo '{}'`;
    let existingRaw = '{}';
    try {
      existingRaw = execFileSync('wsl.exe', ['-d', distro, '--', 'bash', '-c', readSettingsCmd], { encoding: 'utf8', timeout: 5000 });
    } catch {}
    let existing = {};
    try { existing = JSON.parse(existingRaw); } catch {}

    // Pass Windows host IP so hooks can reach the status server from WSL
    let hostIp = '127.0.0.1';
    try {
      const ip = execFileSync(
        'wsl.exe',
        ['-d', distro, '--', 'bash', '-c', "grep -m1 nameserver /etc/resolv.conf | awk '{print $2}'"],
        { encoding: 'utf8', timeout: 4000 }
      ).trim();
      if (ip) hostIp = ip;
    } catch {}

    const updated = buildClaudeSettings(existing, hostIp);
    const b64Settings = Buffer.from(JSON.stringify(updated, null, 2), 'utf8').toString('base64');

    const bashCmd = [
      `mkdir -p ~/.claude`,
      `echo '${b64Settings}' | base64 -d > ~/.claude/settings.json`,
    ].join(' && ');

    execFileSync('wsl.exe', ['-d', distro, '--', 'bash', '-c', bashCmd], { timeout: 10000 });
  } catch (e) {
    console.error('[mentat] setupWslClaudeHooks failed:', e.message);
  }
}

module.exports = { setupUnixClaudeHooks, setupWslClaudeHooks, buildClaudeSettings, hasMentatHooks };
