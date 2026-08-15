import '@testing-library/jest-dom';
import { vi } from 'vitest';
import { makeApiMock } from './mocks/window-api.js';

// Global requestAnimationFrame stub (jsdom doesn't fire it)
global.requestAnimationFrame = (cb) => { cb(0); return 0; };
global.cancelAnimationFrame = vi.fn();

// ResizeObserver stub
global.ResizeObserver = vi.fn(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));

// window.open stub
global.open = vi.fn();

// Install default window.api mock before each test, reset after
beforeEach(() => {
  window.api = makeApiMock();
});

afterEach(() => {
  vi.clearAllMocks();
});
