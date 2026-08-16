'use strict';

const cp = require('child_process');
const fs = require('fs');
const os = require('os');

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
      { encoding: 'utf8', timeout: 10_000 }
    ).trimEnd();
  }
  return cp.execFileSync('git', args, { cwd, encoding: 'utf8', timeout: 10_000 }).trimEnd();
}

// Windows host IP as seen from a WSL distro (for Win Electron + WSL terminal)
function getWslHostIp(distro) {
  if (process.platform !== 'win32') return null;
  try {
    const ps = `(Get-NetIPAddress -AddressFamily IPv4 | Where-Object {$_.InterfaceAlias -like '*WSL*'} | Select-Object -First 1).IPAddress`;
    const out = cp.execFileSync('powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', ps],
      { encoding: 'utf8', timeout: 5000 });
    const ip = out.trim();
    if (ip && /^\d+\.\d+\.\d+\.\d+$/.test(ip)) return ip;
  } catch {}
  try {
    const args = distro
      ? ['-d', distro, '--', 'bash', '-c', 'ip -4 route show default 2>/dev/null | head -1']
      : ['--', 'bash', '-c', 'ip -4 route show default 2>/dev/null | head -1'];
    const out = cp.execFileSync('wsl.exe', args, { encoding: 'utf8', timeout: 5000 });
    const m = out.match(/via\s+(\d+\.\d+\.\d+\.\d+)/);
    if (m) return m[1];
  } catch {}
  return null;
}

// WSL's own IP as seen from Windows (for Linux Electron + Windows shell)
function getOwnLinuxIp() {
  if (process.platform === 'win32') return null;
  for (const ifaces of Object.values(os.networkInterfaces())) {
    const ipv4 = ifaces.find(i => i.family === 'IPv4' && !i.internal);
    if (ipv4) return ipv4.address;
  }
  return null;
}

// Adds Windows Firewall inbound rule for port 27182 (silent if no elevation)
function ensureFirewallRule() {
  if (process.platform !== 'win32') return;
  try {
    cp.execFileSync('netsh', ['advfirewall', 'firewall', 'show', 'rule', 'name=Mentat Status API'],
      { stdio: 'pipe' });
  } catch {
    try {
      cp.execFileSync('netsh', ['advfirewall', 'firewall', 'add', 'rule',
        'name=Mentat Status API', 'dir=in', 'action=allow', 'protocol=TCP', 'localport=27182'],
        { stdio: 'pipe' });
    } catch {}
  }
}

module.exports = {
  parseWorktrees, parseWslPath, winToLinux, isRunningInWSL, gitRun,
  getWslHostIp, getOwnLinuxIp, ensureFirewallRule,
};
