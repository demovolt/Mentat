import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { setupMainMocks, loadMainModule } from './mock-setup.js';

const mocks = setupMainMocks();

beforeAll(async () => {
  await loadMainModule(mocks);
});

const ev = {};

describe('pty:create', () => {
  beforeEach(() => {
    mocks.mockPtyProcess.onData.mockReset().mockImplementation(() => {});
    mocks.mockPtyProcess.onExit.mockReset().mockImplementation(() => {});
    mocks.mockWin.webContents.send.mockClear();
    mocks.ptyMock.spawn.mockClear();
  });

  it('spawns with MENTAT_TERM_ID env var set', () => {
    mocks._onHandlers['pty:create'](ev, {
      termId: 'term-env', worktreePath: '/repo',
      shellId: null, type: null, aiCommand: null, sessionId: null,
    });
    expect(mocks.ptyMock.spawn).toHaveBeenCalled();
    const [, , opts] = mocks.ptyMock.spawn.mock.calls[0];
    expect(opts.env.MENTAT_TERM_ID).toBe('term-env');
  });

  it('spawns claude for ai type', () => {
    mocks._onHandlers['pty:create'](ev, {
      termId: 'term-ai', worktreePath: '/repo',
      shellId: null, type: 'ai', aiCommand: 'claude', sessionId: null,
    });
    expect(mocks.ptyMock.spawn).toHaveBeenCalledWith('claude', [], expect.objectContaining({
      cwd: '/repo',
      env: expect.objectContaining({ MENTAT_TERM_ID: 'term-ai' }),
    }));
  });

  it('spawns claude with --resume when sessionId is provided', () => {
    mocks._onHandlers['pty:create'](ev, {
      termId: 'term-resume', worktreePath: '/repo',
      shellId: null, type: 'ai', aiCommand: 'claude', sessionId: 'sess-abc',
    });
    expect(mocks.ptyMock.spawn).toHaveBeenCalledWith('claude', ['--resume', 'sess-abc'], expect.any(Object));
  });

  it('sends sessionActive=true IPC event for ai terminal', () => {
    mocks._onHandlers['pty:create'](ev, {
      termId: 'term-ai-st', worktreePath: '/repo',
      shellId: null, type: 'ai', aiCommand: 'claude', sessionId: null,
    });
    expect(mocks.mockWin.webContents.send).toHaveBeenCalledWith('worktree:status-changed', {
      termId: 'term-ai-st', status: null, sessionActive: true,
    });
  });

  it('buffers PTY output and flushes after 16ms', async () => {
    vi.useFakeTimers();
    let dataCallback;
    mocks.mockPtyProcess.onData.mockImplementation(cb => { dataCallback = cb; });

    mocks._onHandlers['pty:create'](ev, {
      termId: 'term-buf', worktreePath: '/repo',
      shellId: null, type: null, aiCommand: null, sessionId: null,
    });

    dataCallback('hello ');
    dataCallback('world');

    const sentBefore = mocks.mockWin.webContents.send.mock.calls.filter(c => c[0] === 'pty:data');
    expect(sentBefore).toHaveLength(0);

    vi.advanceTimersByTime(20);

    const sentAfter = mocks.mockWin.webContents.send.mock.calls.filter(c => c[0] === 'pty:data');
    expect(sentAfter).toHaveLength(1);
    expect(sentAfter[0][1]).toEqual({ termId: 'term-buf', data: 'hello world' });

    vi.useRealTimers();
  });

  it('sends pty:exited and clears sessionActive for ai terminal on exit', () => {
    let exitCallback;
    mocks.mockPtyProcess.onExit.mockImplementation(cb => { exitCallback = cb; });

    mocks._onHandlers['pty:create'](ev, {
      termId: 'term-exit', worktreePath: '/repo',
      shellId: null, type: 'ai', aiCommand: 'claude', sessionId: null,
    });

    exitCallback({ exitCode: 0 });

    expect(mocks.mockWin.webContents.send).toHaveBeenCalledWith('worktree:status-changed', {
      termId: 'term-exit', status: null, sessionActive: false,
    });
    expect(mocks.mockWin.webContents.send).toHaveBeenCalledWith('pty:exited', { termId: 'term-exit' });
  });
});

describe('pty:write', () => {
  beforeEach(() => {
    mocks.mockPtyProcess.write.mockClear();
    mocks.mockPtyProcess.onData.mockReset().mockImplementation(() => {});
    mocks.mockPtyProcess.onExit.mockReset().mockImplementation(() => {});
  });

  it('writes data to the pty process', () => {
    mocks._onHandlers['pty:create'](ev, {
      termId: 'term-wr', worktreePath: '/repo',
      shellId: null, type: null, aiCommand: null, sessionId: null,
    });
    mocks._onHandlers['pty:write'](ev, { termId: 'term-wr', data: 'ls\n' });
    expect(mocks.mockPtyProcess.write).toHaveBeenCalledWith('ls\n');
  });

  it('ignores unknown termId without throwing', () => {
    expect(() => {
      mocks._onHandlers['pty:write'](ev, { termId: 'nonexistent-xyz', data: 'test' });
    }).not.toThrow();
  });
});

describe('pty:resize', () => {
  beforeEach(() => {
    mocks.mockPtyProcess.resize.mockClear();
    mocks.mockPtyProcess.onData.mockReset().mockImplementation(() => {});
    mocks.mockPtyProcess.onExit.mockReset().mockImplementation(() => {});
  });

  it('calls resize on the pty process', () => {
    mocks._onHandlers['pty:create'](ev, {
      termId: 'term-rsz', worktreePath: '/repo',
      shellId: null, type: null, aiCommand: null, sessionId: null,
    });
    mocks._onHandlers['pty:resize'](ev, { termId: 'term-rsz', cols: 120, rows: 40 });
    expect(mocks.mockPtyProcess.resize).toHaveBeenCalledWith(120, 40);
  });
});

describe('pty:close', () => {
  beforeEach(() => {
    mocks.mockPtyProcess.kill.mockClear();
    mocks.mockPtyProcess.onData.mockReset().mockImplementation(() => {});
    mocks.mockPtyProcess.onExit.mockReset().mockImplementation(() => {});
  });

  it('kills the pty process', () => {
    mocks._onHandlers['pty:create'](ev, {
      termId: 'term-cl', worktreePath: '/repo',
      shellId: null, type: null, aiCommand: null, sessionId: null,
    });
    mocks._onHandlers['pty:close'](ev, { termId: 'term-cl' });
    expect(mocks.mockPtyProcess.kill).toHaveBeenCalledTimes(1);
  });

  it('does nothing for unknown termId', () => {
    expect(() => {
      mocks._onHandlers['pty:close'](ev, { termId: 'nonexistent-abc' });
    }).not.toThrow();
  });
});
