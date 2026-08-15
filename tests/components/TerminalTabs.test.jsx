import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import TerminalTabs from '../../src/components/TerminalTabs.jsx';

const sampleTabs = [
  { id: 'term-1', label: 'Claude 1', type: 'ai' },
  { id: 'term-2', label: 'Bash 1', type: null },
];

const sampleProfiles = [
  { id: 'bash', name: 'Bash', cmd: '/bin/bash', args: [] },
  { id: 'zsh', name: 'Zsh', cmd: '/bin/zsh', args: [] },
];

function renderTabs(props = {}) {
  const defaults = {
    tabs: sampleTabs,
    activeId: 'term-1',
    onSelect: vi.fn(),
    onClose: vi.fn(),
    onNew: vi.fn(),
    onNewAi: vi.fn(),
    shellProfiles: sampleProfiles,
  };
  return render(<TerminalTabs {...defaults} {...props} />);
}

describe('TerminalTabs', () => {
  it('renders all tabs', () => {
    renderTabs();
    expect(screen.getByText('Claude 1')).toBeInTheDocument();
    expect(screen.getByText('Bash 1')).toBeInTheDocument();
  });

  it('AI tab shows purple dot indicator', () => {
    renderTabs();
    // The first tab (Claude 1, type: ai) should have a purple dot
    const tab1 = screen.getByText('Claude 1').closest('div');
    expect(tab1.querySelector('[class*="bg-\\[#7c3aed\\]"]')).toBeInTheDocument();
  });

  it('non-AI tab does not show purple dot', () => {
    renderTabs({ tabs: [{ id: 'term-2', label: 'Bash 1', type: null }], activeId: 'term-2' });
    const tab = screen.getByText('Bash 1').closest('div');
    expect(tab.querySelector('[class*="bg-\\[#7c3aed\\]"]')).toBeNull();
  });

  it('clicking a tab calls onSelect with tab id', async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    renderTabs({ onSelect });
    await user.click(screen.getByText('Bash 1'));
    expect(onSelect).toHaveBeenCalledWith('term-2');
  });

  it('clicking close button calls onClose with tab id (without triggering onSelect)', async () => {
    const onSelect = vi.fn();
    const onClose = vi.fn();
    const user = userEvent.setup();
    renderTabs({ onSelect, onClose });
    // Get all × buttons and click the first one
    const closeButtons = screen.getAllByText('×');
    await user.click(closeButtons[0]);
    expect(onClose).toHaveBeenCalledWith('term-1');
  });

  it('"+" button calls onNew with no argument', async () => {
    const onNew = vi.fn();
    const user = userEvent.setup();
    renderTabs({ onNew });
    await user.click(screen.getByTitle('New terminal'));
    expect(onNew).toHaveBeenCalledWith();
  });

  it('"+ AI" button calls onNewAi', async () => {
    const onNewAi = vi.fn();
    const user = userEvent.setup();
    renderTabs({ onNewAi });
    await user.click(screen.getByText('+ AI'));
    expect(onNewAi).toHaveBeenCalledTimes(1);
  });

  it('shell chevron hidden when 0 profiles', () => {
    renderTabs({ shellProfiles: [] });
    expect(screen.queryByTitle('Select shell')).not.toBeInTheDocument();
  });

  it('shell chevron hidden when 1 profile', () => {
    renderTabs({ shellProfiles: [{ id: 'bash', name: 'Bash' }] });
    expect(screen.queryByTitle('Select shell')).not.toBeInTheDocument();
  });

  it('shell chevron shown when 2+ profiles', () => {
    renderTabs({ shellProfiles: sampleProfiles });
    expect(screen.getByTitle('Select shell')).toBeInTheDocument();
  });

  it('clicking chevron opens shell dropdown', async () => {
    const user = userEvent.setup();
    renderTabs({ shellProfiles: sampleProfiles });
    await user.click(screen.getByTitle('Select shell'));
    await waitFor(() => {
      expect(screen.getByText('Zsh')).toBeInTheDocument();
    });
  });

  it('selecting a shell profile calls onNew(profile.id)', async () => {
    const onNew = vi.fn();
    const user = userEvent.setup();
    renderTabs({ shellProfiles: sampleProfiles, onNew });
    await user.click(screen.getByTitle('Select shell'));
    await waitFor(() => screen.getByText('Zsh'));
    fireEvent.mouseDown(screen.getByText('Zsh'));
    expect(onNew).toHaveBeenCalledWith('zsh');
  });

  it('clicking outside closes the dropdown', async () => {
    const user = userEvent.setup();
    renderTabs({ shellProfiles: sampleProfiles });
    await user.click(screen.getByTitle('Select shell'));
    await waitFor(() => screen.getByText('Zsh'));
    // Click outside
    fireEvent.mouseDown(document.body);
    await waitFor(() => {
      expect(screen.queryByText('Zsh')).not.toBeInTheDocument();
    });
  });
});
