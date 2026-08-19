/**
 * Test infrastructure for electron/main.js tests.
 *
 * Strategy:
 * - For built-in Node modules (fs, child_process): use vi.spyOn on the singleton
 *   CJS module objects. Since Node builtins are always the same object instance,
 *   spies set here affect any code that calls require('fs') or require('child_process').
 * - For electron, http, node-pty: inject mocks directly into require.cache so that
 *   main.js's require() calls return our mocks.
 * - All of main.js's CJS dependencies are eagerly loaded BEFORE vi.spyOn replaces
 *   fs.readFileSync, because Node's CJS loader uses the public fs.readFileSync to
 *   read module files. Pre-loading puts them in require.cache so main.js's require()
 *   calls hit the cache instead of re-reading through the mock.
 */
import { createRequire } from 'module';
import { vi } from 'vitest';

const _require = createRequire(import.meta.url);

// Get singleton CJS module objects
const _cpModule = _require('child_process');
const _fsModule = _require('fs');

function injectCache(moduleName, exports) {
  let resolved;
  try { resolved = _require.resolve(moduleName); } catch { return; }
  _require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports };
}

export function setupMainMocks() {
  const _handlers = {};
  const _onHandlers = {};

  const mockWin = {
    loadURL: vi.fn(), loadFile: vi.fn(), on: vi.fn(),
    webContents: { send: vi.fn(), on: vi.fn() },
    isMaximized: vi.fn(() => false),
    maximize: vi.fn(), unmaximize: vi.fn(), minimize: vi.fn(), close: vi.fn(),
    isDestroyed: vi.fn(() => false),
  };

  // Regular function (not arrow) so it can be used as a constructor with `new`
  function MockBrowserWindow() { return mockWin; }

  const electronMock = {
    app: {
      getPath: vi.fn(() => '/tmp/test-userData'),
      getAppPath: vi.fn(() => '/tmp/test-app'),
      whenReady: vi.fn(() => Promise.resolve()),
      quit: vi.fn(),
      on: vi.fn(),
    },
    BrowserWindow: MockBrowserWindow,
    ipcMain: {
      handle: vi.fn((ch, fn) => { _handlers[ch] = fn; }),
      on: vi.fn((ch, fn) => { _onHandlers[ch] = fn; }),
    },
    dialog: {
      showOpenDialog: vi.fn().mockResolvedValue({ canceled: true, filePaths: [] }),
    },
  };

  const mockStream = { write: vi.fn(), end: vi.fn() };

  let capturedHttpHandler = null;
  const httpServerMock = { on: vi.fn(), listen: vi.fn(), close: vi.fn() };
  const httpMock = {
    createServer: vi.fn((fn) => { capturedHttpHandler = fn; return httpServerMock; }),
  };

  const mockPtyProcess = {
    onData: vi.fn().mockImplementation(() => {}),
    onExit: vi.fn().mockImplementation(() => {}),
    write: vi.fn(),
    resize: vi.fn(),
    kill: vi.fn(),
  };
  const ptyMock = { spawn: vi.fn(() => mockPtyProcess) };

  // Inject non-built-in mocks FIRST so that eager module loading below sees them
  injectCache('electron', electronMock);
  injectCache('http', httpMock);
  injectCache('node-pty', ptyMock);

  // Eagerly load ALL of main.js's CJS dependencies BEFORE vi.spyOn replaces
  // fs.readFileSync. Node's CJS loader calls the public fs.readFileSync to read
  // module source files; if the spy is in place first, every required file gets
  // '{}' as its content and exports nothing (log, loadConfig, etc. = undefined).
  // Pre-loading puts them in require.cache so main.js's require() calls hit the
  // cache without re-reading through the mock. Order matters: satisfy deps first.
  for (const relPath of [
    '../../../electron/helpers.js',
    '../../../electron/terminal-state.js',
    '../../../electron/logger.js',
    '../../../electron/config.js',
    '../../../electron/status-server.js',
    '../../../electron/shell-profiles.js',
    '../../../electron/ipc/git.js',
    '../../../electron/ipc/pty.js',
  ]) {
    const p = _require.resolve(relPath);
    delete _require.cache[p];
    _require(p);
  }

  // Set up spies on built-in module singletons AFTER modules are loaded.
  // Modules hold references to the _fsModule/_cpModule singletons, so future
  // calls from those modules will still go through the spies.
  const execFileSyncSpy = vi.spyOn(_cpModule, 'execFileSync').mockReturnValue('');
  const readFileSyncSpy = vi.spyOn(_fsModule, 'readFileSync').mockReturnValue('{}');
  const writeFileSyncSpy = vi.spyOn(_fsModule, 'writeFileSync').mockImplementation(() => {});
  const mkdirSyncSpy = vi.spyOn(_fsModule, 'mkdirSync').mockImplementation(() => {});
  const appendFileSyncSpy = vi.spyOn(_fsModule, 'appendFileSync').mockImplementation(() => {});
  const existsSyncSpy = vi.spyOn(_fsModule, 'existsSync').mockReturnValue(false);
  const createWriteStreamSpy = vi.spyOn(_fsModule, 'createWriteStream').mockReturnValue(mockStream);
  const rmSyncSpy = vi.spyOn(_fsModule, 'rmSync').mockImplementation(() => {});

  return {
    _handlers,
    _onHandlers,
    mockWin,
    electronMock,
    mockStream,
    httpMock,
    httpServerMock,
    get capturedHttpHandler() { return capturedHttpHandler; },
    mockPtyProcess,
    ptyMock,

    execFileSync: execFileSyncSpy,
    fs: {
      readFileSync: readFileSyncSpy,
      writeFileSync: writeFileSyncSpy,
      mkdirSync: mkdirSyncSpy,
      appendFileSync: appendFileSyncSpy,
      existsSync: existsSyncSpy,
      createWriteStream: createWriteStreamSpy,
      rmSync: rmSyncSpy,
    },

    reset() {
      for (const k of Object.keys(_handlers)) delete _handlers[k];
      for (const k of Object.keys(_onHandlers)) delete _onHandlers[k];
      capturedHttpHandler = null;

      execFileSyncSpy.mockClear().mockReturnValue('');
      readFileSyncSpy.mockClear().mockReturnValue('{}');
      writeFileSyncSpy.mockClear();
      mkdirSyncSpy.mockClear();
      appendFileSyncSpy.mockClear();
      existsSyncSpy.mockClear().mockReturnValue(false);
      createWriteStreamSpy.mockClear().mockReturnValue(mockStream);
      rmSyncSpy.mockClear();

      mockStream.write.mockClear();
      mockStream.end.mockClear();
      mockWin.loadURL.mockClear();
      mockWin.loadFile.mockClear();
      mockWin.on.mockClear();
      mockWin.webContents.send.mockClear();
      mockWin.webContents.on.mockClear();
      mockWin.isMaximized.mockClear().mockReturnValue(false);
      mockWin.maximize.mockClear();
      mockWin.unmaximize.mockClear();
      mockWin.minimize.mockClear();
      mockWin.close.mockClear();

      electronMock.ipcMain.handle.mockClear();
      electronMock.ipcMain.on.mockClear();
      electronMock.app.getPath.mockClear().mockReturnValue('/tmp/test-userData');
      electronMock.app.whenReady.mockClear().mockReturnValue(Promise.resolve());

      ptyMock.spawn.mockClear().mockReturnValue(mockPtyProcess);
      mockPtyProcess.onData.mockClear().mockImplementation(() => {});
      mockPtyProcess.onExit.mockClear().mockImplementation(() => {});
      mockPtyProcess.write.mockClear();
      mockPtyProcess.resize.mockClear();
      mockPtyProcess.kill.mockClear();

      httpMock.createServer.mockClear();

      // Re-inject mocks into require.cache
      injectCache('electron', electronMock);
      injectCache('http', httpMock);
      injectCache('node-pty', ptyMock);
    },
  };
}

export async function loadMainModule(mocks) {
  mocks.reset();

  // Delete main.js from require.cache so handler registrations are fresh.
  // Do NOT delete helpers.js — it was loaded via _require during setupMainMocks()
  // and has the correct spy references for child_process and fs.
  const mainPath = _require.resolve('../../../electron/main.js');
  delete _require.cache[mainPath];

  await import('../../../electron/main.js');
  // Flush app.whenReady().then(...)
  await new Promise(resolve => setImmediate(resolve));
}
