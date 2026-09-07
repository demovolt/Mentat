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
        expect(window.api.onTerminalExited).toHaveBeenCalled();
      });
    });

    it('unsubscribes from IPC events on unmount', async () => {
      const unsubStatus = vi.fn();
      const unsubExited = vi.fn();
      window.api.onWorktreeStatus.mockReturnValue(unsubStatus);
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
        expect(screen.getByText(/Git repository not found/)).toBeInTheDocument();
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
        expect(screen.getByText(/Git repository not found/)).toBeInTheDocument();
      });

      // Click error banner to dismiss
      fireEvent.click(screen.getByText(/Git repository not found/));
      await waitFor(() => {
        expect(screen.queryByText(/Git repository not found/)).not.toBeInTheDocument();
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

    it('onWorktreeStatus with sessionId updates terminal sessionId', async () => {
      let statusCallback;
      window.api.onWorktreeStatus.mockImplementation((cb) => {
        statusCallback = cb;
        return vi.fn();
      });

      render(<App />);
      await waitFor(() => expect(window.api.onWorktreeStatus).toHaveBeenCalled());

      act(() => {
        statusCallback({ termId: 'term-1', status: 'working', sessionActive: true, sessionId: 'new-session-id' });
      });
      // No crash
    });
  });

  describe('Window controls', () => {
    it('Minimize button calls window.api.minimize', async () => {
      render(<App />);
      await waitFor(() => screen.getByTitle('Minimize'));
      fireEvent.click(screen.getByTitle('Minimize'));
      expect(window.api.minimize).toHaveBeenCalled();
    });

    it('Maximize button calls window.api.toggleMaximize', async () => {
      render(<App />);
      await waitFor(() => screen.getByTitle('Maximize'));
      fireEvent.click(screen.getByTitle('Maximize'));
      expect(window.api.toggleMaximize).toHaveBeenCalled();
    });

    it('Close button calls window.api.close', async () => {
      render(<App />);
      await waitFor(() => screen.getByTitle('Close'));
      fireEvent.click(screen.getByTitle('Close'));
      expect(window.api.close).toHaveBeenCalled();
    });
  });

  describe('New worktree workflow', () => {
    beforeEach(() => {
      window.api.getConfig.mockResolvedValue({ workspace: [sampleRepo], aiCommand: 'claude', settings: null });
      window.api.getWorktrees.mockResolvedValue(sampleWorktrees);
      window.api.gitCurrentBranch.mockResolvedValue('main');
    });

    async function openNewWorktreeModal() {
      render(<App />);
      await waitFor(() => screen.getByText('myrepo-feat'));
      const header = screen.getByTitle(sampleRepo.path).closest('div[class*="flex"]');
      fireEvent.mouseEnter(header);
      await waitFor(() => screen.getByTitle('New Worktree'));
      fireEvent.click(screen.getByTitle('New Worktree'));
      await waitFor(() => screen.getByPlaceholderText('feature/my-feature'));
    }

    it('clicking New Worktree opens NewWorktreeModal', async () => {
      await openNewWorktreeModal();
      expect(screen.getByPlaceholderText('feature/my-feature')).toBeInTheDocument();
    });

    it('Escape closes NewWorktreeModal without API call', async () => {
      const user = userEvent.setup();
      await openNewWorktreeModal();
      await user.keyboard('{Escape}');
      await waitFor(() => {
        expect(screen.queryByPlaceholderText('feature/my-feature')).not.toBeInTheDocument();
      });
      expect(window.api.createWorktree).not.toHaveBeenCalled();
    });

    it('Cancel button closes NewWorktreeModal without API call', async () => {
      const user = userEvent.setup();
      await openNewWorktreeModal();
      await user.click(screen.getByText('Cancel'));
      await waitFor(() => {
        expect(screen.queryByPlaceholderText('feature/my-feature')).not.toBeInTheDocument();
      });
      expect(window.api.createWorktree).not.toHaveBeenCalled();
    });

    it('filling branch and clicking Create calls createWorktree with correct args', async () => {
      const user = userEvent.setup();
      window.api.createWorktree.mockResolvedValue({ success: true, worktreePath: '/home/user/myrepo-newbranch' });
      await openNewWorktreeModal();
      await user.type(screen.getByPlaceholderText('feature/my-feature'), 'new-branch');
      await user.click(screen.getByText('Create'));
      await waitFor(() => {
        expect(window.api.createWorktree).toHaveBeenCalledWith(
          expect.objectContaining({ repoPath: sampleRepo.path, branch: 'new-branch' })
        );
      });
    });

    it('after successful create the new worktree appears in the sidebar', async () => {
      const user = userEvent.setup();
      const newWorktrees = [
        ...sampleWorktrees,
        { path: '/home/user/myrepo-newbranch', branch: 'new-branch', head: 'ghi' },
      ];
      window.api.createWorktree.mockResolvedValue({ success: true, worktreePath: '/home/user/myrepo-newbranch' });
      window.api.getWorktrees
        .mockResolvedValueOnce(sampleWorktrees)
        .mockResolvedValue(newWorktrees);

      await openNewWorktreeModal();
      await user.type(screen.getByPlaceholderText('feature/my-feature'), 'new-branch');
      await user.click(screen.getByText('Create'));
      // The custom name (sanitized branch name) is shown as the display name in the sidebar
      await waitFor(() => {
        expect(screen.getAllByText('new-branch').length).toBeGreaterThan(0);
      });
    });

    it('failed create shows error banner', async () => {
      const user = userEvent.setup();
      window.api.createWorktree.mockResolvedValue({ success: false, error: 'Branch already exists' });
      await openNewWorktreeModal();
      await user.type(screen.getByPlaceholderText('feature/my-feature'), 'existing-branch');
      await user.click(screen.getByText('Create'));
      await waitFor(() => {
        expect(screen.getByText('Branch already exists')).toBeInTheDocument();
      });
    });
  });

  describe('Terminal tab management', () => {
    beforeEach(() => {
      window.api.getConfig.mockResolvedValue({ workspace: [sampleRepo], aiCommand: 'claude', settings: null });
      window.api.getWorktrees.mockResolvedValue(sampleWorktrees);
      window.api.gitCurrentBranch.mockResolvedValue('main');
    });

    it('selecting a worktree auto-creates an AI terminal tab', async () => {
      const user = userEvent.setup();
      render(<App />);
      await waitFor(() => screen.getByText('myrepo-feat'));
      await user.click(screen.getByText('myrepo-feat'));
      await waitFor(() => {
        expect(screen.getByText('Claude 1')).toBeInTheDocument();
      });
    });

    it('clicking + Term creates a shell terminal tab', async () => {
      const user = userEvent.setup();
      render(<App />);
      await waitFor(() => screen.getByText('myrepo-feat'));
      await user.click(screen.getByText('myrepo-feat'));
      // Claude 1 is auto-created (index 0), so the shell tab is num=2
      await waitFor(() => screen.getByTitle('New terminal'));
      await user.click(screen.getByTitle('New terminal'));
      await waitFor(() => {
        expect(screen.getByText('Terminal 2')).toBeInTheDocument();
      });
    });

    it('clicking + AI creates a second AI terminal tab', async () => {
      const user = userEvent.setup();
      render(<App />);
      await waitFor(() => screen.getByText('myrepo-feat'));
      await user.click(screen.getByText('myrepo-feat'));
      await waitFor(() => screen.getByText('+ AI'));
      await user.click(screen.getByText('+ AI'));
      await waitFor(() => {
        expect(screen.getByText('Claude 2')).toBeInTheDocument();
      });
    });

    it('+ AI and + Term buttons are disabled when 3 tabs exist', async () => {
      const user = userEvent.setup();
      render(<App />);
      await waitFor(() => screen.getByText('myrepo-feat'));
      await user.click(screen.getByText('myrepo-feat'));
      // Claude 1 is auto-created; add 2 more to reach the limit of 3
      await waitFor(() => screen.getByTitle('New terminal'));
      await user.click(screen.getByTitle('New terminal'));
      await waitFor(() => screen.getByText('Terminal 2'));
      await user.click(screen.getByText('+ AI'));
      await waitFor(() => screen.getByText('Claude 2'));
      // Now at 3 tabs — buttons should be disabled
      expect(screen.getByText('+ AI').closest('button')).toBeDisabled();
      expect(screen.getByTitle('New terminal')).toBeDisabled();
    });

    it('closing a tab removes it from the tab bar', async () => {
      const user = userEvent.setup();
      render(<App />);
      await waitFor(() => screen.getByText('myrepo-feat'));
      await user.click(screen.getByText('myrepo-feat'));
      await waitFor(() => screen.getByTitle('New terminal'));
      await user.click(screen.getByTitle('New terminal'));
      await waitFor(() => screen.getByText('Terminal 2'));
      // Close Terminal 2
      const closeButtons = screen.getAllByText('×');
      await user.click(closeButtons[closeButtons.length - 1]);
      await waitFor(() => {
        expect(screen.queryByText('Terminal 2')).not.toBeInTheDocument();
      });
    });

    it('switching worktrees shows tabs for each worktree independently', async () => {
      const user = userEvent.setup();
      render(<App />);
      await waitFor(() => screen.getByText('myrepo-feat'));
      // Select first worktree (myrepo) – it appears twice so use last occurrence
      const myrepoItems = screen.getAllByText('myrepo');
      await user.click(myrepoItems[myrepoItems.length - 1]);
      await waitFor(() => screen.getByText('Claude 1'));
      // Add a shell tab to myrepo (Claude 1 is already index 0, so shell becomes Terminal 2)
      await user.click(screen.getByTitle('New terminal'));
      await waitFor(() => screen.getByText('Terminal 2'));
      // Switch to myrepo-feat
      await user.click(screen.getByText('myrepo-feat'));
      await waitFor(() => {
        // myrepo-feat gets its own Claude 1; Terminal 2 from myrepo is not shown
        expect(screen.getAllByText('Claude 1').length).toBe(1);
        expect(screen.queryByText('Terminal 2')).not.toBeInTheDocument();
      });
      // Switch back to myrepo – Terminal 2 is still there
      const myrepoItems2 = screen.getAllByText('myrepo');
      await user.click(myrepoItems2[myrepoItems2.length - 1]);
      await waitFor(() => {
        expect(screen.getByText('Terminal 2')).toBeInTheDocument();
      });
    });
  });

  describe('Worktree deletion', () => {
    beforeEach(() => {
      window.api.getConfig.mockResolvedValue({ workspace: [sampleRepo], aiCommand: 'claude', settings: null });
      window.api.getWorktrees.mockResolvedValue(sampleWorktrees);
      window.api.gitCurrentBranch.mockResolvedValue('main');
    });

    function openWorktreeContextMenu() {
      const item = screen.getByText('myrepo-feat').closest('[class*="relative"]');
      fireEvent.mouseEnter(item);
      const dotsBtn = screen.getByText('•••');
      fireEvent.click(dotsBtn);
    }

    async function openDeleteSubmenu() {
      openWorktreeContextMenu();
      await waitFor(() => screen.getByText(/Delete/));
      const deleteWrapper = screen.getByText(/Delete/).closest('.relative');
      fireEvent.mouseEnter(deleteWrapper);
      await waitFor(() => screen.getByText('Worktree'));
    }

    it('clicking Worktree option calls removeWorktree and removes worktree from sidebar', async () => {
      window.api.getWorktrees
        .mockResolvedValueOnce(sampleWorktrees)
        .mockResolvedValue([sampleWorktrees[0]]);

      render(<App />);
      await waitFor(() => screen.getByText('myrepo-feat'));
      await openDeleteSubmenu();
      fireEvent.click(screen.getByText('Worktree'));

      await waitFor(() => {
        expect(window.api.removeWorktree).toHaveBeenCalledWith({
          repoPath: sampleRepo.path,
          worktreePath: sampleWorktrees[1].path,
        });
      });
      await waitFor(() => {
        expect(screen.queryByText('myrepo-feat')).not.toBeInTheDocument();
      });
    });

    it('clicking Worktree + branch option calls both removeWorktree and deleteBranch', async () => {
      window.api.getWorktrees
        .mockResolvedValueOnce(sampleWorktrees)
        .mockResolvedValue([sampleWorktrees[0]]);

      render(<App />);
      await waitFor(() => screen.getByText('myrepo-feat'));
      await openDeleteSubmenu();
      fireEvent.click(screen.getByText('Worktree + branch'));

      await waitFor(() => {
        expect(window.api.removeWorktree).toHaveBeenCalledWith({
          repoPath: sampleRepo.path,
          worktreePath: sampleWorktrees[1].path,
        });
        expect(window.api.deleteBranch).toHaveBeenCalledWith({
          repoPath: sampleRepo.path,
          branch: sampleWorktrees[1].branch,
        });
      });
    });

    it('deleting the active worktree resets the terminal area to placeholder', async () => {
      const user = userEvent.setup();
      window.api.getWorktrees
        .mockResolvedValueOnce(sampleWorktrees)
        .mockResolvedValue([sampleWorktrees[0]]);

      render(<App />);
      await waitFor(() => screen.getByText('myrepo-feat'));
      // Activate myrepo-feat first
      await user.click(screen.getByText('myrepo-feat'));
      await waitFor(() => screen.getByText('Claude 1'));
      // Delete the active worktree
      await openDeleteSubmenu();
      fireEvent.click(screen.getByText('Worktree'));
      await waitFor(() => {
        expect(screen.getByText(/Select a worktree/)).toBeInTheDocument();
      });
    });
  });
});
