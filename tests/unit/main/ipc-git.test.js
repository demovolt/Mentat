import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { setupMainMocks, loadMainModule } from './mock-setup.js';

const mocks = setupMainMocks();

beforeAll(async () => {
  await loadMainModule(mocks);
});

const ev = {};

describe('git:detect-repo', () => {
  beforeEach(() => mocks.execFileSync.mockClear().mockReturnValue(''));

  it('returns trimmed git root on success', async () => {
    mocks.execFileSync.mockReturnValue('/home/user/repo\n');
    expect(await mocks._handlers['git:detect-repo'](ev, '/home/user/repo/src')).toBe('/home/user/repo');
  });

  it('returns null on error', async () => {
    mocks.execFileSync.mockReturnValue(null); // null.trimEnd() throws → handler catches → null
    expect(await mocks._handlers['git:detect-repo'](ev, '/tmp')).toBeNull();
  });
});

describe('git:get-branches', () => {
  beforeEach(() => mocks.execFileSync.mockClear().mockReturnValue(''));

  it('splits output into branch array', async () => {
    mocks.execFileSync.mockReturnValue('main\nfeature/test\n');
    expect(await mocks._handlers['git:get-branches'](ev, '/repo')).toEqual(['main', 'feature/test']);
  });

  it('returns empty array on error', async () => {
    mocks.execFileSync.mockReturnValue(null); // null.trimEnd() throws → handler catches → []
    expect(await mocks._handlers['git:get-branches'](ev, '/repo')).toEqual([]);
  });
});

describe('git:get-worktrees', () => {
  beforeEach(() => mocks.execFileSync.mockClear().mockReturnValue(''));

  it('returns parsed worktrees', async () => {
    const porcelain = 'worktree /home/user/repo\nHEAD abc1234\nbranch refs/heads/main\n\n';
    mocks.execFileSync.mockReturnValue(porcelain);
    const result = await mocks._handlers['git:get-worktrees'](ev, '/home/user/repo');
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ path: '/home/user/repo', branch: 'main' });
  });

  it('returns empty array on error', async () => {
    mocks.execFileSync.mockReturnValue(null); // null.trimEnd() throws → handler catches → []
    expect(await mocks._handlers['git:get-worktrees'](ev, '/repo')).toEqual([]);
  });
});

describe('git:create-worktree', () => {
  beforeEach(() => {
    mocks.execFileSync.mockClear().mockReturnValue('.git\n');
    mocks.fs.mkdirSync.mockClear();
    mocks.fs.existsSync.mockReturnValue(true);
  });

  it('returns success: true on successful creation', async () => {
    const result = await mocks._handlers['git:create-worktree'](ev, {
      repoPath: '/home/user/repo', branch: 'test', baseBranch: 'main',
    });
    expect(result.success).toBe(true);
  });

  it('sanitizes branch name for directory (replaces slashes)', async () => {
    await mocks._handlers['git:create-worktree'](ev, {
      repoPath: '/home/user/repo', branch: 'feature/my-feat', baseBranch: 'main',
    });
    const addCall = mocks.execFileSync.mock.calls.find(c =>
      Array.isArray(c[1]) && c[1].includes('add')
    );
    expect(addCall).toBeDefined();
    // args: ['worktree', 'add', '-b', branch, worktreePath, baseBranch]
    // indexOf('add') = 1, +3 = index 4 = worktreePath
    const dirArg = addCall[1][addCall[1].indexOf('add') + 3];
    expect(dirArg).toContain('feature-my-feat');
  });

  it('returns success: false with error on failure', async () => {
    mocks.execFileSync.mockReturnValue(null); // null.trimEnd() throws → outer catch → {success:false}
    const result = await mocks._handlers['git:create-worktree'](ev, {
      repoPath: '/repo', branch: 'test', baseBranch: 'main',
    });
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });
});

describe('git:remove-worktree', () => {
  beforeEach(() => {
    mocks.execFileSync.mockClear().mockReturnValue('');
    mocks.fs.existsSync.mockClear().mockReturnValue(false);
    mocks.fs.rmSync.mockClear();
  });

  it('calls git worktree remove --force', async () => {
    await mocks._handlers['git:remove-worktree'](ev, { repoPath: '/repo', worktreePath: '/repo-feat' });
    const removeCall = mocks.execFileSync.mock.calls.find(c =>
      Array.isArray(c[1]) && c[1].includes('remove') && c[1].includes('--force')
    );
    expect(removeCall).toBeDefined();
  });

  it('removes directory if it still exists after git', async () => {
    mocks.fs.existsSync.mockReturnValue(true);
    await mocks._handlers['git:remove-worktree'](ev, { repoPath: '/repo', worktreePath: '/repo-feat' });
    expect(mocks.fs.rmSync).toHaveBeenCalledWith('/repo-feat', { recursive: true, force: true });
  });

  it('returns success: true on success', async () => {
    const result = await mocks._handlers['git:remove-worktree'](ev, {
      repoPath: '/repo', worktreePath: '/repo-feat',
    });
    expect(result.success).toBe(true);
  });
});

describe('git:delete-branch', () => {
  beforeEach(() => mocks.execFileSync.mockClear().mockReturnValue(''));

  it('calls git branch -D', async () => {
    await mocks._handlers['git:delete-branch'](ev, { repoPath: '/repo', branch: 'feature/test' });
    expect(mocks.execFileSync).toHaveBeenCalledWith('git', ['branch', '-D', 'feature/test'], expect.any(Object));
  });

  it('returns success: false on error', async () => {
    mocks.execFileSync.mockReturnValue(null); // null.trimEnd() throws → handler catches → {success:false}
    expect((await mocks._handlers['git:delete-branch'](ev, { repoPath: '/repo', branch: 'bad' })).success).toBe(false);
  });
});

describe('git:current-branch', () => {
  beforeEach(() => mocks.execFileSync.mockClear().mockReturnValue(''));

  it('returns trimmed branch name', async () => {
    mocks.execFileSync.mockReturnValue('feature/test\n');
    expect(await mocks._handlers['git:current-branch'](ev, '/repo')).toBe('feature/test');
  });

  it('returns null on error', async () => {
    mocks.execFileSync.mockReturnValue(null); // null.trimEnd() throws → handler catches → null
    expect(await mocks._handlers['git:current-branch'](ev, '/tmp')).toBeNull();
  });
});

