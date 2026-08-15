import { describe, it, expect, vi, beforeAll } from 'vitest';
import { setupMainMocks, loadMainModule } from './mock-setup.js';

const mocks = setupMainMocks();

beforeAll(async () => {
  await loadMainModule(mocks);
});

const ev = {};

describe('window:minimize', () => {
  it('calls minimize on mainWindow', () => {
    mocks.mockWin.minimize.mockClear();
    mocks._onHandlers['window:minimize'](ev);
    expect(mocks.mockWin.minimize).toHaveBeenCalledTimes(1);
  });
});

describe('window:toggle-maximize', () => {
  it('calls maximize when not maximized', () => {
    mocks.mockWin.isMaximized.mockReturnValue(false);
    mocks.mockWin.maximize.mockClear();
    mocks.mockWin.unmaximize.mockClear();
    mocks._onHandlers['window:toggle-maximize'](ev);
    expect(mocks.mockWin.maximize).toHaveBeenCalledTimes(1);
    expect(mocks.mockWin.unmaximize).not.toHaveBeenCalled();
  });

  it('calls unmaximize when maximized', () => {
    mocks.mockWin.isMaximized.mockReturnValue(true);
    mocks.mockWin.unmaximize.mockClear();
    mocks.mockWin.maximize.mockClear();
    mocks._onHandlers['window:toggle-maximize'](ev);
    expect(mocks.mockWin.unmaximize).toHaveBeenCalledTimes(1);
    expect(mocks.mockWin.maximize).not.toHaveBeenCalled();
  });
});

describe('window:close', () => {
  it('calls close on mainWindow', () => {
    mocks.mockWin.close.mockClear();
    mocks._onHandlers['window:close'](ev);
    expect(mocks.mockWin.close).toHaveBeenCalledTimes(1);
  });
});
