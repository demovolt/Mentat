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
      termId: 'term-a1', status: 'working', sessionActive: true,
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
});

describe('Status server - /session endpoint', () => {
  beforeEach(() => { mocks.mockWin.webContents.send.mockClear(); });

  it('assigns sessionId on first POST and sends IPC event', async () => {
    const termId = `term-sess-${Date.now()}`;
    const res = await makeRequest('POST', '/session', { termId, sessionId: 'sess-abc-123' });
    expect(res.writeHead).toHaveBeenCalledWith(200);
    expect(mocks.mockWin.webContents.send).toHaveBeenCalledWith('session:id-updated', {
      termId, sessionId: 'sess-abc-123',
    });
  });

  it('does not override existing sessionId', async () => {
    const termId = `term-sess-dup-${Date.now()}`;
    await makeRequest('POST', '/session', { termId, sessionId: 'first' });
    mocks.mockWin.webContents.send.mockClear();
    await makeRequest('POST', '/session', { termId, sessionId: 'second' });
    expect(mocks.mockWin.webContents.send).not.toHaveBeenCalled();
  });

  it('returns 400 when termId is missing', async () => {
    const res = await makeRequest('POST', '/session', { sessionId: 'sess-123' });
    expect(res.writeHead).toHaveBeenCalledWith(400);
  });

  it('returns 400 when sessionId is missing', async () => {
    const res = await makeRequest('POST', '/session', { termId: 'term-1' });
    expect(res.writeHead).toHaveBeenCalledWith(400);
  });
});
