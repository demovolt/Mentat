import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { setupMainMocks, loadMainModule } from './mock-setup.js';

const mocks = setupMainMocks();

beforeAll(async () => {
  await loadMainModule(mocks);
});

const ev = {};

describe('config:get IPC handler', () => {
  beforeEach(() => { mocks.fs.readFileSync.mockReset(); });

  it('returns defaults when config file does not exist', async () => {
    mocks.fs.readFileSync.mockImplementation(() => {
      throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    });
    const result = await mocks._handlers['config:get'](ev);
    expect(result).toMatchObject({ workspace: [], aiCommand: 'claude' });
  });

  it('parses and returns valid config JSON', async () => {
    const cfg = { workspace: [{ path: '/home/user/repo' }], aiCommand: 'codex' };
    mocks.fs.readFileSync.mockReturnValue(JSON.stringify(cfg));
    const result = await mocks._handlers['config:get'](ev);
    expect(result).toMatchObject(cfg);
  });

  it('migrates legacy repoPath to workspace array', async () => {
    mocks.fs.readFileSync.mockReturnValue(JSON.stringify({ repoPath: '/old/path' }));
    const result = await mocks._handlers['config:get'](ev);
    expect(result.workspace).toEqual([{ path: '/old/path' }]);
  });

  it('returns defaults when JSON is malformed', async () => {
    mocks.fs.readFileSync.mockReturnValue('{invalid json');
    const result = await mocks._handlers['config:get'](ev);
    expect(result).toMatchObject({ workspace: [], aiCommand: 'claude' });
  });

  it('defaults aiCommand to claude if missing', async () => {
    mocks.fs.readFileSync.mockReturnValue(JSON.stringify({ workspace: [] }));
    const result = await mocks._handlers['config:get'](ev);
    expect(result.aiCommand).toBe('claude');
  });
});

describe('config:save IPC handler', () => {
  beforeEach(() => {
    mocks.fs.writeFileSync.mockReset();
    mocks.fs.mkdirSync.mockReset();
  });

  it('writes JSON to config file', async () => {
    const cfg = { workspace: [{ path: '/repo' }], aiCommand: 'claude' };
    await mocks._handlers['config:save'](ev, cfg);
    expect(mocks.fs.writeFileSync).toHaveBeenCalledWith(
      expect.stringContaining('config.json'),
      expect.stringContaining('"workspace"'),
    );
  });

  it('creates parent directory with recursive option', async () => {
    await mocks._handlers['config:save'](ev, {});
    expect(mocks.fs.mkdirSync).toHaveBeenCalledWith(expect.any(String), { recursive: true });
  });
});

describe('state:get IPC handler', () => {
  beforeEach(() => { mocks.fs.readFileSync.mockReset(); });

  it('returns null when state file does not exist', async () => {
    mocks.fs.readFileSync.mockImplementation(() => {
      throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    });
    expect(await mocks._handlers['state:get'](ev)).toBeNull();
  });

  it('returns parsed state object', async () => {
    const state = { activeWorktreePath: '/repo', terminals: [] };
    mocks.fs.readFileSync.mockReturnValue(JSON.stringify(state));
    expect(await mocks._handlers['state:get'](ev)).toEqual(state);
  });
});

describe('state:save IPC handler', () => {
  beforeEach(() => { mocks.fs.writeFileSync.mockReset(); });

  it('writes serialized state to state.json', async () => {
    const state = { activeWorktreePath: '/repo', terminals: [] };
    await mocks._handlers['state:save'](ev, state);
    expect(mocks.fs.writeFileSync).toHaveBeenCalledWith(
      expect.stringContaining('state.json'),
      JSON.stringify(state, null, 2)
    );
  });
});
