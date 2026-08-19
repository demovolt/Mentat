'use strict';

const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const { isRunningInWSL } = require('./helpers');
const { log } = require('./logger');

function getShellProfiles() {
  if (process.platform === 'win32') {
    const profiles = [
      { id: 'powershell', name: 'PowerShell', cmd: 'powershell.exe', args: ['-NoLogo'] },
      { id: 'cmd', name: 'Command Prompt', cmd: 'cmd.exe', args: [] },
    ];
    try {
      execFileSync('pwsh.exe', ['--version'], { encoding: 'utf8', timeout: 5_000 });
      profiles.unshift({ id: 'pwsh', name: 'PowerShell 7', cmd: 'pwsh.exe', args: ['-NoLogo'] });
    } catch (e) { log('INFO', 'pwsh.exe not available:', e.message); }
    try {
      const out = execFileSync('wsl.exe', ['--list', '--quiet'], { encoding: 'utf16le' });
      out.split('\n').map(s => s.replace(/\0/g, '').trim()).filter(Boolean).forEach(distro => {
        profiles.push({ id: `wsl:${distro}`, name: `WSL (${distro})`, wsl: true, distro });
      });
    } catch (e) { log('INFO', 'WSL distro list failed:', e.message); }
    return profiles;
  }

  const seen = new Set();
  const profiles = [];
  for (const s of [process.env.SHELL, '/bin/bash', '/bin/zsh', '/usr/bin/zsh', '/bin/fish', '/bin/sh'].filter(Boolean)) {
    if (!seen.has(s) && fs.existsSync(s)) {
      seen.add(s);
      const name = path.basename(s);
      profiles.push({ id: name, name: name.charAt(0).toUpperCase() + name.slice(1), cmd: s, args: [] });
    }
  }

  if (isRunningInWSL()) {
    const winShells = [
      { id: 'powershell', name: 'PowerShell', cmd: '/mnt/c/WINDOWS/System32/WindowsPowerShell/v1.0/powershell.exe', args: ['-NoLogo'] },
      { id: 'cmd', name: 'Command Prompt', cmd: '/mnt/c/WINDOWS/System32/cmd.exe', args: [] },
    ];
    const pwshPaths = [
      '/mnt/c/Program Files/PowerShell/7/pwsh.exe',
      '/mnt/c/Program Files/PowerShell/7-preview/pwsh.exe',
    ];
    for (const p of pwshPaths) {
      if (fs.existsSync(p)) {
        winShells.unshift({ id: 'pwsh', name: 'PowerShell 7', cmd: p, args: ['-NoLogo'] });
        break;
      }
    }
    for (const s of winShells) {
      if (fs.existsSync(s.cmd)) profiles.push(s);
    }
  }

  return profiles;
}

module.exports = { getShellProfiles };
