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
    deleteBranch: vi.fn().mockResolvedValue({ success: true }),
    gitCurrentBranch: vi.fn().mockResolvedValue('main'),

    // PTY
    createTerminal: vi.fn(),
    writeTerminal: vi.fn(),
    resizeTerminal: vi.fn(),
    closeTerminal: vi.fn(),
    onTerminalData: vi.fn(() => vi.fn()),
    onWorktreeStatus: vi.fn(() => vi.fn()),
    onWorktreeAgent: vi.fn(() => vi.fn()),
    onWorktreeProcess: vi.fn(() => vi.fn()),
    onTerminalExited: vi.fn(() => vi.fn()),
    onSessionIdUpdated: vi.fn(() => vi.fn()),

    // Clipboard
    clipboardRead: vi.fn(() => Promise.resolve('')),
    clipboardWrite: vi.fn(),

    // Window
    minimize: vi.fn(),
    toggleMaximize: vi.fn(),
    close: vi.fn(),

    // Logging
    setLoggingEnabled: vi.fn().mockResolvedValue(undefined),
    getLogPath: vi.fn().mockResolvedValue('/tmp/mentat.log'),
    logError: vi.fn(),

    // App
    getVersion: vi.fn().mockResolvedValue('0.1.1'),

    // Connection
    checkConnection: vi.fn().mockResolvedValue({ scripts: [], serverRunning: false }),
    sendTestStatus: vi.fn().mockResolvedValue({ ok: true }),
    installHooks: vi.fn().mockResolvedValue({ ok: true, results: [] }),
  };
}
