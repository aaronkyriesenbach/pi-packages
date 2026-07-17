import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';

// ---------------------------------------------------------------------------
// Mock filesystem at the node level — all integration tests use a virtual
// temp directory to verify the fs helpers wire together correctly.
// ---------------------------------------------------------------------------

const TEMP_HOME = '/tmp/test-pi-home';
const fsStore = vi.hoisted(() => new Map<string, string>());
const execFileImpl = vi.hoisted(() =>
  vi.fn(
    (
      _cmd: string,
      _args: string[],
      _opts: unknown,
      callback: (error: Error | null, result?: { stdout: string; stderr: string }) => void,
    ): void => {
      callback(null, { stdout: '', stderr: '' });
    },
  ),
);

vi.mock('node:os', () => ({
  homedir: (): string => TEMP_HOME,
}));

vi.mock('node:fs/promises', () => ({
  readFile: vi.fn((path: string): string => {
    const cached = fsStore.get(path);
    if (cached !== undefined) return cached;
    const err = new Error('ENOENT: no such file') as NodeJS.ErrnoException;
    err.code = 'ENOENT';
    throw err;
  }),
  writeFile: vi.fn((path: string, data: string): void => {
    fsStore.set(path, data);
  }),
  rm: vi.fn((path: string): void => {
    fsStore.delete(path);
  }),
}));

vi.mock('node:child_process', () => ({
  execFile: execFileImpl,
}));

// Mock PackageListComponent to call onClose immediately so the handler continues
const mockPackageListCtor = vi.hoisted(() =>
  vi.fn(
    (
      _packages: unknown[],
      settings: Record<string, unknown>,
      autoUpdateEnabled: boolean,
      _overrides: Map<string, boolean>,
      _theme: unknown,
      onClose: (r: { settings: Record<string, unknown>; autoUpdateEnabled: boolean }) => void,
    ) => {
      // Immediately close with the given settings
      onClose({ settings, autoUpdateEnabled });
      return { buildViewModel: vi.fn(), handleInput: vi.fn() };
    },
  ),
);

vi.mock('../lib/package-list', () => ({
  PackageListComponent: mockPackageListCtor,
}));

import piExtmgr from '../index';
import { readSettings, readAutoUpdateConfig } from '../lib/fs-helpers';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('index integration test', () => {
  beforeEach(() => {
    fsStore.clear();
    vi.clearAllMocks();

    // Seed the filesystem with default settings and auto-update config
    fsStore.set(
      `${TEMP_HOME}/.pi/agent/settings.json`,
      JSON.stringify({ packages: ['npm:pi-lens'] }) + '\n',
    );
    fsStore.set(
      `${TEMP_HOME}/.pi/agent/auto-update.json`,
      JSON.stringify({
        intervalMs: 3600000,
        enabled: true,
        displayText: '1 hour',
        nextCheck: 0,
      }) + '\n',
    );
    // Seed a package.json fixture
    fsStore.set(
      `${TEMP_HOME}/.pi/agent/npm/node_modules/pi-lens/package.json`,
      JSON.stringify({
        name: 'pi-lens',
        version: '3.8.67',
        pi: { extensions: ['./dist/index.js'] },
      }) + '\n',
    );
  });

  it('wires piExtmgr, handler, fs-helpers, and PackageListComponent together', async () => {
    // -----------------------------------------------------------------------
    // 1. Create the fake ExtensionAPI and register the extension
    // -----------------------------------------------------------------------
    const appendEntry = vi.fn();

    // Track the registered command handler
    let registeredHandler: ((_args: unknown, ctx: unknown) => Promise<void>) | undefined;

    const fakeApi: ExtensionAPI = {
      registerCommand: vi.fn((name: string, cmd: { handler: (...args: unknown[]) => void }) => {
        if (name === 'packages') {
          registeredHandler = cmd.handler as (_args: unknown, ctx: unknown) => Promise<void>;
        }
      }),
      on: vi.fn() as unknown as ExtensionAPI['on'],
      appendEntry: appendEntry as ExtensionAPI['appendEntry'],
      sendUserMessage: vi.fn() as ExtensionAPI['sendUserMessage'],
    } as unknown as ExtensionAPI;

    piExtmgr(fakeApi);

    expect(registeredHandler).toBeDefined();
    if (!registeredHandler) throw new Error('packages command handler not registered');

    // -----------------------------------------------------------------------
    // 2. Invoke the /packages handler with a fake context
    // -----------------------------------------------------------------------
    const fakeCtx = {
      mode: 'tui',
      ui: {
        notify: vi.fn(),
        custom: vi.fn(async (fn: (...args: unknown[]) => unknown) => {
          return new Promise((resolve) => {
            fn(null, null, null, resolve);
          });
        }),
      },
      reload: vi.fn(),
    };
    await registeredHandler({}, fakeCtx);

    // -----------------------------------------------------------------------
    // 3. Assert the TUI component was created
    // -----------------------------------------------------------------------
    expect(fakeCtx.ui.custom).toHaveBeenCalled();

    // -----------------------------------------------------------------------
    // 4. Assert filesystem state
    // -----------------------------------------------------------------------
    const settings = await readSettings();
    expect(settings.packages).toEqual(['npm:pi-lens']);

    const autoUpdateConfig = await readAutoUpdateConfig();
    expect(autoUpdateConfig.enabled).toBe(true);
  });

  it('handles session_shutdown and restores backup settings', async () => {
    const onHandlers = new Map<string, (event: { reason: string }) => void | Promise<void>>();
    const appendEntry = vi.fn();
    const fakeApi = {
      registerCommand: vi.fn(),
      on: vi.fn((event: string, handler: (event: { reason: string }) => void) => {
        onHandlers.set(event, handler);
      }) as unknown as ExtensionAPI['on'],
      appendEntry: appendEntry as ExtensionAPI['appendEntry'],
      sendUserMessage: vi.fn() as ExtensionAPI['sendUserMessage'],
    } as unknown as ExtensionAPI;

    piExtmgr(fakeApi);

    fsStore.set(
      `${TEMP_HOME}/.pi/agent/settings-backup.json`,
      JSON.stringify({
        packages: ['npm:original-pkg'],
      }) + '\n',
    );

    const shutdownHandler = onHandlers.get('session_shutdown');
    expect(shutdownHandler).toBeDefined();
    if (!shutdownHandler) throw new Error('session_shutdown handler not registered');
    await shutdownHandler({ reason: 'quit' });

    const settings = await readSettings();
    expect(settings.packages).toEqual(['npm:original-pkg']);
    expect(fsStore.has(`${TEMP_HOME}/.pi/agent/settings-backup.json`)).toBe(false);
  });

  it('does not restore backup on session_shutdown with reload reason', async () => {
    const onHandlers = new Map<string, (event: { reason: string }) => void | Promise<void>>();
    const appendEntry = vi.fn();
    const fakeApi = {
      registerCommand: vi.fn(),
      on: vi.fn((event: string, handler: (event: { reason: string }) => void) => {
        onHandlers.set(event, handler);
      }) as unknown as ExtensionAPI['on'],
      appendEntry: appendEntry as ExtensionAPI['appendEntry'],
      sendUserMessage: vi.fn() as ExtensionAPI['sendUserMessage'],
    } as unknown as ExtensionAPI;

    piExtmgr(fakeApi);

    fsStore.set(
      `${TEMP_HOME}/.pi/agent/settings-backup.json`,
      JSON.stringify({ packages: ['npm:original-pkg'] }) + '\n',
    );

    const shutdownHandler = onHandlers.get('session_shutdown');
    if (!shutdownHandler) throw new Error('session_shutdown handler not registered');
    await shutdownHandler({ reason: 'reload' });

    expect(fsStore.has(`${TEMP_HOME}/.pi/agent/settings-backup.json`)).toBe(true);
    const settings = await readSettings();
    expect(settings.packages).toEqual(['npm:pi-lens']);
  });

  it('handles session_start with crash recovery and override restoration', async () => {
    const onHandlers = new Map<
      string,
      (event: { reason: string }, ctx: unknown) => void | Promise<void>
    >();
    const sessionManager = {
      getEntries: vi.fn(() => [
        {
          type: 'custom',
          customType: 'pi-package-manager-overrides',
          data: { 'npm:pi-lens': true },
        },
      ]),
    };

    const fakeApi = {
      registerCommand: vi.fn(),
      on: vi.fn((event: string, handler: (event: unknown, ctx: unknown) => void) => {
        onHandlers.set(event, handler);
      }) as unknown as ExtensionAPI['on'],
      appendEntry: vi.fn() as ExtensionAPI['appendEntry'],
      sendUserMessage: vi.fn() as ExtensionAPI['sendUserMessage'],
    } as unknown as ExtensionAPI;

    piExtmgr(fakeApi);

    fsStore.set(
      `${TEMP_HOME}/.pi/agent/settings-backup.json`,
      JSON.stringify({
        packages: ['npm:crash-recovery-pkg'],
      }) + '\n',
    );

    const startHandler = onHandlers.get('session_start');
    if (!startHandler) throw new Error('session_start handler not registered');
    await startHandler(
      { reason: 'startup' },
      {
        sessionManager,
        hasUI: false,
        ui: { notify: vi.fn() },
        cwd: TEMP_HOME,
      },
    );

    const settings = await readSettings();
    expect(settings.packages).toEqual(['npm:crash-recovery-pkg']);
    expect(fsStore.has(`${TEMP_HOME}/.pi/agent/settings-backup.json`)).toBe(false);
  });

  it('notifies and reloads via pi when session_start finds a real auto-update', async () => {
    const onHandlers = new Map<
      string,
      (event: { reason: string }, ctx: unknown) => void | Promise<void>
    >();
    const sendUserMessage = vi.fn();
    const notify = vi.fn();

    const fakeApi = {
      registerCommand: vi.fn(),
      on: vi.fn((event: string, handler: (event: unknown, ctx: unknown) => void) => {
        onHandlers.set(event, handler);
      }) as unknown as ExtensionAPI['on'],
      appendEntry: vi.fn() as ExtensionAPI['appendEntry'],
      sendUserMessage: sendUserMessage as ExtensionAPI['sendUserMessage'],
    } as unknown as ExtensionAPI;

    piExtmgr(fakeApi);

    // First execFile call is `npm view pi-lens version` (getLatestVersion) —
    // report a newer version than the seeded 3.8.67 fixture. Second call is
    // `pi update --extensions`, which just needs to succeed.
    execFileImpl.mockImplementationOnce((_cmd, _args, _opts, callback) => {
      callback(null, { stdout: '3.9.0\n', stderr: '' });
    });
    execFileImpl.mockImplementationOnce((_cmd, _args, _opts, callback) => {
      callback(null, { stdout: '', stderr: '' });
    });

    const startHandler = onHandlers.get('session_start');
    if (!startHandler) throw new Error('session_start handler not registered');
    await startHandler(
      { reason: 'startup' },
      {
        sessionManager: { getEntries: () => [] },
        hasUI: true,
        ui: { notify },
        cwd: TEMP_HOME,
      },
    );

    expect(notify).toHaveBeenCalledWith(expect.stringContaining('Auto-updating'), 'info');
    expect(sendUserMessage).toHaveBeenCalledWith('/reload');
  });

  it('silently swallows errors thrown during session_start', async () => {
    const onHandlers = new Map<
      string,
      (event: { reason: string }, ctx: unknown) => void | Promise<void>
    >();

    const fakeApi = {
      registerCommand: vi.fn(),
      on: vi.fn((event: string, handler: (event: unknown, ctx: unknown) => void) => {
        onHandlers.set(event, handler);
      }) as unknown as ExtensionAPI['on'],
      appendEntry: vi.fn() as ExtensionAPI['appendEntry'],
      sendUserMessage: vi.fn() as ExtensionAPI['sendUserMessage'],
    } as unknown as ExtensionAPI;

    piExtmgr(fakeApi);

    const sessionManager = {
      getEntries: (): never[] => {
        throw new Error('boom');
      },
    };

    const startHandler = onHandlers.get('session_start');
    if (!startHandler) throw new Error('session_start handler not registered');

    await expect(
      startHandler(
        { reason: 'startup' },
        { sessionManager, hasUI: false, ui: { notify: vi.fn() }, cwd: TEMP_HOME },
      ),
    ).resolves.toBeUndefined();
  });

  it('invokes the appendEntry and reload wrappers when the TUI changes overrides', async () => {
    let registeredHandler: ((_args: unknown, ctx: unknown) => Promise<void>) | undefined;
    const appendEntry = vi.fn();
    const fakeApi = {
      registerCommand: vi.fn((name: string, cmd: { handler: (...args: unknown[]) => void }) => {
        if (name === 'packages') {
          registeredHandler = cmd.handler as (_args: unknown, ctx: unknown) => Promise<void>;
        }
      }),
      on: vi.fn() as unknown as ExtensionAPI['on'],
      appendEntry: appendEntry as ExtensionAPI['appendEntry'],
      sendUserMessage: vi.fn() as ExtensionAPI['sendUserMessage'],
    } as unknown as ExtensionAPI;

    piExtmgr(fakeApi);
    if (!registeredHandler) throw new Error('packages command handler not registered');

    // Simulate the user toggling a package off during the TUI session (adds
    // a session override), then closing normally — this exercises index.ts's
    // own appendEntry/reload wrapper closures via handlePackagesCommand.
    mockPackageListCtor.mockImplementationOnce(
      (
        _packages: unknown[],
        settings: Record<string, unknown>,
        autoUpdateEnabled: boolean,
        overrides: Map<string, boolean>,
        _theme: unknown,
        onClose: (r: {
          settings: Record<string, unknown>;
          autoUpdateEnabled: boolean;
          discarded: boolean;
        }) => void,
      ) => {
        overrides.set('npm:pi-lens', false);
        onClose({ settings, autoUpdateEnabled, discarded: false });
        return { buildViewModel: vi.fn(), handleInput: vi.fn() };
      },
    );

    const reload = vi.fn();
    const fakeCtx = {
      mode: 'tui',
      ui: {
        notify: vi.fn(),
        custom: vi.fn(async (fn: (...args: unknown[]) => unknown) => {
          return new Promise((resolve) => {
            fn(null, null, null, resolve);
          });
        }),
      },
      reload,
    };

    await registeredHandler({}, fakeCtx);

    expect(appendEntry).toHaveBeenCalledWith('pi-package-manager-overrides', {
      'npm:pi-lens': false,
    });
    expect(reload).toHaveBeenCalled();
  });
});
