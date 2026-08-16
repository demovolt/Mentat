'use strict';

const http = require('http');
const { execSync } = require('child_process');
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { SSEServerTransport } = require('@modelcontextprotocol/sdk/server/sse.js');
const { z } = require('zod');
const { terminalStatuses, terminalSessionActive, terminalSessionIds, terminalAgents } = require('./terminal-state');
const { log } = require('./logger');

const MAX_BODY = 8192;
const MCP_PORT = 27183;

// ── State mutators (shared with status-server logic) ──────────────────────────

function applyStatus(termId, status, getWindow) {
  const valid = ['working', 'idle', 'thinking', 'waiting', 'session_start', 'session_stop'];
  if (!termId || !valid.includes(status)) return false;
  log('INFO', 'Status update (mcp):', termId, status);
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
  return true;
}

function applyAgent(termId, event, agentId, description, getWindow) {
  if (!termId || !agentId || !['start', 'stop'].includes(event)) return false;
  if (!terminalAgents.has(termId)) terminalAgents.set(termId, new Map());
  const agentMap = terminalAgents.get(termId);
  if (event === 'start') {
    agentMap.set(agentId, { description: (description || '').slice(0, 60) });
  } else {
    agentMap.delete(agentId);
  }
  const agents = [...agentMap.entries()].map(([id, d]) => ({ agentId: id, description: d.description }));
  log('INFO', 'Agent update (mcp):', termId, event, agentId);
  const win = getWindow();
  if (win && !win.isDestroyed()) win.webContents.send('worktree:agent-changed', { termId, agents });
  return true;
}

function applySession(termId, sessionId, getWindow) {
  if (!termId || !sessionId) return false;
  if (!terminalSessionIds.has(termId)) {
    terminalSessionIds.set(termId, sessionId);
    log('INFO', 'Session id (mcp):', termId, sessionId);
    const win = getWindow();
    if (win && !win.isDestroyed()) win.webContents.send('session:id-updated', { termId, sessionId });
  }
  return true;
}

// ── HTTP body reader ──────────────────────────────────────────────────────────

function readBody(req, res) {
  return new Promise((resolve, reject) => {
    let body = '';
    let oversized = false;
    req.on('data', chunk => {
      if (oversized) return;
      body += chunk;
      if (body.length > maxSize) {
        oversized = true;
        res.writeHead(413).end();
        req.destroy();
        reject(new Error('oversized'));
      }
    });
    req.on('end', () => { if (!oversized) resolve(body); });
    req.on('error', reject);
  });
}

// ── MCP server ────────────────────────────────────────────────────────────────

function buildMcpServer(getWindow, getWorktrees) {
  const server = new McpServer({ name: 'mentat', version: '1.0.0' });

  server.tool(
    'report_status',
    'Update the Mentat status indicator for the current terminal. Call this to keep the sidebar in sync with what Claude is doing.',
    {
      termId: z.string().describe('Value of $MENTAT_TERM_ID env var'),
      status: z.enum(['thinking', 'working', 'waiting', 'idle']),
    },
    async ({ termId, status }) => {
      applyStatus(termId, status, getWindow);
      return { content: [{ type: 'text', text: 'ok' }] };
    }
  );

  server.tool(
    'report_session',
    'Register the Claude session ID so Mentat can offer session resumption.',
    {
      termId: z.string().describe('Value of $MENTAT_TERM_ID env var'),
      sessionId: z.string(),
    },
    async ({ termId, sessionId }) => {
      applySession(termId, sessionId, getWindow);
      return { content: [{ type: 'text', text: 'ok' }] };
    }
  );

  server.tool(
    'report_agent',
    'Track a spawned sub-agent in the Mentat sidebar tree.',
    {
      termId: z.string().describe('Value of $MENTAT_TERM_ID env var'),
      event: z.enum(['start', 'stop']),
      agentId: z.string().describe('tool_use_id from the Agent tool call'),
      description: z.string().optional(),
    },
    async ({ termId, event, agentId, description = '' }) => {
      applyAgent(termId, event, agentId, description, getWindow);
      return { content: [{ type: 'text', text: 'ok' }] };
    }
  );

  server.tool(
    'list_worktrees',
    'List all git worktrees across all Mentat workspaces. Use this to understand the project structure before starting work.',
    {},
    async () => {
      const worktrees = getWorktrees ? getWorktrees() : [];
      const text = JSON.stringify(worktrees, null, 2);
      return { content: [{ type: 'text', text }] };
    }
  );

  server.tool(
    'get_git_status',
    'Get git status for a specific worktree path.',
    {
      path: z.string().describe('Absolute path to the worktree directory'),
    },
    async ({ path: worktreePath }) => {
      try {
        const output = execSync('git status --porcelain', {
          cwd: worktreePath,
          encoding: 'utf8',
          timeout: 5000,
        });
        return { content: [{ type: 'text', text: output || '(clean)' }] };
      } catch (e) {
        return { content: [{ type: 'text', text: `Error: ${e.message}` }], isError: true };
      }
    }
  );

  return server;
}

// ── Hook endpoint handler ─────────────────────────────────────────────────────

async function handleHook(pathname, searchParams, body, getWindow) {
  const termId = searchParams.get('termId') || '';
  let data = {};
  try { data = JSON.parse(body || '{}'); } catch {}

  // /hook/status/:status
  const statusMatch = pathname.match(/^\/hook\/status\/([a-z_]+)$/);
  if (statusMatch) {
    applyStatus(termId, statusMatch[1], getWindow);
    return 200;
  }

  // /hook/agent/start or /hook/agent/stop
  const agentMatch = pathname.match(/^\/hook\/agent\/(start|stop)$/);
  if (agentMatch) {
    const event = agentMatch[1];
    const agentId = data.tool_use_id || '';
    const description = data.tool_input?.description?.slice(0, 60) || '';
    applyAgent(termId, event, agentId, description, getWindow);
    return 200;
  }

  // /hook/stop — Stop hook: carries session_id + sets idle
  if (pathname === '/hook/stop') {
    const sessionId = data.session_id || '';
    applyStatus(termId, 'idle', getWindow);
    if (sessionId) applySession(termId, sessionId, getWindow);
    return 200;
  }

  return 404;
}

// ── Public: startMcpServer ────────────────────────────────────────────────────

function startMcpServer(getWindow, getWorktrees) {
  const mcpServer = buildMcpServer(getWindow, getWorktrees);
  const transports = new Map();

  const httpServer = http.createServer(async (req, res) => {
    let url;
    try { url = new URL(req.url, 'http://localhost'); } catch {
      res.writeHead(400).end(); return;
    }

    // ── MCP SSE: client opens the event stream ────────────────────────────
    if (url.pathname === '/sse' && req.method === 'GET') {
      res.setHeader('Access-Control-Allow-Origin', '*');
      const transport = new SSEServerTransport('/message', res);
      transports.set(transport.sessionId, transport);
      req.on('close', () => transports.delete(transport.sessionId));
      try {
        await mcpServer.connect(transport);
      } catch (e) {
        log('ERROR', 'MCP connect error:', e.message);
      }
      return;
    }

    // ── MCP SSE: client posts JSON-RPC messages ───────────────────────────
    if (url.pathname === '/message' && req.method === 'POST') {
      const sessionId = url.searchParams.get('sessionId');
      const transport = transports.get(sessionId);
      if (transport) {
        try { await transport.handlePostMessage(req, res); } catch (e) {
          log('ERROR', 'MCP message error:', e.message);
          if (!res.headersSent) res.writeHead(500).end();
        }
        return;
      }
      res.writeHead(404).end(); return;
    }

    // ── Hook HTTP endpoints (inline curl from settings.json hooks) ────────
    if (url.pathname.startsWith('/hook/') && req.method === 'POST') {
      let body = '';
      try { body = await readBody(req, res); } catch { return; }
      const code = await handleHook(url.pathname, url.searchParams, body, getWindow);
      res.writeHead(code).end(code === 200 ? 'ok' : 'not found');
      return;
    }

    res.writeHead(404).end();
  });

  httpServer.on('error', err => {
    log('ERROR', 'MCP server error:', err.message);
    if (err.code !== 'EADDRINUSE') console.error('[mentat] mcp server:', err);
  });

  httpServer.listen(MCP_PORT, '0.0.0.0', () => {
    log('INFO', `MCP server listening on :${MCP_PORT}`);
  });

  return httpServer;
}

module.exports = { startMcpServer, MCP_PORT };
