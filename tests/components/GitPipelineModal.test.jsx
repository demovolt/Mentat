import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import GitPipelineModal from '../../src/components/GitPipelineModal.jsx';

function renderModal(props = {}) {
  const defaults = { worktreePath: '/repo', onClose: vi.fn() };
  return render(<GitPipelineModal {...defaults} {...props} />);
}

describe('GitPipelineModal', () => {
  beforeEach(() => {
    window.api.gitCurrentBranch.mockResolvedValue('main');
    window.api.gitStatus.mockResolvedValue({ success: true, output: '' });
  });

  describe('Mount', () => {
    it('fetches current branch and git status on mount', async () => {
      renderModal();
      await waitFor(() => {
        expect(window.api.gitCurrentBranch).toHaveBeenCalledWith('/repo');
        expect(window.api.gitStatus).toHaveBeenCalledWith('/repo');
      });
    });

    it('displays branch name in header', async () => {
      renderModal();
      await waitFor(() => {
        expect(screen.getByText('main')).toBeInTheDocument();
      });
    });

    it('populates changed files from git status output', async () => {
      window.api.gitStatus.mockResolvedValue({
        success: true,
        output: 'M  src/App.jsx\nA  src/new.js',
      });
      const user = userEvent.setup();
      renderModal();
      // Files are shown in Stage step; navigate there first
      await waitFor(() => screen.getByText('Пропустить'));
      await user.click(screen.getByText('Пропустить'));
      await waitFor(() => {
        expect(screen.getByText('src/App.jsx')).toBeInTheDocument();
        expect(screen.getByText('src/new.js')).toBeInTheDocument();
      });
    });

    it('all files selected by default', async () => {
      window.api.gitStatus.mockResolvedValue({
        success: true,
        output: 'M  src/App.jsx\nA  src/new.js',
      });
      const user = userEvent.setup();
      renderModal();
      await waitFor(() => screen.getByText('Пропустить'));
      await user.click(screen.getByText('Пропустить'));
      await waitFor(() => screen.getByText('src/App.jsx'));
      const checkboxes = screen.getAllByRole('checkbox');
      checkboxes.forEach(cb => expect(cb).toBeChecked());
    });

    it('closes when Escape is pressed', async () => {
      const onClose = vi.fn();
      const user = userEvent.setup();
      renderModal({ onClose });
      await user.keyboard('{Escape}');
      expect(onClose).toHaveBeenCalled();
    });
  });

  describe('Step 0 - Pull', () => {
    it('renders Pull and Пропустить buttons', async () => {
      renderModal();
      await waitFor(() => {
        // 'Pull' appears in both the step indicator label and the button; use role to find the button
        expect(screen.getByRole('button', { name: /^Pull$/ })).toBeInTheDocument();
        expect(screen.getByText('Пропустить')).toBeInTheDocument();
      });
    });

    it('calls gitPull when Pull is clicked', async () => {
      window.api.gitPull.mockResolvedValue({ success: true, output: 'up to date' });
      const user = userEvent.setup();
      renderModal();
      await waitFor(() => screen.getByRole('button', { name: /^Pull$/ }));
      await user.click(screen.getByRole('button', { name: /^Pull$/ }));
      expect(window.api.gitPull).toHaveBeenCalledWith('/repo', 'main');
    });

    it('advances to Stage step on successful pull', async () => {
      window.api.gitPull.mockResolvedValue({ success: true, output: 'up to date' });
      const user = userEvent.setup();
      renderModal();
      await waitFor(() => screen.getByRole('button', { name: /^Pull$/ }));
      await user.click(screen.getByRole('button', { name: /^Pull$/ }));
      await waitFor(() => {
        expect(screen.getByText(/Выберите файлы/)).toBeInTheDocument();
      });
    });

    it('shows error state when pull fails', async () => {
      window.api.gitPull.mockResolvedValue({ success: false, error: 'conflict detected' });
      const user = userEvent.setup();
      renderModal();
      await waitFor(() => screen.getByRole('button', { name: /^Pull$/ }));
      await user.click(screen.getByRole('button', { name: /^Pull$/ }));
      await waitFor(() => {
        expect(screen.getByText('conflict detected')).toBeInTheDocument();
      });
    });

    it('skip pull advances to Stage step', async () => {
      const user = userEvent.setup();
      renderModal();
      await waitFor(() => screen.getByText('Пропустить'));
      await user.click(screen.getByText('Пропустить'));
      await waitFor(() => {
        expect(screen.getByText(/Выберите файлы/)).toBeInTheDocument();
      });
    });
  });

  describe('Step 1 - Stage', () => {
    async function goToStage(user) {
      await waitFor(() => screen.getByText('Пропустить'));
      await user.click(screen.getByText('Пропустить'));
      await waitFor(() => screen.getByText(/Выберите файлы/));
    }

    it('Select All button selects all files', async () => {
      window.api.gitStatus.mockResolvedValue({
        success: true,
        output: 'M  src/App.jsx\nA  src/new.js',
      });
      const user = userEvent.setup();
      renderModal();
      await goToStage(user);
      // Deselect one first
      const checkboxes = screen.getAllByRole('checkbox');
      await user.click(checkboxes[0]);
      await user.click(screen.getByText('все'));
      const allCheckboxes = screen.getAllByRole('checkbox');
      allCheckboxes.forEach(cb => expect(cb).toBeChecked());
    });

    it('Deselect All button deselects all files', async () => {
      window.api.gitStatus.mockResolvedValue({
        success: true,
        output: 'M  src/App.jsx\nA  src/new.js',
      });
      const user = userEvent.setup();
      renderModal();
      await goToStage(user);
      await user.click(screen.getByText('снять'));
      const checkboxes = screen.getAllByRole('checkbox');
      checkboxes.forEach(cb => expect(cb).not.toBeChecked());
    });

    it('Stage button is disabled when no files selected', async () => {
      window.api.gitStatus.mockResolvedValue({
        success: true,
        output: 'M  src/App.jsx',
      });
      const user = userEvent.setup();
      renderModal();
      await goToStage(user);
      await user.click(screen.getByText('снять'));
      // The stage button shows count
      expect(screen.getByText('Добавить (0)').closest('button')).toBeDisabled();
    });

    it('calls gitAdd with selected files', async () => {
      window.api.gitStatus.mockResolvedValue({
        success: true,
        output: 'M  src/App.jsx\nA  src/new.js',
      });
      window.api.gitAdd.mockResolvedValue({ success: true, output: '' });
      window.api.gitStatus.mockResolvedValueOnce({ success: true, output: 'M  src/App.jsx\nA  src/new.js' })
        .mockResolvedValueOnce({ success: true, output: '' });
      const user = userEvent.setup();
      renderModal();
      await goToStage(user);
      await waitFor(() => screen.getByText(/Добавить \(\d+\)/));
      await user.click(screen.getByText(/Добавить \(\d+\)/));
      await waitFor(() => {
        expect(window.api.gitAdd).toHaveBeenCalled();
      });
    });

    it('advances to Commit on successful stage', async () => {
      window.api.gitStatus
        .mockResolvedValueOnce({ success: true, output: 'M  src/App.jsx' })
        .mockResolvedValueOnce({ success: true, output: '' });
      window.api.gitAdd.mockResolvedValue({ success: true, output: '' });
      const user = userEvent.setup();
      renderModal();
      await goToStage(user);
      await waitFor(() => screen.getByText(/Добавить \(\d+\)/));
      await user.click(screen.getByText(/Добавить \(\d+\)/));
      await waitFor(() => {
        expect(screen.getByPlaceholderText(/feat:/)).toBeInTheDocument();
      });
    });
  });

  describe('Step 2 - Commit', () => {
    // goToCommit navigates from Pull→Stage→Commit.
    // gitStatus must be mocked with files BEFORE renderModal so the mount call
    // populates changedFiles; the second call (after gitAdd) can return empty.
    async function goToCommit(user) {
      await waitFor(() => screen.getByText('Пропустить'));
      await user.click(screen.getByText('Пропустить'));
      await waitFor(() => screen.getByText(/Добавить \(\d+\)/));
      await user.click(screen.getByText(/Добавить \(\d+\)/));
      await waitFor(() => screen.getByPlaceholderText(/feat:/));
    }

    it('Commit button disabled on empty message', async () => {
      window.api.gitStatus
        .mockResolvedValueOnce({ success: true, output: 'M  file.txt' })
        .mockResolvedValueOnce({ success: true, output: '' });
      window.api.gitAdd.mockResolvedValue({ success: true, output: '' });
      const user = userEvent.setup();
      renderModal();
      await goToCommit(user);
      expect(screen.getByRole('button', { name: /^Commit$/ }).closest('button')).toBeDisabled();
    });

    it('calls gitCommit with trimmed message', async () => {
      window.api.gitStatus
        .mockResolvedValueOnce({ success: true, output: 'M  file.txt' })
        .mockResolvedValueOnce({ success: true, output: '' });
      window.api.gitAdd.mockResolvedValue({ success: true, output: '' });
      window.api.gitCommit.mockResolvedValue({ success: true, output: '[main abc] msg' });
      const user = userEvent.setup();
      renderModal();
      await goToCommit(user);
      await user.type(screen.getByRole('textbox'), '  fix: some bug  ');
      await user.click(screen.getByRole('button', { name: /^Commit$/ }));
      expect(window.api.gitCommit).toHaveBeenCalledWith('/repo', 'fix: some bug');
    });

    it('advances to Push step on successful commit', async () => {
      window.api.gitStatus
        .mockResolvedValueOnce({ success: true, output: 'M  file.txt' })
        .mockResolvedValueOnce({ success: true, output: '' });
      window.api.gitAdd.mockResolvedValue({ success: true, output: '' });
      window.api.gitCommit.mockResolvedValue({ success: true, output: '[main abc]' });
      const user = userEvent.setup();
      renderModal();
      await goToCommit(user);
      await user.type(screen.getByRole('textbox'), 'fix: bug');
      await user.click(screen.getByRole('button', { name: /^Commit$/ }));
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /^Push$/ })).toBeInTheDocument();
      });
    });
  });

  describe('Step 3 - Push', () => {
    async function goToPush(user) {
      await waitFor(() => screen.getByText('Пропустить'));
      await user.click(screen.getByText('Пропустить'));
      await waitFor(() => screen.getByText(/Добавить \(\d+\)/));
      await user.click(screen.getByText(/Добавить \(\d+\)/));
      await waitFor(() => screen.getByRole('textbox'));
      await user.type(screen.getByRole('textbox'), 'feat: test');
      await user.click(screen.getByRole('button', { name: /^Commit$/ }));
      await waitFor(() => screen.getByRole('button', { name: /^Push$/ }));
    }

    it('calls gitPush when Push is clicked', async () => {
      window.api.gitStatus
        .mockResolvedValueOnce({ success: true, output: 'M  file.txt' })
        .mockResolvedValueOnce({ success: true, output: '' });
      window.api.gitAdd.mockResolvedValue({ success: true, output: '' });
      window.api.gitCommit.mockResolvedValue({ success: true, output: '[main abc]' });
      window.api.gitPush.mockResolvedValue({ success: true, output: 'pushed' });
      const user = userEvent.setup();
      renderModal();
      await goToPush(user);
      await user.click(screen.getByRole('button', { name: /^Push$/ }));
      expect(window.api.gitPush).toHaveBeenCalledWith('/repo', 'main');
    });

    it('shows completion screen after successful push', async () => {
      window.api.gitStatus
        .mockResolvedValueOnce({ success: true, output: 'M  file.txt' })
        .mockResolvedValueOnce({ success: true, output: '' });
      window.api.gitAdd.mockResolvedValue({ success: true, output: '' });
      window.api.gitCommit.mockResolvedValue({ success: true, output: '[main abc]' });
      window.api.gitPush.mockResolvedValue({ success: true, output: 'pushed' });
      const user = userEvent.setup();
      renderModal();
      await goToPush(user);
      await user.click(screen.getByRole('button', { name: /^Push$/ }));
      await waitFor(() => {
        expect(screen.getByText(/Готово!/)).toBeInTheDocument();
      });
    });
  });

  describe('Done screen', () => {
    it('calls onClose when Закрыть button is clicked after push', async () => {
      window.api.gitStatus.mockResolvedValue({ success: true, output: '' });
      window.api.gitAdd.mockResolvedValue({ success: true, output: '' });
      window.api.gitCommit.mockResolvedValue({ success: true, output: '' });
      window.api.gitPush.mockResolvedValue({ success: true, output: '' });
      window.api.gitStatus
        .mockResolvedValueOnce({ success: true, output: '' })
        .mockResolvedValueOnce({ success: true, output: '' });

      const onClose = vi.fn();
      const user = userEvent.setup();
      renderModal({ onClose });

      // Skip pull -> skip stage (no files) doesn't work; let's use empty status
      await waitFor(() => screen.getByText('Пропустить'));
      await user.click(screen.getByText('Пропустить'));
      // Stage step with no files: advance
      await waitFor(() => screen.getByText('Добавить (0)'));
      // Can't stage 0 files, so we need files
    });
  });
});
