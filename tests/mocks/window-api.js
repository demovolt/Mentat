import { vi } from 'vitest';

export function makeApiMock() {
  return {
    // Config & State
    getConfig: vi.fn().mockResolvedValue({ workspace: [], aiCommand: 'claude', settings: null }),
    saveConfig: vi.fn().mockResolvedValue(undefined),
    getState: vi.fn().mockResolvedValue(null),
    saveState: vi.fn().mockResolvedValue(undefined),
    getShellProfiles: vi.fn().mockResolvedValue([]),

    // Dialog
    openFolder: vi.fn().mockResolvedValue(null),

    // Git
    detectRepo: vi.fn().mockResolvedValue(null),
    getBranches: vi.fn().mockResolvedValue([]),
    getWorktrees: vi.fn().mockResolvedValue([]),
    createWorktree: vi.fn().mockResolvedValue({ success: true }),
    removeWorktree: vi.fn().mockResolvedValue({ success: true }),
    getPrunableWorktrees: vi.fn().mockResolvedValue({ success: true, worktrees: [] }),
    deleteBranch: vi.fn().mockResolvedValue({ success: true }),
    gitCurrentBranch: vi.fn().mockResolvedValue('main'),
    gitStatus: vi.fn().mockResolvedValue({ success: true, output: '' }),
    gitPull: vi.fn().mockResolvedValue({ success: true, output: 'Already up to date.' }),
    gitAdd: vi.fn().mockResolvedValue({ success: true, output: '' }),
    gitCommit: vi.fn().mockResolvedValue({ success: true, output: '[main abc1234] test' }),
    gitPush: vi.fn().mockResolvedValue({ success: true, output: 'Branch pushed.' }),

    // PTY
    createTerminal: vi.fn(),
    writeTerminal: vi.fn(),
    resizeTerminal: vi.fn(),
    closeTerminal: vi.fn(),
    onTerminalData: vi.fn(() => vi.fn()),
    onWorktreeStatus: vi.fn(() => vi.fn()),
    onWorktreeAgent: vi.fn(() => vi.fn()),
    onTerminalExited: vi.fn(() => vi.fn()),
    onSessionIdUpdated: vi.fn(() => vi.fn()),

    // Clipboard
    clipboardRead: vi.fn(() => ''),
    clipboardWrite: vi.fn(),

    // Window
    minimize: vi.fn(),
    toggleMaximize: vi.fn(),
    close: vi.fn(),

    // Logging
    setLoggingEnabled: vi.fn().mockResolvedValue(undefined),
    getLogPath: vi.fn().mockResolvedValue('/tmp/mentat.log'),
    logError: vi.fn(),

    // Connection
    checkConnection: vi.fn().mockResolvedValue({ scripts: [], serverRunning: false }),
    sendTestStatus: vi.fn().mockResolvedValue({ ok: true }),
  };
}
