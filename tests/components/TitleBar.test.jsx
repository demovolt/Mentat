import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import TitleBar from '../../src/components/TitleBar.jsx';

function renderBar(props = {}) {
  const defaults = {
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
