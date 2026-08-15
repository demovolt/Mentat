import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import { createRequire } from 'module';

// Use CJS require to get mutable module objects (ESM namespace is non-configurable)
const _require = createRequire(import.meta.url);
const _cp = _require('child_process');
const _fs = _require('fs');

let parseWorktrees, parseWslPath, winToLinux, gitRun, isRunningInWSL;
let execFileSyncSpy, readFileSyncSpy;

beforeAll(async () => {
  // Load helpers.js fresh so it picks up the same _cp and _fs references
  const helperPath = _require.resolve('../../../electron/helpers.js');
  delete _require.cache[helperPath];
  const mod = _require('../../../electron/helpers.js');
  parseWorktrees = mod.parseWorktrees;
  parseWslPath = mod.parseWslPath;
  winToLinux = mod.winToLinux;
  gitRun = mod.gitRun;
  isRunningInWSL = mod.isRunningInWSL;

  // Spy on CJS module exports (configurable, unlike ESM namespace)
  execFileSyncSpy = vi.spyOn(_cp, 'execFileSync');
  readFileSyncSpy = vi.spyOn(_fs, 'readFileSync');
});

afterEach(() => {
  execFileSyncSpy?.mockReset();
  readFileSyncSpy?.mockReset();
});

describe('parseWorktrees', () => {
  it('parses a single worktree block', () => {
    const output = 'worktree /home/user/repo\nHEAD abc1234\nbranch refs/heads/main\n\n';
    const result = parseWorktrees(output);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ path: '/home/user/repo', head: 'abc1234', branch: 'main' });
  });

  it('handles detached HEAD', () => {
    expect(parseWorktrees('worktree /repo\nHEAD abc\ndetached\n\n')[0].branch).toBe('(detached)');
  });

  it('parses multiple worktree blocks', () => {
    const output = [
      'worktree /home/user/repo', 'HEAD abc1234', 'branch refs/heads/main', '',
      'worktree /home/user/repo-feat', 'HEAD def5678', 'branch refs/heads/feature/test', '',
    ].join('\n');
    const result = parseWorktrees(output);
    expect(result).toHaveLength(2);
    expect(result[0].branch).toBe('main');
    expect(result[1].branch).toBe('feature/test');
  });

  it('strips refs/heads/ prefix from branch', () => {
    const output = 'worktree /repo\nHEAD abc\nbranch refs/heads/feature/my-feat\n\n';
    expect(parseWorktrees(output)[0].branch).toBe('feature/my-feat');
  });

  it('returns empty array for empty input', () => {
    expect(parseWorktrees('')).toEqual([]);
  });

  it('skips blocks without worktree line', () => {
    expect(parseWorktrees('HEAD abc1234\nbranch refs/heads/main\n\n')).toEqual([]);
  });
});

describe('parseWslPath', () => {
  const originalPlatform = process.platform;
  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: originalPlatform });
  });

  it('returns null on linux', () => {
    Object.defineProperty(process, 'platform', { value: 'linux' });
    expect(parseWslPath('\\\\wsl.localhost\\Ubuntu\\home\\user')).toBeNull();
  });

  it('parses \\\\wsl.localhost\\Ubuntu\\home\\user on win32', () => {
    Object.defineProperty(process, 'platform', { value: 'win32' });
    expect(parseWslPath('\\\\wsl.localhost\\Ubuntu\\home\\user')).toEqual({
      distro: 'Ubuntu', linuxPath: '/home/user',
    });
  });

  it('parses \\\\wsl$\\Ubuntu\\home on win32', () => {
    Object.defineProperty(process, 'platform', { value: 'win32' });
    expect(parseWslPath('\\\\wsl$\\Ubuntu\\home')).toEqual({
      distro: 'Ubuntu', linuxPath: '/home',
    });
  });

  it('returns null for regular Windows path', () => {
    Object.defineProperty(process, 'platform', { value: 'win32' });
    expect(parseWslPath('C:\\Users\\foo')).toBeNull();
  });

  it('returns null for null input', () => {
    Object.defineProperty(process, 'platform', { value: 'win32' });
    expect(parseWslPath(null)).toBeNull();
  });

  it('handles path with only root', () => {
    Object.defineProperty(process, 'platform', { value: 'win32' });
    expect(parseWslPath('\\\\wsl.localhost\\Ubuntu')).toEqual({
      distro: 'Ubuntu', linuxPath: '/',
    });
  });
});

describe('winToLinux', () => {
  it('converts distro and linux path to UNC format', () => {
    expect(winToLinux('Ubuntu', '/home/user/repo')).toBe('\\\\wsl.localhost\\Ubuntu\\home\\user\\repo');
  });

  it('handles root path', () => {
    expect(winToLinux('Debian', '/')).toBe('\\\\wsl.localhost\\Debian\\');
  });
});

describe('isRunningInWSL', () => {
  const originalPlatform = process.platform;
  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: originalPlatform });
  });

  it('returns false on win32', () => {
    Object.defineProperty(process, 'platform', { value: 'win32' });
    expect(isRunningInWSL()).toBe(false);
  });

  it('returns true when /proc/version contains microsoft', () => {
    Object.defineProperty(process, 'platform', { value: 'linux' });
    readFileSyncSpy.mockReturnValue('Linux version 5.15.0-microsoft-standard-WSL2');
    expect(isRunningInWSL()).toBe(true);
  });

  it('returns false when /proc/version does not contain microsoft', () => {
    Object.defineProperty(process, 'platform', { value: 'linux' });
    readFileSyncSpy.mockReturnValue('Linux version 5.15.0-generic');
    expect(isRunningInWSL()).toBe(false);
  });

  it('returns false when /proc/version read fails', () => {
    Object.defineProperty(process, 'platform', { value: 'linux' });
    readFileSyncSpy.mockImplementation(() => { throw new Error('ENOENT'); });
    expect(isRunningInWSL()).toBe(false);
  });
});

describe('gitRun', () => {
  const originalPlatform = process.platform;
  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: originalPlatform });
  });

  it('calls git directly for normal paths on linux', () => {
    Object.defineProperty(process, 'platform', { value: 'linux' });
    execFileSyncSpy.mockReturnValue('main\n');
    const result = gitRun('/home/user/repo', ['rev-parse', '--abbrev-ref', 'HEAD']);
    expect(execFileSyncSpy).toHaveBeenCalledWith('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
      cwd: '/home/user/repo', encoding: 'utf8',
    });
    expect(result).toBe('main');
  });

  it('calls wsl.exe for UNC WSL paths on win32', () => {
    Object.defineProperty(process, 'platform', { value: 'win32' });
    execFileSyncSpy.mockReturnValue('main\n');
    gitRun('\\\\wsl.localhost\\Ubuntu\\home\\user\\repo', ['branch']);
    expect(execFileSyncSpy).toHaveBeenCalledWith(
      'wsl.exe',
      ['-d', 'Ubuntu', '--cd', '/home/user/repo', 'git', 'branch'],
      { encoding: 'utf8' }
    );
  });

  it('trims trailing whitespace from output', () => {
    Object.defineProperty(process, 'platform', { value: 'linux' });
    execFileSyncSpy.mockReturnValue('  main  \n');
    expect(gitRun('/repo', ['rev-parse', '--abbrev-ref', 'HEAD'])).toBe('  main');
  });
});
