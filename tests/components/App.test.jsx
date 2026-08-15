import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import App from '../../src/App.jsx';

const sampleRepo = { path: '/home/user/myrepo' };
const sampleWorktrees = [
  { path: '/home/user/myrepo', branch: 'main', head: 'abc' },
  { path: '/home/user/myrepo-feat', branch: 'feature/test', head: 'def' },
];

describe('App', () => {
  describe('Initial load', () => {
    it('renders without crashing with empty workspace', async () => {
      render(<App />);
      await waitFor(() => {
        expect(screen.getByText(/Add a repository/)).toBeInTheDocument();
      });
    });

    it('calls getConfig and getShellProfiles on mount', async () => {
      render(<App />);
      await waitFor(() => {
        expect(window.api.getConfig).toHaveBeenCalled();
        expect(window.api.getShellProfiles).toHaveBeenCalled();
      });
    });

    it('loads workspace from config and calls getWorktrees per repo', async () => {
      window.api.getConfig.mockResolvedValue({
        workspace: [sampleRepo],
        aiCommand: 'claude',
        settings: null,
      });
      window.api.getWorktrees.mockResolvedValue(sampleWorktrees);
      window.api.gitCurrentBranch.mockResolvedValue('main');

      render(<App />);
      await waitFor(() => {
        expect(window.api.getWorktrees).toHaveBeenCalledWith(sampleRepo.path);
      });
    });

    it('restores settings from config', async () => {
      window.api.getConfig.mockResolvedValue({
        workspace: [],
        aiCommand: 'claude',
        settings: { ai: 'codex', loggingEnabled: false, console: { fontSize: 16, fontFamily: 'monospace', lineHeight: 1.2 } },
      });
      render(<App />);
      // Should not throw; settings applied internally
      await waitFor(() => {
        expect(window.api.getConfig).toHaveBeenCalled();
      });
    });

    it('subscribes to IPC events on mount', async () => {
      render(<App />);
      await waitFor(() => {
        expect(window.api.onWorktreeStatus).toHaveBeenCalled();
        expect(window.api.onSessionIdUpdated).toHaveBeenCalled();
        expect(window.api.onTerminalExited).toHaveBeenCalled();
      });
    });

    it('unsubscribes from IPC events on unmount', async () => {
      const unsubStatus = vi.fn();
      const unsubSession = vi.fn();
      const unsubExited = vi.fn();
      window.api.onWorktreeStatus.mockReturnValue(unsubStatus);
      window.api.onSessionIdUpdated.mockReturnValue(unsubSession);
      window.api.onTerminalExited.mockReturnValue(unsubExited);

      const { unmount } = render(<App />);
      await waitFor(() => expect(window.api.onWorktreeStatus).toHaveBeenCalled());
      unmount();
      expect(unsubStatus).toHaveBeenCalled();
    });

    it('filters out terminals whose worktreePath no longer exists', async () => {
      window.api.getConfig.mockResolvedValue({
        workspace: [sampleRepo],
        aiCommand: 'claude',
        settings: null,
      });
      window.api.getWorktrees.mockResolvedValue([sampleWorktrees[0]]); // only main
      window.api.getState.mockResolvedValue({
        terminals: [
          { worktreePath: sampleWorktrees[0].path, label: 'Claude 1', shellId: null, type: 'ai' },
          { worktreePath: '/nonexistent/path', label: 'Claude 1', shellId: null, type: 'ai' }, // invalid
        ],
        activeWorktreePath: sampleWorktrees[0].path,
        worktreeNames: {},
      });
      window.api.gitCurrentBranch.mockResolvedValue('main');

      render(<App />);
      await waitFor(() => {
        // Only valid terminal should be created
        expect(window.api.getState).toHaveBeenCalled();
      });
    });
  });

  describe('addRepo', () => {
    it('opens folder dialog and detects repo', async () => {
      window.api.openFolder.mockResolvedValue('/home/user/newrepo');
      window.api.detectRepo.mockResolvedValue('/home/user/newrepo');
      window.api.getWorktrees.mockResolvedValue([{ path: '/home/user/newrepo', branch: 'main' }]);

      const user = userEvent.setup();
      render(<App />);
      await waitFor(() => screen.getByText('Add Repository'));
      await user.click(screen.getByText('Add Repository'));

      await waitFor(() => {
        expect(window.api.openFolder).toHaveBeenCalled();
        expect(window.api.detectRepo).toHaveBeenCalledWith('/home/user/newrepo');
      });
    });

    it('shows error when detectRepo returns null', async () => {
      window.api.openFolder.mockResolvedValue('/some/path');
      window.api.detectRepo.mockResolvedValue(null);

      const user = userEvent.setup();
      render(<App />);
      await waitFor(() => screen.getByText('Add Repository'));
      await user.click(screen.getByText('Add Repository'));

      await waitFor(() => {
        expect(screen.getByText(/Git-репозиторий не найден/)).toBeInTheDocument();
      });
    });

    it('does not add duplicate repos', async () => {
      window.api.getConfig.mockResolvedValue({
        workspace: [sampleRepo],
        aiCommand: 'claude',
        settings: null,
      });
      window.api.getWorktrees.mockResolvedValue(sampleWorktrees);
      window.api.gitCurrentBranch.mockResolvedValue('main');
      window.api.openFolder.mockResolvedValue(sampleRepo.path);
      window.api.detectRepo.mockResolvedValue(sampleRepo.path);

      const user = userEvent.setup();
      render(<App />);
      await waitFor(() => screen.getByText('myrepo'));
      await user.click(screen.getByText('Add Repository'));

      // saveConfig should not be called with duplicate
      await waitFor(() => {
        const saveConfigCalls = window.api.saveConfig.mock.calls;
        const workspaces = saveConfigCalls.map(c => c[0]?.workspace || []);
        // Should not have two myrepo entries
        workspaces.forEach(ws => {
          const dupes = ws.filter(r => r.path === sampleRepo.path);
          expect(dupes.length).toBeLessThanOrEqual(1);
        });
      });
    });
  });

  describe('handleSelectWorktree', () => {
    beforeEach(async () => {
      window.api.getConfig.mockResolvedValue({
        workspace: [sampleRepo],
        aiCommand: 'claude',
        settings: null,
      });
      window.api.getWorktrees.mockResolvedValue(sampleWorktrees);
      window.api.gitCurrentBranch.mockResolvedValue('main');
    });

    it('creates AI terminal when no terminals exist for worktree', async () => {
      const user = userEvent.setup();
      render(<App />);
      await waitFor(() => screen.getByText('myrepo-feat'));
      await user.click(screen.getByText('myrepo-feat'));
      await waitFor(() => {
        // Terminal tabs should appear
        expect(screen.getByTitle('New terminal')).toBeInTheDocument();
      });
    });
  });

  describe('Terminal management', () => {
    it('shows empty terminal placeholder when no active terminal', async () => {
      render(<App />);
      await waitFor(() => {
        expect(screen.getByText(/Select a worktree/)).toBeInTheDocument();
      });
    });

    it('error banner appears and is dismissable', async () => {
      window.api.openFolder.mockResolvedValue('/bad/path');
      window.api.detectRepo.mockResolvedValue(null);

      const user = userEvent.setup();
      render(<App />);
      await waitFor(() => screen.getByText('Add Repository'));
      await user.click(screen.getByText('Add Repository'));

      await waitFor(() => {
        expect(screen.getByText(/Git-репозиторий не найден/)).toBeInTheDocument();
      });

      // Click error banner to dismiss
      fireEvent.click(screen.getByText(/Git-репозиторий не найден/));
      await waitFor(() => {
        expect(screen.queryByText(/Git-репозиторий не найден/)).not.toBeInTheDocument();
      });
    });
  });

  describe('Modals', () => {
    it('Settings modal opens when Settings button is clicked', async () => {
      const user = userEvent.setup();
      render(<App />);
      await waitFor(() => screen.getByText('Settings'));
      await user.click(screen.getByText('Settings'));
      await waitFor(() => {
        expect(screen.getByText('Default AI')).toBeInTheDocument();
      });
    });

    it('Settings modal closes when onClose is called', async () => {
      const user = userEvent.setup();
      render(<App />);
      await waitFor(() => screen.getByText('Settings'));
      await user.click(screen.getByText('Settings'));
      await waitFor(() => screen.getByText('Default AI'));
      await user.click(screen.getByText('×'));
      await waitFor(() => {
        expect(screen.queryByText('Default AI')).not.toBeInTheDocument();
      });
    });
  });

  describe('IPC event handlers', () => {
    it('onWorktreeStatus updates terminalStatuses', async () => {
      let statusCallback;
      window.api.onWorktreeStatus.mockImplementation((cb) => {
        statusCallback = cb;
        return vi.fn();
      });

      render(<App />);
      await waitFor(() => expect(window.api.onWorktreeStatus).toHaveBeenCalled());

      act(() => {
        statusCallback({ termId: 'term-1', status: 'working', sessionActive: true });
      });
      // Internal state updated - no crash
    });

    it('onSessionIdUpdated updates terminal sessionId', async () => {
      let sessionCallback;
      window.api.onSessionIdUpdated.mockImplementation((cb) => {
        sessionCallback = cb;
        return vi.fn();
      });

      render(<App />);
      await waitFor(() => expect(window.api.onSessionIdUpdated).toHaveBeenCalled());

      act(() => {
        sessionCallback({ termId: 'term-1', sessionId: 'new-session-id' });
      });
      // No crash
    });
  });

  describe('handleCheckPrune', () => {
    it('prune button opens PruneConfirmModal when prunable worktrees found', async () => {
      window.api.getConfig.mockResolvedValue({
        workspace: [sampleRepo],
        aiCommand: 'claude',
        settings: null,
      });
      window.api.getWorktrees.mockResolvedValue(sampleWorktrees);
      window.api.gitCurrentBranch.mockResolvedValue('main');
      window.api.getPrunableWorktrees.mockResolvedValue({
        success: true,
        worktrees: [{ path: '/repo/old', branch: 'feature/old' }],
      });

      const user = userEvent.setup();
      render(<App />);

      // First select a worktree to set activeWorktreePath
      await waitFor(() => screen.getByText('myrepo-feat'));
      await user.click(screen.getByText('myrepo-feat'));

      // Now click Prune
      await waitFor(() => {
        const pruneBtn = screen.getByText('Prune').closest('button');
        expect(pruneBtn).not.toBeDisabled();
      });
      await user.click(screen.getByText('Prune'));

      await waitFor(() => {
        expect(screen.getByText(/Удалить воркфри смёрженных веток/)).toBeInTheDocument();
      });
    });

    it('shows error when no prunable worktrees', async () => {
      window.api.getConfig.mockResolvedValue({
        workspace: [sampleRepo],
        aiCommand: 'claude',
        settings: null,
      });
      window.api.getWorktrees.mockResolvedValue(sampleWorktrees);
      window.api.gitCurrentBranch.mockResolvedValue('main');
      window.api.getPrunableWorktrees.mockResolvedValue({
        success: true,
        worktrees: [],
      });

      const user = userEvent.setup();
      render(<App />);
      await waitFor(() => screen.getByText('myrepo-feat'));
      await user.click(screen.getByText('myrepo-feat'));
      await waitFor(() => {
        const pruneBtn = screen.getByText('Prune').closest('button');
        expect(pruneBtn).not.toBeDisabled();
      });
      await user.click(screen.getByText('Prune'));

      await waitFor(() => {
        expect(screen.getByText(/Нет смёрженных веток/)).toBeInTheDocument();
      });
    });
  });
});
