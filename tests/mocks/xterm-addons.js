import { vi } from 'vitest';

export class FitAddon {
  constructor() {
    this.fit = vi.fn();
    this.dispose = vi.fn();
    this.proposeDimensions = vi.fn(() => ({ cols: 80, rows: 24 }));
  }
}

export class WebglAddon {
  constructor() {
    this.dispose = vi.fn();
    this._contextLossCb = null;
  }
  onContextLoss(cb) {
    this._contextLossCb = cb;
  }
}

export class WebLinksAddon {
  constructor() {
    this.dispose = vi.fn();
  }
}

export class ClipboardAddon {
  constructor() {
    this.dispose = vi.fn();
  }
}
