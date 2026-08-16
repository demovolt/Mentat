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

describe('git:status', () => {
  beforeEach(() => mocks.execFileSync.mockClear().mockReturnValue(''));

  it('returns success with porcelain output', async () => {
    mocks.execFileSync.mockReturnValue('M  src/App.jsx\n');
    expect(await mocks._handlers['git:status'](ev, '/repo')).toEqual({
      success: true, output: 'M  src/App.jsx',
    });
  });

  it('returns success: false on error', async () => {
    mocks.execFileSync.mockReturnValue(null); // null.trimEnd() throws → handler catches → {success:false}
    expect((await mocks._handlers['git:status'](ev, '/repo')).success).toBe(false);
  });
});

describe('git:pull', () => {
  beforeEach(() => mocks.execFileSync.mockClear().mockReturnValue(''));

  it('returns success with output', async () => {
    mocks.execFileSync.mockReturnValue('Already up to date.');
    const result = await mocks._handlers['git:pull'](ev, '/repo', 'main');
    expect(result.success).toBe(true);
    expect(result.output).toBe('Already up to date.');
  });

  it('passes branch as argument', async () => {
    mocks.execFileSync.mockReturnValue('');
    await mocks._handlers['git:pull'](ev, '/repo', 'feature/test');
    expect(mocks.execFileSync).toHaveBeenCalledWith(
      'git', ['pull', 'origin', 'feature/test'], expect.any(Object)
    );
  });

  it('returns success: false on error', async () => {
    mocks.execFileSync.mockReturnValue(null); // null.trimEnd() throws → handler catches → {success:false}
    expect((await mocks._handlers['git:pull'](ev, '/repo', 'main')).success).toBe(false);
  });
});

describe('git:add', () => {
  beforeEach(() => mocks.execFileSync.mockClear().mockReturnValue(''));

  it('passes files list with -- separator', async () => {
    await mocks._handlers['git:add'](ev, '/repo', ['src/App.jsx', 'src/index.js']);
    expect(mocks.execFileSync).toHaveBeenCalledWith(
      'git', ['add', '--', 'src/App.jsx', 'src/index.js'], expect.any(Object)
    );
  });

  it('returns success: false on error', async () => {
    mocks.execFileSync.mockReturnValue(null); // null.trimEnd() throws → handler catches → {success:false}
    expect((await mocks._handlers['git:add'](ev, '/repo', ['file.txt'])).success).toBe(false);
  });
});

describe('git:commit', () => {
  beforeEach(() => mocks.execFileSync.mockClear().mockReturnValue(''));

  it('passes commit message with -m', async () => {
    mocks.execFileSync.mockReturnValue('[main abc] test commit');
    await mocks._handlers['git:commit'](ev, '/repo', 'test commit');
    expect(mocks.execFileSync).toHaveBeenCalledWith(
      'git', ['commit', '-m', 'test commit'], expect.any(Object)
    );
  });

  it('returns success: false on error', async () => {
    mocks.execFileSync.mockReturnValue(null); // null.trimEnd() throws → handler catches → {success:false}
    expect((await mocks._handlers['git:commit'](ev, '/repo', 'msg')).success).toBe(false);
  });
});

describe('git:push', () => {
  beforeEach(() => mocks.execFileSync.mockClear().mockReturnValue(''));

  it('calls push -u origin branch', async () => {
    mocks.execFileSync.mockReturnValue('Branch pushed.');
    await mocks._handlers['git:push'](ev, '/repo', 'feature/test');
    expect(mocks.execFileSync).toHaveBeenCalledWith(
      'git', ['push', '-u', 'origin', 'feature/test'], expect.any(Object)
    );
  });

  it('returns success: false on error', async () => {
    mocks.execFileSync.mockReturnValue(null); // null.trimEnd() throws → handler catches → {success:false}
    expect((await mocks._handlers['git:push'](ev, '/repo', 'main')).success).toBe(false);
  });
});

describe('git:get-prunable-worktrees', () => {
  beforeEach(() => mocks.execFileSync.mockClear().mockReturnValue(''));

  it('identifies worktrees with gone branches', async () => {
    const branchVv = [
      '* main                  abc1234 [origin/main] Latest',
      '  feature/old-gone      def5678 [origin/feature/old-gone: gone] Old',
    ].join('\n');
    const worktreeList = [
      'worktree /repo', 'HEAD abc1234', 'branch refs/heads/main', '',
      'worktree /repo-old-gone', 'HEAD def5678', 'branch refs/heads/feature/old-gone', '',
    ].join('\n');

    let callCount = 0;
    mocks.execFileSync.mockImplementation(() => {
      callCount++;
      if (callCount === 1) return ''; // fetch --prune
      if (callCount === 2) return branchVv; // branch -vv
      return worktreeList; // worktree list
    });

    const result = await mocks._handlers['git:get-prunable-worktrees'](ev, '/repo');
    expect(result.success).toBe(true);
    expect(result.worktrees).toHaveLength(1);
    expect(result.worktrees[0].branch).toBe('feature/old-gone');
  });

  it('excludes main worktree (first entry) even if gone', async () => {
    let callCount = 0;
    mocks.execFileSync.mockImplementation(() => {
      callCount++;
      if (callCount === 1) return '';
      if (callCount === 2) return '* main abc [origin/main: gone] msg';
      return 'worktree /repo\nHEAD abc1234\nbranch refs/heads/main\n\n';
    });

    const result = await mocks._handlers['git:get-prunable-worktrees'](ev, '/repo');
    expect(result.worktrees).toHaveLength(0);
  });
});
