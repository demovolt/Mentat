import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import TitleBar from '../../src/components/TitleBar.jsx';

function renderBar(props = {}) {
  const defaults = {
    activeWorktreePath: null,
    onGit: vi.fn(),
    repoPath: null,
    onPrune: vi.fn(),
    isPruning: false,
    onAddRepo: vi.fn(),
    onSettings: vi.fn(),
  };
  return render(<TitleBar {...defaults} {...props} />);
}

describe('TitleBar', () => {
  it('renders the Mentat logo text', () => {
    renderBar();
    expect(screen.getByText('Mentat')).toBeInTheDocument();
  });

  it('renders Add Repository button', () => {
    renderBar();
    expect(screen.getByText('Add Repository')).toBeInTheDocument();
  });

  it('Add Repository button calls onAddRepo when clicked', () => {
    const onAddRepo = vi.fn();
    renderBar({ onAddRepo });
    fireEvent.click(screen.getByText('Add Repository'));
    expect(onAddRepo).toHaveBeenCalledTimes(1);
  });

  it('Git button is disabled when no activeWorktreePath', () => {
    renderBar({ activeWorktreePath: null });
    expect(screen.getByText('Git').closest('button')).toBeDisabled();
  });

  it('Git button is enabled when activeWorktreePath is set', () => {
    renderBar({ activeWorktreePath: '/repo/main' });
    expect(screen.getByText('Git').closest('button')).not.toBeDisabled();
  });

  it('Git button calls onGit when clicked', () => {
    const onGit = vi.fn();
    renderBar({ activeWorktreePath: '/repo', onGit });
    fireEvent.click(screen.getByText('Git'));
    expect(onGit).toHaveBeenCalledTimes(1);
  });

  it('Prune button is disabled when no repoPath', () => {
    renderBar({ repoPath: null });
    expect(screen.getByText('Prune').closest('button')).toBeDisabled();
  });

  it('Prune button is disabled when isPruning is true', () => {
    renderBar({ repoPath: '/repo', isPruning: true });
    const btn = screen.getByText('…').closest('button');
    expect(btn).toBeDisabled();
  });

  it('Prune button shows "…" text when isPruning', () => {
    renderBar({ repoPath: '/repo', isPruning: true });
    expect(screen.getByText('…')).toBeInTheDocument();
  });

  it('Prune button is enabled with repoPath and isPruning=false', () => {
    renderBar({ repoPath: '/repo', isPruning: false });
    expect(screen.getByText('Prune').closest('button')).not.toBeDisabled();
  });

  it('Prune button calls onPrune when clicked', () => {
    const onPrune = vi.fn();
    renderBar({ repoPath: '/repo', onPrune });
    fireEvent.click(screen.getByText('Prune'));
    expect(onPrune).toHaveBeenCalledTimes(1);
  });

  it('Settings button calls onSettings when clicked', () => {
    const onSettings = vi.fn();
    renderBar({ onSettings });
    fireEvent.click(screen.getByText('Settings'));
    expect(onSettings).toHaveBeenCalledTimes(1);
  });

  it('Minimize button calls window.api.minimize', () => {
    renderBar();
    const btn = screen.getByTitle('Minimize');
    fireEvent.click(btn);
    expect(window.api.minimize).toHaveBeenCalledTimes(1);
  });

  it('Maximize button calls window.api.toggleMaximize', () => {
    renderBar();
    const btn = screen.getByTitle('Maximize');
    fireEvent.click(btn);
    expect(window.api.toggleMaximize).toHaveBeenCalledTimes(1);
  });

  it('Close button calls window.api.close', () => {
    renderBar();
    const btn = screen.getByTitle('Close');
    fireEvent.click(btn);
    expect(window.api.close).toHaveBeenCalledTimes(1);
  });
});
