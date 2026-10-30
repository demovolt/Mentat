'use strict';

const http = require('http');
const { execFile } = require('child_process');
const { terminalStatuses, terminalSessionActive, terminalSessionIds, terminalAgents, terminalProcesses } = require('./terminal-state');
const { log } = require('./logger');

const MAX_BODY_SIZE = 8192;
const BASE_PORT = 27182;
const SAFE_ID_RE = /^[a-zA-Z0-9_-]+$/;

// PID monitors: processId -> { timer, termId }
const pidMonitors = new Map();

function checkPidAlive(pid) {
  // Native check — works for Windows PIDs (PS1 hook path) and Linux PIDs
  try { process.kill(pid, 0); return Promise.resolve(true); }
  catch { return Promise.resolve(false); }
}

function startPidMonitor(termId, processId, pid, getWindow) {
  if (pidMonitors.has(processId)) return;
  log('INFO', 'Start PID monitor:', termId, processId, 'pid:', pid);
  const timer = setInterval(async () => {
    const alive = await checkPidAlive(pid);
    if (!alive) {
      clearInterval(timer);
      pidMonitors.delete(processId);
      if (terminalProcesses.has(termId)) {
        terminalProcesses.get(termId).delete(processId);
        const processes = [...terminalProcesses.get(termId).entries()].map(([id, d]) => ({ processId: id, command: d.command }));
        const win = getWindow();
        if (win && !win.isDestroyed()) win.webContents.send('worktree:process-changed', { termId, processes });
        log('INFO', 'Process ended (PID dead):', termId, processId);
      }
    }
  }, 2000);
  pidMonitors.set(processId, { timer, termId });
}

function clearPidMonitorsForTerm(termId) {
  for (const [processId, info] of pidMonitors.entries()) {
    if (info.termId === termId) {
      clearInterval(info.timer);
      pidMonitors.delete(processId);
    }
  }
}

function clearAllPidMonitors() {
  for (const { timer } of pidMonitors.values()) clearInterval(timer);
  pidMonitors.clear();
}

function readBody(req, res, cb) {
  let body = '';
  let oversized = false;
  req.on('data', chunk => {
    if (oversized) return;
    body += chunk;
    if (body.length > MAX_BODY_SIZE) {
      oversized = true;
      res.writeHead(413).end();
      req.destroy();
    }
  });
  req.on('end', () => { if (!oversized) cb(body); });
}

function tryListen(server, port) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '0.0.0.0', () => {
      server.removeAllListeners('error');
      resolve(port);
    });
  });
}

async function findPort(server) {
  for (let port = BASE_PORT; port < BASE_PORT + 10; port++) {
    try {
      return await tryListen(server, port);
    } catch (err) {
      if (err.code !== 'EADDRINUSE') throw err;
      log('WARN', `Port ${port} in use, trying ${port + 1}`);
    }
  }
  throw new Error('No free port found in range 27182-27191');
}

function startStatusServer(getWindow, onPort) {
  const server = http.createServer((req, res) => {
    if (req.method !== 'POST') { res.writeHead(404).end(); return; }

    if (req.url === '/process') {
      readBody(req, res, (body) => {
        try {
          const { termId, processId, event, command, pid } = JSON.parse(body);
          if (!termId || !SAFE_ID_RE.test(termId) || !processId) { res.writeHead(400).end(); return; }

          if (event === 'stop') {
            // shell watchdog detected process death
            if (terminalProcesses.has(termId)) {
              terminalProcesses.get(termId).delete(processId);
              const processes = [...terminalProcesses.get(termId).entries()].map(([id, d]) => ({ processId: id, command: d.command }));
              const win = getWindow();
              if (win && !win.isDestroyed()) win.webContents.send('worktree:process-changed', { termId, processes });
              log('INFO', 'Process stop (watchdog):', termId, processId);
            }
            clearInterval(pidMonitors.get(processId)?.timer);
            pidMonitors.delete(processId);
          } else if (pid) {
            // PS1/Windows path: got PID, start Node.js monitoring
            if (!terminalProcesses.has(termId)) terminalProcesses.set(termId, new Map());
            const pm = terminalProcesses.get(termId);
            if (!pm.has(processId)) pm.set(processId, { command: '' });
            pm.get(processId).pid = parseInt(pid, 10);
            startPidMonitor(termId, processId, parseInt(pid, 10), getWindow);
          } else if (event === 'start') {
            if (!terminalProcesses.has(termId)) terminalProcesses.set(termId, new Map());
            terminalProcesses.get(termId).set(processId, { command: (command || '').slice(0, 60) });
            const processes = [...terminalProcesses.get(termId).entries()].map(([id, d]) => ({ processId: id, command: d.command }));
            log('INFO', 'Process start:', termId, processId);
            const win = getWindow();
            if (win && !win.isDestroyed()) win.webContents.send('worktree:process-changed', { termId, processes });
          } else { res.writeHead(400).end(); return; }

          res.writeHead(200).end('ok');
        } catch { res.writeHead(400).end(); }
      });
      return;
    }

    if (req.url === '/agent') {
      readBody(req, res, (body) => {
        try {
          const { termId, agentId, event, description } = JSON.parse(body);
          if (!termId || !SAFE_ID_RE.test(termId) || !agentId || !['start', 'stop'].includes(event)) { res.writeHead(400).end(); return; }
          if (!terminalAgents.has(termId)) terminalAgents.set(termId, new Map());
          const agentMap = terminalAgents.get(termId);
          if (event === 'start') {
            agentMap.set(agentId, { description: (description || '').slice(0, 60) });
          } else {
            agentMap.delete(agentId);
          }
          const agents = [...agentMap.entries()].map(([id, d]) => ({ agentId: id, description: d.description }));
          log('INFO', 'Agent update:', termId, event, agentId);
          const win = getWindow();
          if (win && !win.isDestroyed()) win.webContents.send('worktree:agent-changed', { termId, agents });
          res.writeHead(200).end('ok');
        } catch { res.writeHead(400).end(); }
      });
      return;
    }

    if (req.url !== '/status') { res.writeHead(404).end(); return; }
    readBody(req, res, (body) => {
      try {
        const { termId, status, sessionId } = JSON.parse(body);
        const validStatuses = ['working', 'idle', 'thinking', 'waiting', 'session_start', 'session_stop'];
        if (!termId || !SAFE_ID_RE.test(termId) || !validStatuses.includes(status)) { res.writeHead(400).end(); return; }
        log('INFO', 'Status update:', termId, status);
        const win = getWindow();
        if (status === 'session_start') {
          terminalSessionActive.set(termId, true);
          if (sessionId) {
            terminalSessionIds.set(termId, sessionId);
            log('INFO', 'Session id assigned:', termId, sessionId);
          }
        } else if (status === 'session_stop') {
          terminalSessionActive.set(termId, false);
          terminalStatuses.delete(termId);
          terminalSessionIds.delete(termId);
          if (terminalAgents.has(termId)) {
            terminalAgents.get(termId).clear();
            if (win && !win.isDestroyed()) win.webContents.send('worktree:agent-changed', { termId, agents: [] });
          }
          if (terminalProcesses.has(termId)) {
            terminalProcesses.get(termId).clear();
            if (win && !win.isDestroyed()) win.webContents.send('worktree:process-changed', { termId, processes: [] });
          }
          clearPidMonitorsForTerm(termId);
        } else {
          terminalSessionActive.set(termId, true);
          terminalStatuses.set(termId, status);
        }
        const sessionActive = terminalSessionActive.get(termId) ?? false;
        const currentStatus = terminalStatuses.get(termId) ?? null;
        const resolvedSessionId = terminalSessionIds.get(termId) ?? null;
        if (win && !win.isDestroyed()) {
          win.webContents.send('worktree:status-changed', { termId, status: currentStatus, sessionActive, sessionId: resolvedSessionId });
          log('INFO', 'IPC sent worktree:status-changed', termId, currentStatus, 'sessionActive:', sessionActive);
        } else {
          log('WARN', 'IPC skip — no window for', termId);
        }
        res.writeHead(200).end('ok');
      } catch { res.writeHead(400).end(); }
    });
  });

  server.on('error', err => {
    log('ERROR', 'Status server error:', err.message);
    console.error('[mentat] status server:', err);
  });

  findPort(server).then(port => {
    log('INFO', `Status server listening on :${port}`);
    if (onPort) onPort(port);
  }).catch(err => {
    log('ERROR', 'Status server failed to start:', err.message);
  });

  return server;
}

module.exports = { startStatusServer, clearAllPidMonitors };
