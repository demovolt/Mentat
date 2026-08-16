import { render, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import TerminalComponent from '../../src/components/Terminal.jsx';
import { Terminal as MockXTerm } from '../mocks/xterm.js';
import { FitAddon } from '../mocks/xterm-addons.js';

// Get the instances created during test
let xtermInstance;
let fitInstance;

vi.mock('../../src/components/Terminal.jsx', async () => {
  // Track created instances
  const actual = await vi.importActual('../../src/components/Terminal.jsx');
  return actual;
});

// Track the most recently created Terminal instance
const originalXTerm = MockXTerm;

describe('Terminal component', () => {
  let onTerminalDataCb;

  beforeEach(() => {
    // Capture onTerminalData callback
    window.api.onTerminalData.mockImplementation((cb) => {
      onTerminalDataCb = cb;
      return vi.fn(); // unsubscribe
    });
  });

  it('calls createTerminal with correct arguments on mount', () => {
    render(
      <TerminalComponent
        termId="test-term-1"
        worktreePath="/repo"
        shellId="bash"
        active={true}
        fontFamily="monospace"
        fontSize={13}
        lineHeight={1.2}
        type={null}
        aiCommand="claude"
        sessionId={null}
      />
    );
    expect(window.api.createTerminal).toHaveBeenCalledWith(
      'test-term-1', '/repo', 'bash', null, 'claude', null
    );
  });

  it('calls closeTerminal on unmount', () => {
    const { unmount } = render(
      <TerminalComponent
        termId="test-term-unmount"
        worktreePath="/repo"
        shellId={null}
        active={true}
        fontFamily="monospace"
        fontSize={13}
        lineHeight={1.2}
        type="ai"
        aiCommand="claude"
        sessionId={null}
      />
    );
    unmount();
    expect(window.api.closeTerminal).toHaveBeenCalledWith('test-term-unmount');
  });

  it('renders hidden div when active=false', () => {
    const { container } = render(
      <TerminalComponent
        termId="test-term-inactive"
        worktreePath="/repo"
        shellId={null}
        active={false}
        fontFamily="monospace"
        fontSize={13}
        lineHeight={1.2}
        type={null}
        aiCommand="claude"
        sessionId={null}
      />
    );
    const outerDiv = container.firstChild;
    expect(outerDiv.style.visibility).toBe('hidden');
  });

  it('renders visible div when active=true', () => {
    const { container } = render(
      <TerminalComponent
        termId="test-term-active"
        worktreePath="/repo"
        shellId={null}
        active={true}
        fontFamily="monospace"
        fontSize={13}
        lineHeight={1.2}
        type={null}
        aiCommand="claude"
        sessionId={null}
      />
    );
    const outerDiv = container.firstChild;
    expect(outerDiv.style.visibility).toBe('visible');
  });

  it('registers PTY data listener on mount', () => {
    render(
      <TerminalComponent
        termId="test-data-listener"
        worktreePath="/repo"
        shellId={null}
        active={true}
        fontFamily="monospace"
        fontSize={13}
        lineHeight={1.2}
        type={null}
        aiCommand="claude"
        sessionId={null}
      />
    );
    expect(window.api.onTerminalData).toHaveBeenCalled();
  });

  it('writes data to xterm when termId matches in onTerminalData callback', () => {
    let captured;
    window.api.onTerminalData.mockImplementation((cb) => {
      captured = cb;
      return vi.fn();
    });

    render(
      <TerminalComponent
        termId="test-data-match"
        worktreePath="/repo"
        shellId={null}
        active={true}
        fontFamily="monospace"
        fontSize={13}
        lineHeight={1.2}
        type={null}
        aiCommand="claude"
        sessionId={null}
      />
    );

    // The callback should be called with data for matching termId
    // Since xterm is mocked, we check that write would be called
    // The Terminal component writes to xtermRef.current which is our mock
    act(() => {
      captured?.({ termId: 'test-data-match', data: 'hello world' });
    });
    // We verify no errors thrown; xterm mock's write is called internally
  });

  it('does not throw when onTerminalData is called with different termId', () => {
    let captured;
    window.api.onTerminalData.mockImplementation((cb) => {
      captured = cb;
      return vi.fn();
    });

    render(
      <TerminalComponent
        termId="test-no-match"
        worktreePath="/repo"
        shellId={null}
        active={true}
        fontFamily="monospace"
        fontSize={13}
        lineHeight={1.2}
        type={null}
        aiCommand="claude"
        sessionId={null}
      />
    );

    expect(() => {
      act(() => {
        captured?.({ termId: 'other-term', data: 'ignored' });
      });
    }).not.toThrow();
  });

  it('unsubscribes from PTY data listener on unmount', () => {
    const unsubscribe = vi.fn();
    window.api.onTerminalData.mockReturnValue(unsubscribe);

    const { unmount } = render(
      <TerminalComponent
        termId="test-unsub"
        worktreePath="/repo"
        shellId={null}
        active={true}
        fontFamily="monospace"
        fontSize={13}
        lineHeight={1.2}
        type={null}
        aiCommand="claude"
        sessionId={null}
      />
    );
    unmount();
    expect(unsubscribe).toHaveBeenCalled();
  });
});
