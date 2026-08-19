import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import NewWorktreeModal from '../../src/components/NewWorktreeModal.jsx';

function renderModal(props = {}) {
  const defaults = { onCreate: vi.fn(), onClose: vi.fn() };
  return render(<NewWorktreeModal {...defaults} {...props} />);
}

describe('NewWorktreeModal', () => {
  it('renders the modal with Branch name input', () => {
    renderModal();
    expect(screen.getByPlaceholderText('feature/my-feature')).toBeInTheDocument();
  });

  it('Create button is disabled when input is empty', () => {
    renderModal();
    expect(screen.getByText('Create').closest('button')).toBeDisabled();
  });

  it('Create button is disabled when input is only whitespace', async () => {
    const user = userEvent.setup();
    renderModal();
    await user.type(screen.getByPlaceholderText('feature/my-feature'), '   ');
    expect(screen.getByText('Create').closest('button')).toBeDisabled();
  });

  it('Create button is enabled when input has content', async () => {
    const user = userEvent.setup();
    renderModal();
    await user.type(screen.getByPlaceholderText('feature/my-feature'), 'my-branch');
    expect(screen.getByText('Create').closest('button')).not.toBeDisabled();
  });

  it('calls onCreate with trimmed branch name on form submit', async () => {
    const onCreate = vi.fn();
    const user = userEvent.setup();
    renderModal({ onCreate });
    await user.type(screen.getByPlaceholderText('feature/my-feature'), '  my-branch  ');
    await user.click(screen.getByText('Create'));
    expect(onCreate).toHaveBeenCalledWith({ branch: 'my-branch', worktreeName: 'my-branch', customName: 'my-branch' });
  });

  it('calls onCreate when Enter is pressed with non-empty input', async () => {
    const onCreate = vi.fn();
    const user = userEvent.setup();
    renderModal({ onCreate });
    await user.type(screen.getByPlaceholderText('feature/my-feature'), 'feature/test{Enter}');
    expect(onCreate).toHaveBeenCalledWith({ branch: 'feature/test', worktreeName: 'feature-test', customName: 'feature-test' });
  });

  it('does not call onCreate when Enter is pressed with empty input', async () => {
    const onCreate = vi.fn();
    const user = userEvent.setup();
    renderModal({ onCreate });
    await user.type(screen.getByPlaceholderText('feature/my-feature'), '{Enter}');
    expect(onCreate).not.toHaveBeenCalled();
  });

  it('calls onClose when Cancel button is clicked', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    renderModal({ onClose });
    await user.click(screen.getByText('Cancel'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when Escape key is pressed', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    renderModal({ onClose });
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when backdrop is clicked', async () => {
    const onClose = vi.fn();
    renderModal({ onClose });
    // Click the backdrop (the fixed overlay, not the modal content)
    const backdrop = screen.getByText('New Worktree').closest('[class*="fixed"]') ||
      document.querySelector('[class*="fixed"]');
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not call onClose when modal content is clicked', async () => {
    const onClose = vi.fn();
    renderModal({ onClose });
    fireEvent.click(screen.getByText('New Worktree').closest('div'));
    expect(onClose).not.toHaveBeenCalled();
  });
});
