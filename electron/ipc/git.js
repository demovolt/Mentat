'use strict';

const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const { parseWorktrees, parseWslPath, winToLinux, gitRun } = require('../helpers');
const { log } = require('../logger');

function register(ipcMain) {
  ipcMain.handle('git:detect-repo', (_e, dirPath) => {
    try {
      const wsl = parseWslPath(dirPath);
      const linuxRoot = gitRun(dirPath, ['rev-parse', '--show-toplevel']);
      return wsl ? winToLinux(wsl.distro, linuxRoot) : linuxRoot;
    } catch { return null; }
  });

  ipcMain.handle('git:get-branches', (_e, repoPath) => {
    try {
      return gitRun(repoPath, ['branch', '--format=%(refname:short)']).split('\n').filter(Boolean);
    } catch { return []; }
  });

  ipcMain.handle('git:get-worktrees', (_e, repoPath) => {
    try {
      const wsl = parseWslPath(repoPath);
      const wts = parseWorktrees(gitRun(repoPath, ['worktree', 'list', '--porcelain']));
      return wsl ? wts.map(wt => ({ ...wt, path: winToLinux(wsl.distro, wt.path) })) : wts;
    } catch { return []; }
  });

  ipcMain.handle('git:create-worktree', (_e, { repoPath, branch, baseBranch }) => {
    try {
      log('INFO', 'git:create-worktree', branch, 'from', baseBranch);
      const dirName = branch.replace(/\//g, '-').replace(/[^a-zA-Z0-9._-]/g, '_');
      const wsl = parseWslPath(repoPath);

      if (wsl) {
        const parentDir = wsl.linuxPath.replace(/\/[^/]+$/, '');
        const newLinuxPath = `${parentDir}/${dirName}`;
        gitRun(repoPath, ['worktree', 'add', '-b', branch, newLinuxPath, baseBranch]);
        try {
          execFileSync('wsl.exe', ['-d', wsl.distro, '--', 'bash', '-c',
            `mkdir -p "${newLinuxPath}/internalFolder" && ` +
            `GITDIR=$(git -C "${newLinuxPath}" rev-parse --git-dir) && ` +
            `mkdir -p "$GITDIR/info" && ` +
            `echo "internalFolder/" >> "$GITDIR/info/exclude"`
          ], { encoding: 'utf8', timeout: 5000 });
        } catch (e) {
          log('WARN', 'internalFolder setup failed:', e.message);
          console.error('[mentat] internalFolder setup failed:', e.message);
        }
        return { success: true };
      }

      const worktreePath = path.join(path.dirname(repoPath), dirName);
      gitRun(repoPath, ['worktree', 'add', '-b', branch, worktreePath, baseBranch]);
      try {
        fs.mkdirSync(path.join(worktreePath, 'internalFolder'), { recursive: true });
        const gitDir = gitRun(worktreePath, ['rev-parse', '--git-dir']);
        const absoluteGitDir = path.isAbsolute(gitDir) ? gitDir : path.resolve(worktreePath, gitDir);
        const infoDir = path.join(absoluteGitDir, 'info');
        fs.mkdirSync(infoDir, { recursive: true });
        fs.appendFileSync(path.join(infoDir, 'exclude'), '\ninternalFolder/\n');
      } catch (e) {
        log('WARN', 'internalFolder setup failed:', e.message);
        console.error('[mentat] internalFolder setup failed:', e.message);
      }
      return { success: true };
    } catch (e) {
      log('ERROR', 'git:create-worktree failed:', e.message);
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('git:remove-worktree', (_e, { repoPath, worktreePath }) => {
    try {
      log('INFO', 'git:remove-worktree', worktreePath);
      const wsl = parseWslPath(worktreePath);
      const target = wsl ? wsl.linuxPath : worktreePath;
      try { gitRun(repoPath, ['worktree', 'remove', '--force', target]); } catch {}
      if (fs.existsSync(worktreePath)) fs.rmSync(worktreePath, { recursive: true, force: true });
      return { success: true };
    } catch (e) {
      log('ERROR', 'git:remove-worktree failed:', e.message);
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('git:get-prunable-worktrees', (_e, repoPath) => {
    try {
      const wsl = parseWslPath(repoPath);
      try { gitRun(repoPath, ['fetch', '--prune']); } catch {}
      const goneBranches = new Set(
        gitRun(repoPath, ['branch', '-vv'])
          .split('\n')
          .filter(l => l.includes(': gone]'))
          .map(l => l.trim().replace(/^[*+]\s+/, '').split(/\s+/)[0])
      );
      const wts = parseWorktrees(gitRun(repoPath, ['worktree', 'list', '--porcelain']));
      const prunable = wts.slice(1).filter(wt => wt.branch && goneBranches.has(wt.branch));
      const result = wsl ? prunable.map(wt => ({ ...wt, path: winToLinux(wsl.distro, wt.path) })) : prunable;
      return { success: true, worktrees: result };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('git:delete-branch', (_e, { repoPath, branch }) => {
    try {
      gitRun(repoPath, ['branch', '-D', branch]);
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('git:current-branch', (_e, dirPath) => {
    try { return gitRun(dirPath, ['rev-parse', '--abbrev-ref', 'HEAD']); }
    catch { return null; }
  });

  ipcMain.handle('git:status', (_e, dirPath) => {
    try { return { success: true, output: gitRun(dirPath, ['status', '--porcelain']) }; }
    catch (e) { return { success: false, error: e.stderr || e.message }; }
  });

  ipcMain.handle('git:pull', (_e, dirPath, branch) => {
    try { return { success: true, output: gitRun(dirPath, ['pull', 'origin', branch]) }; }
    catch (e) { return { success: false, error: e.stderr || e.message }; }
  });

  ipcMain.handle('git:add', (_e, dirPath, files) => {
    try { return { success: true, output: gitRun(dirPath, ['add', '--', ...files]) }; }
    catch (e) { return { success: false, error: e.stderr || e.message }; }
  });

  ipcMain.handle('git:commit', (_e, dirPath, message) => {
    try { return { success: true, output: gitRun(dirPath, ['commit', '-m', message]) }; }
    catch (e) { return { success: false, error: e.stderr || e.message }; }
  });

  ipcMain.handle('git:push', (_e, dirPath, branch) => {
    try { return { success: true, output: gitRun(dirPath, ['push', '-u', 'origin', branch]) }; }
    catch (e) { return { success: false, error: e.stderr || e.message }; }
  });
}

module.exports = { register };
