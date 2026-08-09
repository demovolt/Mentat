'use strict';

const { contextBridge, ipcRenderer, clipboard } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // Config
  getConfig: () => ipcRenderer.invoke('config:get'),
  saveConfig: (cfg) => ipcRenderer.invoke('config:save', cfg),
  getState: () => ipcRenderer.invoke('state:get'),
  saveState: (state) => ipcRenderer.invoke('state:save', state),
  getShellProfiles: () => ipcRenderer.invoke('shell:get-profiles'),

  // Dialog
  openFolder: () => ipcRenderer.invoke('dialog:open-folder'),

  // Git
  detectRepo: (p) => ipcRenderer.invoke('git:detect-repo', p),
  getBranches: (p) => ipcRenderer.invoke('git:get-branches', p),
  getWorktrees: (p) => ipcRenderer.invoke('git:get-worktrees', p),
  createWorktree: (opts) => ipcRenderer.invoke('git:create-worktree', opts),
  removeWorktree: (opts) => ipcRenderer.invoke('git:remove-worktree', opts),
  getPrunableWorktrees: (p) => ipcRenderer.invoke('git:get-prunable-worktrees', p),
  deleteBranch: (opts)  => ipcRenderer.invoke('git:delete-branch', opts),
  gitCurrentBranch: (p) => ipcRenderer.invoke('git:current-branch', p),
  gitStatus:        (p) => ipcRenderer.invoke('git:status', p),
  gitPull:          (p, branch) => ipcRenderer.invoke('git:pull', p, branch),
  gitAdd:           (p, files)  => ipcRenderer.invoke('git:add', p, files),
  gitCommit:        (p, msg)    => ipcRenderer.invoke('git:commit', p, msg),
  gitPush:          (p, branch) => ipcRenderer.invoke('git:push', p, branch),

  // PTY
  createTerminal: (termId, worktreePath, shellId) =>
    ipcRenderer.send('pty:create', { termId, worktreePath, shellId }),
  writeTerminal: (termId, data) =>
    ipcRenderer.send('pty:write', { termId, data }),
  resizeTerminal: (termId, cols, rows) =>
    ipcRenderer.send('pty:resize', { termId, cols, rows }),
  closeTerminal: (termId) =>
    ipcRenderer.send('pty:close', { termId }),
  onTerminalData: (cb) => {
    const handler = (_e, payload) => cb(payload);
    ipcRenderer.on('pty:data', handler);
    return () => ipcRenderer.removeListener('pty:data', handler);
  },
  onWorktreeStatus: (cb) => {
    const handler = (_e, payload) => cb(payload);
    ipcRenderer.on('worktree:status-changed', handler);
    return () => ipcRenderer.removeListener('worktree:status-changed', handler);
  },

  // Clipboard (synchronous Electron API — navigator.clipboard is unreliable in renderer)
  clipboardRead: () => clipboard.readText(),
  clipboardWrite: (text) => clipboard.writeText(text),

  // Window
  minimize: () => ipcRenderer.send('window:minimize'),
  toggleMaximize: () => ipcRenderer.send('window:toggle-maximize'),
  close: () => ipcRenderer.send('window:close'),
});
