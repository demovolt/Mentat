import { describe, it, expect, vi, beforeAll } from 'vitest';
import { createRequire } from 'module';

const _require = createRequire(import.meta.url);

let exposedApi = null;

const mockIpcRenderer = {
  invoke: vi.fn(),
  send: vi.fn(),
  on: vi.fn(),
  removeListener: vi.fn(),
};

const mockClipboard = {
  readText: vi.fn(() => 'clipboard-content'),
  writeText: vi.fn(),
};

// Inject electron mock into require.cache before preload.js is loaded
function injectElectronMock() {
  let resolved;
  try { resolved = _require.resolve('electron'); } catch { return; }
  _require.cache[resolved] = {
    id: resolved, filename: resolved, loaded: true,
    exports: {
      contextBridge: {
        exposeInMainWorld: vi.fn((key, value) => {
          if (key === 'api') exposedApi = value;
        }),
      },
      ipcRenderer: mockIpcRenderer,
      clipboard: mockClipboard,
    },
  };
}

// Also remove preload.js from cache so it re-loads
function clearPreloadCache() {
  const preloadPath = new URL('../../../electron/preload.js', import.meta.url).pathname;
  delete _require.cache[preloadPath];
}

beforeAll(async () => {
  exposedApi = null;
  vi.clearAllMocks();
  injectElectronMock();
  clearPreloadCache();
  await import('../../../electron/preload.js');
});

describe('preload contextBridge API', () => {
  it('exposes api object via contextBridge', () => {
    expect(exposedApi).toBeDefined();
    expect(typeof exposedApi).toBe('object');
  });

  it('getConfig calls ipcRenderer.invoke with config:get', async () => {
    mockIpcRenderer.invoke.mockResolvedValue({ workspace: [] });
    await exposedApi.getConfig();
    expect(mockIpcRenderer.invoke).toHaveBeenCalledWith('config:get');
  });

  it('saveConfig calls ipcRenderer.invoke with config:save', async () => {
    const cfg = { workspace: [] };
    await exposedApi.saveConfig(cfg);
    expect(mockIpcRenderer.invoke).toHaveBeenCalledWith('config:save', cfg);
  });

  it('getState calls ipcRenderer.invoke with state:get', async () => {
    await exposedApi.getState();
    expect(mockIpcRenderer.invoke).toHaveBeenCalledWith('state:get');
  });

  it('saveState calls ipcRenderer.invoke with state:save', async () => {
    const state = { terminals: [] };
    await exposedApi.saveState(state);
    expect(mockIpcRenderer.invoke).toHaveBeenCalledWith('state:save', state);
  });

  it('getShellProfiles calls ipcRenderer.invoke with shell:get-profiles', async () => {
    await exposedApi.getShellProfiles();
    expect(mockIpcRenderer.invoke).toHaveBeenCalledWith('shell:get-profiles');
  });

  it('openFolder calls ipcRenderer.invoke with dialog:open-folder', async () => {
    await exposedApi.openFolder();
    expect(mockIpcRenderer.invoke).toHaveBeenCalledWith('dialog:open-folder');
  });

  it('detectRepo calls ipcRenderer.invoke with git:detect-repo', async () => {
    await exposedApi.detectRepo('/some/path');
    expect(mockIpcRenderer.invoke).toHaveBeenCalledWith('git:detect-repo', '/some/path');
  });

  it('getBranches calls ipcRenderer.invoke with git:get-branches', async () => {
    await exposedApi.getBranches('/repo');
    expect(mockIpcRenderer.invoke).toHaveBeenCalledWith('git:get-branches', '/repo');
  });

  it('getWorktrees calls ipcRenderer.invoke with git:get-worktrees', async () => {
    await exposedApi.getWorktrees('/repo');
    expect(mockIpcRenderer.invoke).toHaveBeenCalledWith('git:get-worktrees', '/repo');
  });

  it('createWorktree calls ipcRenderer.invoke with git:create-worktree', async () => {
    const opts = { repoPath: '/repo', branch: 'feat', baseBranch: 'main' };
    await exposedApi.createWorktree(opts);
    expect(mockIpcRenderer.invoke).toHaveBeenCalledWith('git:create-worktree', opts);
  });

  it('removeWorktree calls ipcRenderer.invoke with git:remove-worktree', async () => {
    const opts = { repoPath: '/repo', worktreePath: '/wt' };
    await exposedApi.removeWorktree(opts);
    expect(mockIpcRenderer.invoke).toHaveBeenCalledWith('git:remove-worktree', opts);
  });

  it('deleteBranch calls ipcRenderer.invoke with git:delete-branch', async () => {
    const opts = { repoPath: '/repo', branch: 'feat' };
    await exposedApi.deleteBranch(opts);
    expect(mockIpcRenderer.invoke).toHaveBeenCalledWith('git:delete-branch', opts);
  });

  it('gitCurrentBranch calls ipcRenderer.invoke with git:current-branch', async () => {
    await exposedApi.gitCurrentBranch('/repo');
    expect(mockIpcRenderer.invoke).toHaveBeenCalledWith('git:current-branch', '/repo');
  });

  it('createTerminal calls ipcRenderer.send with pty:create payload', () => {
    mockIpcRenderer.send.mockClear();
    exposedApi.createTerminal('t1', '/repo', 'bash', null, 'claude', null);
    expect(mockIpcRenderer.send).toHaveBeenCalledWith('pty:create', {
      termId: 't1', worktreePath: '/repo', shellId: 'bash',
      type: null, aiCommand: 'claude', sessionId: null,
    });
  });

  it('writeTerminal calls ipcRenderer.send with pty:write payload', () => {
    mockIpcRenderer.send.mockClear();
    exposedApi.writeTerminal('t1', 'ls\n');
    expect(mockIpcRenderer.send).toHaveBeenCalledWith('pty:write', { termId: 't1', data: 'ls\n' });
  });

  it('resizeTerminal calls ipcRenderer.send with pty:resize payload', () => {
    mockIpcRenderer.send.mockClear();
    exposedApi.resizeTerminal('t1', 120, 40);
    expect(mockIpcRenderer.send).toHaveBeenCalledWith('pty:resize', { termId: 't1', cols: 120, rows: 40 });
  });

  it('closeTerminal calls ipcRenderer.send with pty:close', () => {
    mockIpcRenderer.send.mockClear();
    exposedApi.closeTerminal('t1');
    expect(mockIpcRenderer.send).toHaveBeenCalledWith('pty:close', { termId: 't1' });
  });

  it('onTerminalData registers listener on pty:data and returns unsubscribe', () => {
    mockIpcRenderer.on.mockClear();
    const cb = vi.fn();
    const unsub = exposedApi.onTerminalData(cb);
    expect(mockIpcRenderer.on).toHaveBeenCalledWith('pty:data', expect.any(Function));
    expect(typeof unsub).toBe('function');
    unsub();
    expect(mockIpcRenderer.removeListener).toHaveBeenCalled();
  });

  it('onWorktreeStatus registers listener on worktree:status-changed', () => {
    mockIpcRenderer.on.mockClear();
    exposedApi.onWorktreeStatus(vi.fn());
    expect(mockIpcRenderer.on).toHaveBeenCalledWith('worktree:status-changed', expect.any(Function));
  });

  it('onTerminalExited registers listener on pty:exited', () => {
    mockIpcRenderer.on.mockClear();
    exposedApi.onTerminalExited(vi.fn());
    expect(mockIpcRenderer.on).toHaveBeenCalledWith('pty:exited', expect.any(Function));
  });

  it('clipboardRead calls clipboard.readText', () => {
    const result = exposedApi.clipboardRead();
    expect(mockClipboard.readText).toHaveBeenCalled();
    expect(result).toBe('clipboard-content');
  });

  it('clipboardWrite calls clipboard.writeText', () => {
    exposedApi.clipboardWrite('hello');
    expect(mockClipboard.writeText).toHaveBeenCalledWith('hello');
  });

  it('minimize calls ipcRenderer.send with window:minimize', () => {
    mockIpcRenderer.send.mockClear();
    exposedApi.minimize();
    expect(mockIpcRenderer.send).toHaveBeenCalledWith('window:minimize');
  });

  it('toggleMaximize calls ipcRenderer.send with window:toggle-maximize', () => {
    mockIpcRenderer.send.mockClear();
    exposedApi.toggleMaximize();
    expect(mockIpcRenderer.send).toHaveBeenCalledWith('window:toggle-maximize');
  });

  it('close calls ipcRenderer.send with window:close', () => {
    mockIpcRenderer.send.mockClear();
    exposedApi.close();
    expect(mockIpcRenderer.send).toHaveBeenCalledWith('window:close');
  });

  it('setLoggingEnabled calls ipcRenderer.invoke with logging:set-enabled', async () => {
    await exposedApi.setLoggingEnabled(true);
    expect(mockIpcRenderer.invoke).toHaveBeenCalledWith('logging:set-enabled', true);
  });

  it('getLogPath calls ipcRenderer.invoke with logging:get-path', async () => {
    await exposedApi.getLogPath();
    expect(mockIpcRenderer.invoke).toHaveBeenCalledWith('logging:get-path');
  });

  it('logError calls ipcRenderer.send with log:renderer-error', () => {
    mockIpcRenderer.send.mockClear();
    exposedApi.logError('something broke');
    expect(mockIpcRenderer.send).toHaveBeenCalledWith('log:renderer-error', 'something broke');
  });
});
