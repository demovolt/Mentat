import { vi } from 'vitest';

export class Terminal {
  constructor(options = {}) {
    this.options = { ...options };
    this._onDataCb = null;
    this._onResizeCb = null;
    this._customKeyHandlers = [];

    this.open = vi.fn();
    this.loadAddon = vi.fn();
    this.write = vi.fn();
    this.dispose = vi.fn();
    this.focus = vi.fn();
    this.clearSelection = vi.fn();
    this.paste = vi.fn();
  }

  getSelection() {
    return this._selection || '';
  }

  onData(cb) {
    this._onDataCb = cb;
    return { dispose: vi.fn() };
  }

  onResize(cb) {
    this._onResizeCb = cb;
    return { dispose: vi.fn() };
  }

  attachCustomKeyEventHandler(handler) {
    this._customKeyHandlers.push(handler);
  }

  // Test helpers
  _simulateData(data) {
    this._onDataCb?.(data);
  }

  _simulateResize(cols, rows) {
    this._onResizeCb?.({ cols, rows });
  }

  _simulateKey(event) {
    return this._customKeyHandlers.reduce((result, handler) => {
      if (result === false) return false;
      return handler(event);
    }, true);
  }
}
