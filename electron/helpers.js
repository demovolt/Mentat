'use strict';

const cp = require('child_process');
const fs = require('fs');

function parseWorktrees(output) {
  const result = [];
  for (const block of output.split('\n\n').filter(Boolean)) {
    const wt = {};
    for (const line of block.trim().split('\n')) {
      if (line.startsWith('worktree ')) wt.path = line.slice(9);
      else if (line.startsWith('branch ')) wt.branch = line.slice(7).replace('refs/heads/', '');
      else if (line === 'detached') wt.branch = '(detached)';
      else if (line.startsWith('HEAD ')) wt.head = line.slice(5);
    }
    if (wt.path) result.push(wt);
  }
  return result;
}

function parseWslPath(p) {
  if (!p || process.platform !== 'win32') return null;
  const m = p.replace(/\\/g, '/').match(/^\/\/(wsl\.localhost|wsl\$)\/([^/]+)(\/.*)?$/i);
  return m ? { distro: m[2], linuxPath: m[3] || '/' } : null;
}

function winToLinux(distro, linuxPath) {
  return `\\\\wsl.localhost\\${distro}${linuxPath.replace(/\//g, '\\')}`;
}

function isRunningInWSL() {
  try {
    return process.platform === 'linux' &&
      fs.readFileSync('/proc/version', 'utf8').toLowerCase().includes('microsoft');
  } catch { return false; }
}

function gitRun(cwd, args) {
  const wsl = parseWslPath(cwd);
  if (wsl) {
    return cp.execFileSync(
      'wsl.exe',
      ['-d', wsl.distro, '--cd', wsl.linuxPath, 'git', ...args],
      { encoding: 'utf8' }
    ).trimEnd();
  }
  return cp.execFileSync('git', args, { cwd, encoding: 'utf8' }).trimEnd();
}

module.exports = { parseWorktrees, parseWslPath, winToLinux, isRunningInWSL, gitRun };
