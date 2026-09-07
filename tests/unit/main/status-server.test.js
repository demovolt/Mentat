import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { setupMainMocks, loadMainModule } from './mock-setup.js';

const mocks = setupMainMocks();

beforeAll(async () => {
  await loadMainModule(mocks);
});

// Helper to simulate an HTTP request to the captured handler
function makeRequest(method, url, body) {
  return new Promise((resolve) => {
    const res = {
      writeHead: vi.fn(() => res),
      end: vi.fn(() => resolve(res)),
    };
    const req = {
      method,
      url,
      on: vi.fn((event, cb) => {
        if (event === 'data') cb(Buffer.from(JSON.stringify(body)));
        if (event === 'end') cb();
      }),
    };
    mocks.capturedHttpHandler(req, res);
  });
}

describe('Status server - /status endpoint', () => {
  beforeEach(() => { mocks.mockWin.webContents.send.mockClear(); });

  it('returns 404 for non-POST requests', async () => {
    const res = await makeRequest('GET', '/status', {});
    expect(res.writeHead).toHaveBeenCalledWith(404);
  });

  it('returns 404 for unknown paths', async () => {
    const res = await makeRequest('POST', '/unknown', {});
    expect(res.writeHead).toHaveBeenCalledWith(404);
  });

  it('accepts working status and sends IPC event', async () => {
    const res = await makeRequest('POST', '/status', { termId: 'term-a1', status: 'working' });
    expect(res.writeHead).toHaveBeenCalledWith(200);
    expect(mocks.mockWin.webContents.send).toHaveBeenCalledWith('worktree:status-changed', {
      termId: 'term-a1', status: 'working', sessionActive: true, sessionId: null,
    });
  });

  it('accepts thinking status', async () => {
    const res = await makeRequest('POST', '/status', { termId: 'term-a2', status: 'thinking' });
    expect(res.writeHead).toHaveBeenCalledWith(200);
  });

  it('accepts waiting status', async () => {
    const res = await makeRequest('POST', '/status', { termId: 'term-a3', status: 'waiting' });
    expect(res.writeHead).toHaveBeenCalledWith(200);
  });

  it('accepts idle status', async () => {
    const res = await makeRequest('POST', '/status', { termId: 'term-a4', status: 'idle' });
    expect(res.writeHead).toHaveBeenCalledWith(200);
  });

  it('session_start sets sessionActive true, status null', async () => {
    const termId = `term-ss-${Date.now()}`;
    const res = await makeRequest('POST', '/status', { termId, status: 'session_start' });
    expect(res.writeHead).toHaveBeenCalledWith(200);
    const call = mocks.mockWin.webContents.send.mock.calls.find(c => c[1]?.termId === termId);
    expect(call[1].sessionActive).toBe(true);
    expect(call[1].status).toBeNull();
  });

  it('session_start with sessionId includes sessionId in worktree:status-changed', async () => {
    const termId = `term-sid-${Date.now()}`;
    const res = await makeRequest('POST', '/status', { termId, status: 'session_start', sessionId: 'sess-abc-123' });
    expect(res.writeHead).toHaveBeenCalledWith(200);
    const call = mocks.mockWin.webContents.send.mock.calls.find(c => c[0] === 'worktree:status-changed' && c[1]?.termId === termId);
    expect(call).toBeDefined();
    expect(call[1].sessionId).toBe('sess-abc-123');
  });

  it('session_stop sets sessionActive false and clears status', async () => {
    const termId = `term-sp-${Date.now()}`;
    await makeRequest('POST', '/status', { termId, status: 'working' });
    mocks.mockWin.webContents.send.mockClear();
    await makeRequest('POST', '/status', { termId, status: 'session_stop' });
    const call = mocks.mockWin.webContents.send.mock.calls[0];
    expect(call[1].sessionActive).toBe(false);
    expect(call[1].status).toBeNull();
  });

  it('returns 400 for invalid status value', async () => {
    const res = await makeRequest('POST', '/status', { termId: 'term-1', status: 'invalid' });
    expect(res.writeHead).toHaveBeenCalledWith(400);
  });

  it('returns 400 when termId is missing', async () => {
    const res = await makeRequest('POST', '/status', { status: 'working' });
    expect(res.writeHead).toHaveBeenCalledWith(400);
  });

  it('returns 400 for termId with special characters', async () => {
    const res = await makeRequest('POST', '/status', { termId: '../etc/passwd', status: 'working' });
    expect(res.writeHead).toHaveBeenCalledWith(400);
  });

  it('returns 400 for termId with spaces', async () => {
    const res = await makeRequest('POST', '/status', { termId: 'term id', status: 'working' });
    expect(res.writeHead).toHaveBeenCalledWith(400);
  });
});

describe('Status server - /agent endpoint', () => {
  beforeEach(() => { mocks.mockWin.webContents.send.mockClear(); });

  it('returns 400 for agent event with invalid termId', async () => {
    const res = await makeRequest('POST', '/agent', { termId: '<script>', agentId: 'a1', event: 'start' });
    expect(res.writeHead).toHaveBeenCalledWith(400);
  });

  it('returns 400 for agent event with missing agentId', async () => {
    const res = await makeRequest('POST', '/agent', { termId: 'term-1', event: 'start' });
    expect(res.writeHead).toHaveBeenCalledWith(400);
  });

  it('returns 400 for unknown agent event type', async () => {
    const res = await makeRequest('POST', '/agent', { termId: 'term-1', agentId: 'a1', event: 'unknown' });
    expect(res.writeHead).toHaveBeenCalledWith(400);
  });

  it('accepts valid agent start event', async () => {
    const res = await makeRequest('POST', '/agent', { termId: 'term-1', agentId: 'agent-abc', event: 'start', description: 'doing work' });
    expect(res.writeHead).toHaveBeenCalledWith(200);
    expect(mocks.mockWin.webContents.send).toHaveBeenCalledWith('worktree:agent-changed', expect.objectContaining({ termId: 'term-1' }));
  });

  it('truncates agent description to 60 chars', async () => {
    const longDesc = 'a'.repeat(100);
    await makeRequest('POST', '/agent', { termId: 'term-2', agentId: 'a1', event: 'start', description: longDesc });
    const call = mocks.mockWin.webContents.send.mock.calls.find(c => c[0] === 'worktree:agent-changed');
    expect(call[1].agents[0].description).toHaveLength(60);
  });
});

