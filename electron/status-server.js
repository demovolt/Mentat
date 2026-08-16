'use strict';

const http = require('http');
const { terminalStatuses, terminalSessionActive, terminalSessionIds, terminalAgents } = require('./terminal-state');
const { log } = require('./logger');

const MAX_BODY_SIZE = 8192;

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

function startStatusServer(getWindow) {
  const server = http.createServer((req, res) => {
    if (req.method !== 'POST') { res.writeHead(404).end(); return; }

    if (req.url === '/agent') {
      readBody(req, res, (body) => {
        try {
          const { termId, agentId, event, description } = JSON.parse(body);
          if (!termId || !agentId || !['start', 'stop'].includes(event)) { res.writeHead(400).end(); return; }
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

    if (req.url === '/session') {
      readBody(req, res, (body) => {
        try {
          const { termId, sessionId } = JSON.parse(body);
          if (!termId || !sessionId) { res.writeHead(400).end(); return; }
          if (!terminalSessionIds.has(termId)) {
            terminalSessionIds.set(termId, sessionId);
            log('INFO', 'Session id assigned:', termId, sessionId);
            const win = getWindow();
            if (win && !win.isDestroyed()) {
              win.webContents.send('session:id-updated', { termId, sessionId });
            }
          }
          res.writeHead(200).end('ok');
        } catch { res.writeHead(400).end(); }
      });
      return;
    }

    if (req.url !== '/status') { res.writeHead(404).end(); return; }
    readBody(req, res, (body) => {
      try {
        const { termId, status } = JSON.parse(body);
        const validStatuses = ['working', 'idle', 'thinking', 'waiting', 'session_start', 'session_stop'];
        if (!termId || !validStatuses.includes(status)) { res.writeHead(400).end(); return; }
        log('INFO', 'Status update:', termId, status);
        const win = getWindow();
        if (status === 'session_start') {
          terminalSessionActive.set(termId, true);
        } else if (status === 'session_stop') {
          terminalSessionActive.set(termId, false);
          terminalStatuses.delete(termId);
          if (terminalAgents.has(termId)) {
            terminalAgents.get(termId).clear();
            if (win && !win.isDestroyed()) win.webContents.send('worktree:agent-changed', { termId, agents: [] });
          }
        } else {
          terminalSessionActive.set(termId, true);
          terminalStatuses.set(termId, status);
        }
        const sessionActive = terminalSessionActive.get(termId) ?? false;
        const currentStatus = terminalStatuses.get(termId) ?? null;
        if (win && !win.isDestroyed()) {
          win.webContents.send('worktree:status-changed', { termId, status: currentStatus, sessionActive });
        }
        res.writeHead(200).end('ok');
      } catch { res.writeHead(400).end(); }
    });
  });

  server.on('error', err => {
    log('ERROR', 'Status server error:', err.message);
    if (err.code !== 'EADDRINUSE') console.error('[mentat] status server:', err);
  });

  server.listen(27182, '0.0.0.0', () => {
    log('INFO', 'Status server listening on :27182');
  });

  return server;
}

module.exports = { startStatusServer };
