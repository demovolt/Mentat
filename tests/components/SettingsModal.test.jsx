import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import SettingsModal from '../../src/components/SettingsModal.jsx';

const defaultSettings = {
  ai: 'claude',
  loggingEnabled: false,
  console: {
    fontFamily: "'Ubuntu Mono', 'Consolas', monospace",
    fontSize: 13,
    lineHeight: 1.2,
  },
};

function renderModal(props = {}) {
  const defaults = {
    settings: defaultSettings,
    onSettingsChange: vi.fn(),
    onClose: vi.fn(),
  };
  return render(<SettingsModal {...defaults} {...props} />);
}

describe('SettingsModal', () => {
  it('renders with General tab active by default', () => {
    renderModal();
    expect(screen.getByText('Claude')).toBeInTheDocument();
    expect(screen.getByText('Codex')).toBeInTheDocument();
  });

  it('switches to Console tab when clicked', async () => {
    const user = userEvent.setup();
    renderModal();
    await user.click(screen.getByText('Console'));
    expect(screen.getByText('Font')).toBeInTheDocument();
    expect(screen.getByText('Font Size')).toBeInTheDocument();
    expect(screen.getByText('Line Height')).toBeInTheDocument();
  });

  it('switches to Git tab when clicked', async () => {
    const user = userEvent.setup();
    renderModal();
    await user.click(screen.getByRole('button', { name: 'Git' }));
    expect(screen.getByText('Настройки Git появятся здесь.')).toBeInTheDocument();
  });

  it('calls onClose when × button is clicked', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    renderModal({ onClose });
    await user.click(screen.getByText('×'));
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
    // Click on a settings label inside the modal
    fireEvent.click(screen.getByText('Default AI').closest('div'));
    expect(onClose).not.toHaveBeenCalled();
  });

  describe('General tab', () => {
    it('clicking Codex button calls onSettingsChange with ai: codex', async () => {
      const onSettingsChange = vi.fn();
      const user = userEvent.setup();
      renderModal({ onSettingsChange });
      await user.click(screen.getByText('Codex'));
      expect(onSettingsChange).toHaveBeenCalledWith(expect.objectContaining({ ai: 'codex' }));
    });

    it('clicking Claude button calls onSettingsChange with ai: claude', async () => {
      const onSettingsChange = vi.fn();
      const user = userEvent.setup();
      renderModal({ settings: { ...defaultSettings, ai: 'codex' }, onSettingsChange });
      await user.click(screen.getByText('Claude'));
      expect(onSettingsChange).toHaveBeenCalledWith(expect.objectContaining({ ai: 'claude' }));
    });

    it('clicking logging toggle calls onSettingsChange with loggingEnabled: true', async () => {
      const onSettingsChange = vi.fn();
      const user = userEvent.setup();
      renderModal({ onSettingsChange });
      // Find the toggle button (has rounded-full class)
      const toggle = document.querySelector('button[class*="rounded-full"]');
      await user.click(toggle);
      expect(onSettingsChange).toHaveBeenCalledWith(expect.objectContaining({ loggingEnabled: true }));
    });

    it('shows log path when loggingEnabled is true', async () => {
      window.api.getLogPath.mockResolvedValue('/home/user/.log/mentat.log');
      renderModal({ settings: { ...defaultSettings, loggingEnabled: true } });
      await waitFor(() => {
        expect(screen.getByText('/home/user/.log/mentat.log')).toBeInTheDocument();
      });
    });

    it('does not show log path when loggingEnabled is false', () => {
      renderModal({ settings: { ...defaultSettings, loggingEnabled: false } });
      expect(screen.queryByText('/home/user/.log/mentat.log')).not.toBeInTheDocument();
    });
  });

  describe('Console tab', () => {
    async function openConsole(user) {
      await user.click(screen.getByText('Console'));
    }

    it('changes font family calls onSettingsChange with console.fontFamily', async () => {
      const onSettingsChange = vi.fn();
      const user = userEvent.setup();
      renderModal({ onSettingsChange });
      await openConsole(user);
      const select = screen.getByRole('combobox');
      fireEvent.change(select, { target: { value: "'JetBrains Mono', monospace" } });
      expect(onSettingsChange).toHaveBeenCalledWith(
        expect.objectContaining({
          console: expect.objectContaining({ fontFamily: "'JetBrains Mono', monospace" }),
        })
      );
    });

    it('changes font size calls onSettingsChange with integer value', async () => {
      const onSettingsChange = vi.fn();
      const user = userEvent.setup();
      renderModal({ onSettingsChange });
      await openConsole(user);
      const sizeInputs = screen.getAllByRole('spinbutton');
      fireEvent.change(sizeInputs[0], { target: { value: '16' } });
      expect(onSettingsChange).toHaveBeenCalledWith(
        expect.objectContaining({
          console: expect.objectContaining({ fontSize: 16 }),
        })
      );
    });

    it('changes line height calls onSettingsChange with float value', async () => {
      const onSettingsChange = vi.fn();
      const user = userEvent.setup();
      renderModal({ onSettingsChange });
      await openConsole(user);
      const sizeInputs = screen.getAllByRole('spinbutton');
      fireEvent.change(sizeInputs[1], { target: { value: '1.5' } });
      expect(onSettingsChange).toHaveBeenCalledWith(
        expect.objectContaining({
          console: expect.objectContaining({ lineHeight: 1.5 }),
        })
      );
    });

    it('shows all 6 font options in dropdown', async () => {
      const user = userEvent.setup();
      renderModal();
      await openConsole(user);
      const select = screen.getByRole('combobox');
      const options = select.querySelectorAll('option');
      expect(options).toHaveLength(6);
    });
  });
});
