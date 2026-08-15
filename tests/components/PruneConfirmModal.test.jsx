import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import PruneConfirmModal from '../../src/components/PruneConfirmModal.jsx';

const sampleWorktrees = [
  { path: '/repo/feature-old', branch: 'refs/heads/feature/old' },
  { path: '/repo/feature-gone', branch: 'feature/gone' },
];

function renderModal(props = {}) {
  const defaults = {
    worktrees: sampleWorktrees,
    onConfirm: vi.fn(),
    onClose: vi.fn(),
  };
  return render(<PruneConfirmModal {...defaults} {...props} />);
}

describe('PruneConfirmModal', () => {
  it('renders list of worktrees to prune', () => {
    renderModal();
    // branch names should appear (refs/heads/ stripped)
    expect(screen.getByText('feature/old')).toBeInTheDocument();
    expect(screen.getByText('feature/gone')).toBeInTheDocument();
  });

  it('strips refs/heads/ prefix from branch display', () => {
    renderModal();
    expect(screen.queryByText('refs/heads/feature/old')).not.toBeInTheDocument();
    expect(screen.getByText('feature/old')).toBeInTheDocument();
  });

  it('shows correct count in delete button', () => {
    renderModal();
    expect(screen.getByText(`Удалить (${sampleWorktrees.length})`)).toBeInTheDocument();
  });

  it('calls onConfirm when delete button is clicked', async () => {
    const onConfirm = vi.fn();
    const user = userEvent.setup();
    renderModal({ onConfirm });
    await user.click(screen.getByText(`Удалить (${sampleWorktrees.length})`));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when cancel button is clicked', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    renderModal({ onClose });
    await user.click(screen.getByText('Отмена'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when Escape is pressed', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    renderModal({ onClose });
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when backdrop is clicked', () => {
    const onClose = vi.fn();
    renderModal({ onClose });
    const backdrop = document.querySelector('.fixed');
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not call onClose when modal content is clicked', () => {
    const onClose = vi.fn();
    renderModal({ onClose });
    fireEvent.click(screen.getByText('Удалить воркфри смёрженных веток').closest('div'));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('uses path as label when branch is null', () => {
    renderModal({
      worktrees: [{ path: '/repo/no-branch', branch: null }],
    });
    expect(screen.getByText('/repo/no-branch')).toBeInTheDocument();
  });
});
