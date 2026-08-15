import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import Sidebar from '../../src/components/Sidebar.jsx';

const sampleRepo = { path: '/home/user/myrepo' };
const sampleWorktrees = [
  { path: '/home/user/myrepo', branch: 'main', head: 'abc1234' },
  { path: '/home/user/myrepo-feat', branch: 'feature/test', head: 'def5678' },
];

function renderSidebar(props = {}) {
  const defaults = {
    workspace: [],
    worktreesMap: {},
    activePath: null,
    onAddRepo: vi.fn(),
    onRemoveRepo: vi.fn(),
    onSelectWorktree: vi.fn(),
    onRemoveWorktree: vi.fn(),
    onDeleteBranch: vi.fn(),
    onRemoveBoth: vi.fn(),
    onRenameWorktree: vi.fn(),
    onNewWorktree: vi.fn(),
    terminals: [],
    terminalStatuses: {},
    terminalSessionActive: {},
    worktreeNames: {},
  };
  return render(<Sidebar {...defaults} {...props} />);
}

describe('Sidebar', () => {
  describe('Empty state', () => {
    it('shows empty state message when workspace is empty', () => {
      renderSidebar();
      expect(screen.getByText(/Add a repository/)).toBeInTheDocument();
    });
  });

  describe('RepoSection', () => {
    it('renders repo section for each workspace entry', () => {
      renderSidebar({
        workspace: [sampleRepo],
        worktreesMap: { [sampleRepo.path]: sampleWorktrees },
      });
      expect(screen.getByText('myrepo')).toBeInTheDocument();
    });

    it('shows last path segment as repo name', () => {
      renderSidebar({
        workspace: [{ path: '/some/deep/project/myapp' }],
        worktreesMap: {},
      });
      expect(screen.getByText('myapp')).toBeInTheDocument();
    });

    it('shows worktrees by default (expanded)', () => {
      renderSidebar({
        workspace: [sampleRepo],
        worktreesMap: { [sampleRepo.path]: sampleWorktrees },
      });
      expect(screen.getByText('feature/test')).toBeInTheDocument();
    });

    it('collapses worktree list when header is clicked', async () => {
      const user = userEvent.setup();
      renderSidebar({
        workspace: [sampleRepo],
        worktreesMap: { [sampleRepo.path]: sampleWorktrees },
      });
      await user.click(screen.getByText('myrepo'));
      await waitFor(() => {
        expect(screen.queryByText('feature/test')).not.toBeInTheDocument();
      });
    });

    it('shows + button on hover and calls onNewWorktree', async () => {
      const onNewWorktree = vi.fn();
      const user = userEvent.setup();
      const { container } = renderSidebar({
        workspace: [sampleRepo],
        worktreesMap: { [sampleRepo.path]: sampleWorktrees },
        onNewWorktree,
      });
      const header = screen.getByText('myrepo').closest('div[class*="flex"]');
      await user.hover(header);
      await waitFor(() => screen.getByTitle('New Worktree'));
      await user.click(screen.getByTitle('New Worktree'));
      expect(onNewWorktree).toHaveBeenCalledWith(sampleRepo.path);
    });
  });

  describe('WorktreeItem', () => {
    it('shows custom name when worktreeNames has entry', () => {
      renderSidebar({
        workspace: [sampleRepo],
        worktreesMap: { [sampleRepo.path]: sampleWorktrees },
        worktreeNames: { [sampleWorktrees[0].path]: 'My Custom Name' },
      });
      expect(screen.getByText('My Custom Name')).toBeInTheDocument();
    });

    it('shows folder name from path when no custom name', () => {
      renderSidebar({
        workspace: [sampleRepo],
        worktreesMap: { [sampleRepo.path]: sampleWorktrees },
      });
      // First worktree path is /home/user/myrepo -> folder name 'myrepo'
      // But the repo section already uses 'myrepo', so this tests the second worktree
      expect(screen.getByText('myrepo-feat')).toBeInTheDocument();
    });

    it('shows branch name', () => {
      renderSidebar({
        workspace: [sampleRepo],
        worktreesMap: { [sampleRepo.path]: sampleWorktrees },
      });
      expect(screen.getByText('feature/test')).toBeInTheDocument();
    });

    it('clicking worktree calls onSelectWorktree', async () => {
      const onSelectWorktree = vi.fn();
      const user = userEvent.setup();
      renderSidebar({
        workspace: [sampleRepo],
        worktreesMap: { [sampleRepo.path]: sampleWorktrees },
        onSelectWorktree,
      });
      await user.click(screen.getByText('myrepo-feat'));
      expect(onSelectWorktree).toHaveBeenCalledWith(sampleWorktrees[1]);
    });

    it('active worktree has distinct styling', () => {
      const { container } = renderSidebar({
        workspace: [sampleRepo],
        worktreesMap: { [sampleRepo.path]: sampleWorktrees },
        activePath: sampleWorktrees[1].path,
      });
      const activeItem = screen.getByText('myrepo-feat').closest('[class*="border"]');
      expect(activeItem.className).toContain('bg-[#1a1130]');
    });

    it('shows StatusDot when sessionActive is true', () => {
      const termId = 'term-1';
      renderSidebar({
        workspace: [sampleRepo],
        worktreesMap: { [sampleRepo.path]: [sampleWorktrees[1]] },
        terminals: [{ id: termId, worktreePath: sampleWorktrees[1].path, label: 'Claude 1', type: 'ai' }],
        terminalSessionActive: { [termId]: true },
        terminalStatuses: { [termId]: 'working' },
      });
      expect(screen.getByText('Working')).toBeInTheDocument();
    });

    it('StatusDot shows green for working status', () => {
      const termId = 'term-2';
      const { container } = renderSidebar({
        workspace: [sampleRepo],
        worktreesMap: { [sampleRepo.path]: [sampleWorktrees[1]] },
        terminals: [{ id: termId, worktreePath: sampleWorktrees[1].path }],
        terminalSessionActive: { [termId]: true },
        terminalStatuses: { [termId]: 'working' },
      });
      const dot = container.querySelector('.bg-green-500');
      expect(dot).toBeInTheDocument();
    });

    it('StatusDot shows blue for thinking status', () => {
      const termId = 'term-3';
      const { container } = renderSidebar({
        workspace: [sampleRepo],
        worktreesMap: { [sampleRepo.path]: [sampleWorktrees[1]] },
        terminals: [{ id: termId, worktreePath: sampleWorktrees[1].path }],
        terminalSessionActive: { [termId]: true },
        terminalStatuses: { [termId]: 'thinking' },
      });
      const dot = container.querySelector('.bg-blue-500');
      expect(dot).toBeInTheDocument();
    });

    it('StatusDot shows yellow for waiting status', () => {
      const termId = 'term-4';
      const { container } = renderSidebar({
        workspace: [sampleRepo],
        worktreesMap: { [sampleRepo.path]: [sampleWorktrees[1]] },
        terminals: [{ id: termId, worktreePath: sampleWorktrees[1].path }],
        terminalSessionActive: { [termId]: true },
        terminalStatuses: { [termId]: 'waiting' },
      });
      const dot = container.querySelector('.bg-yellow-400');
      expect(dot).toBeInTheDocument();
    });

    it('shows Idle for null status when session active', () => {
      const termId = 'term-5';
      renderSidebar({
        workspace: [sampleRepo],
        worktreesMap: { [sampleRepo.path]: [sampleWorktrees[1]] },
        terminals: [{ id: termId, worktreePath: sampleWorktrees[1].path }],
        terminalSessionActive: { [termId]: true },
        terminalStatuses: { [termId]: null },
      });
      expect(screen.getByText('Idle')).toBeInTheDocument();
    });

    describe('Context menu', () => {
      it('opens dropdown on three-dot button click', async () => {
        const user = userEvent.setup();
        renderSidebar({
          workspace: [sampleRepo],
          worktreesMap: { [sampleRepo.path]: sampleWorktrees },
        });
        const item = screen.getByText('myrepo-feat').closest('[class*="relative"]');
        await user.hover(item);
        await waitFor(() => screen.getByText('•••'));
        await user.click(screen.getByText('•••'));
        await waitFor(() => {
          expect(screen.getByText('Rename')).toBeInTheDocument();
          expect(screen.getByText('Удалить')).toBeInTheDocument();
        });
      });

      it('clicking Rename enters inline rename mode', async () => {
        const user = userEvent.setup();
        renderSidebar({
          workspace: [sampleRepo],
          worktreesMap: { [sampleRepo.path]: sampleWorktrees },
        });
        const item = screen.getByText('myrepo-feat').closest('[class*="relative"]');
        await user.hover(item);
        await waitFor(() => screen.getByText('•••'));
        await user.click(screen.getByText('•••'));
        await waitFor(() => screen.getByText('Rename'));
        await user.click(screen.getByText('Rename'));
        expect(screen.getByRole('textbox')).toBeInTheDocument();
      });

      it('Enter commits rename and calls onRenameWorktree', async () => {
        const onRenameWorktree = vi.fn();
        const user = userEvent.setup();
        renderSidebar({
          workspace: [sampleRepo],
          worktreesMap: { [sampleRepo.path]: sampleWorktrees },
          onRenameWorktree,
        });
        const item = screen.getByText('myrepo-feat').closest('[class*="relative"]');
        await user.hover(item);
        await waitFor(() => screen.getByText('•••'));
        await user.click(screen.getByText('•••'));
        await waitFor(() => screen.getByText('Rename'));
        await user.click(screen.getByText('Rename'));
        const input = screen.getByRole('textbox');
        await user.clear(input);
        await user.type(input, 'My Feature{Enter}');
        expect(onRenameWorktree).toHaveBeenCalledWith(sampleWorktrees[1].path, 'My Feature');
      });

      it('Escape cancels rename without calling onRenameWorktree', async () => {
        const onRenameWorktree = vi.fn();
        const user = userEvent.setup();
        renderSidebar({
          workspace: [sampleRepo],
          worktreesMap: { [sampleRepo.path]: sampleWorktrees },
          onRenameWorktree,
        });
        const item = screen.getByText('myrepo-feat').closest('[class*="relative"]');
        await user.hover(item);
        await waitFor(() => screen.getByText('•••'));
        await user.click(screen.getByText('•••'));
        await waitFor(() => screen.getByText('Rename'));
        await user.click(screen.getByText('Rename'));
        await user.keyboard('{Escape}');
        expect(onRenameWorktree).not.toHaveBeenCalled();
        expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
      });
    });
  });
});
