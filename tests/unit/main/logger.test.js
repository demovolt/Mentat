import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { setupMainMocks, loadMainModule } from './mock-setup.js';

const mocks = setupMainMocks();

beforeAll(async () => {
  await loadMainModule(mocks);
});

const ev = {};

describe('logging:get-path IPC handler', () => {
  it('returns a string path containing mentat.log', async () => {
    const result = await mocks._handlers['logging:get-path'](ev);
    expect(typeof result).toBe('string');
    expect(result).toContain('mentat.log');
  });
});

describe('logging:set-enabled IPC handler', () => {
  beforeEach(() => {
    mocks.mockStream.write.mockClear();
    mocks.mockStream.end.mockClear();
    mocks.fs.createWriteStream.mockClear();
  });

  it('enabling logging creates a write stream and logs a message', async () => {
    await mocks._handlers['logging:set-enabled'](ev, true);
    expect(mocks.fs.createWriteStream).toHaveBeenCalled();
    expect(mocks.mockStream.write).toHaveBeenCalled();
    const written = mocks.mockStream.write.mock.calls.map(c => c[0]).join('');
    expect(written).toMatch(/\[INFO\]/);
    expect(written).toMatch(/Logging enabled/);
  });

  it('written messages contain ISO timestamp format', async () => {
    await mocks._handlers['logging:set-enabled'](ev, true);
    const written = mocks.mockStream.write.mock.calls.map(c => c[0]).join('');
    expect(written).toMatch(/\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  it('disabling logging after enabling closes the stream', async () => {
    await mocks._handlers['logging:set-enabled'](ev, true);
    mocks.mockStream.end.mockClear();
    await mocks._handlers['logging:set-enabled'](ev, false);
    expect(mocks.mockStream.end).toHaveBeenCalledTimes(1);
  });
});
