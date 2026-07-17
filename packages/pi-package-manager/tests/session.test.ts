import { describe, it, expect, vi } from 'vitest';
import { restoreSessionOverrides, checkAndRunAutoUpdate } from '../lib/session';
import type { AutoUpdateConfig, Settings } from '../lib/types';

interface SessionEntry {
  type: string;
  customType?: string;
  data?: unknown;
}

// ---------------------------------------------------------------------------
// restoreSessionOverrides
// ---------------------------------------------------------------------------

describe('restoreSessionOverrides', () => {
  it('populates overrides from a matching session entry', () => {
    const sessionManager = {
      getEntries: (): SessionEntry[] => [
        {
          type: 'custom',
          customType: 'pi-package-manager-overrides',
          data: { 'npm:pi-lens': true, 'npm:context-mode': false },
        },
      ],
    };

    const overrides = new Map<string, boolean>();
    restoreSessionOverrides(sessionManager, overrides);

    expect(overrides.get('npm:pi-lens')).toBe(true);
    expect(overrides.get('npm:context-mode')).toBe(false);
    expect(overrides.size).toBe(2);
  });

  it('skips non-boolean values in overrides data', () => {
    const sessionManager = {
      getEntries: (): SessionEntry[] => [
        {
          type: 'custom',
          customType: 'pi-package-manager-overrides',
          data: { 'npm:pi-lens': true, 'npm:bad': 'string' },
        },
      ],
    };

    const overrides = new Map<string, boolean>();
    restoreSessionOverrides(sessionManager, overrides);

    expect(overrides.get('npm:pi-lens')).toBe(true);
    expect(overrides.has('npm:bad')).toBe(false);
    expect(overrides.size).toBe(1);
  });

  it('uses the most recent matching entry when multiple exist', () => {
    const sessionManager = {
      getEntries: (): SessionEntry[] => [
        {
          type: 'custom',
          customType: 'pi-package-manager-overrides',
          data: { 'npm:pi-lens': true },
        },
        {
          type: 'custom',
          customType: 'pi-package-manager-overrides',
          data: { 'npm:pi-lens': false },
        },
      ],
    };

    const overrides = new Map<string, boolean>();
    restoreSessionOverrides(sessionManager, overrides);

    // Most recent (last in array) wins
    expect(overrides.get('npm:pi-lens')).toBe(false);
  });

  it('leaves overrides empty when no matching entry exists', () => {
    const sessionManager = {
      getEntries: (): SessionEntry[] => [
        { type: 'custom', customType: 'other-type', data: { foo: true } },
        { type: 'text', data: 'hello' },
      ],
    };

    const overrides = new Map<string, boolean>();
    restoreSessionOverrides(sessionManager, overrides);

    expect(overrides.size).toBe(0);
  });

  it('handles empty data object without error', () => {
    const sessionManager = {
      getEntries: (): SessionEntry[] => [
        {
          type: 'custom',
          customType: 'pi-package-manager-overrides',
          data: {},
        },
      ],
    };

    const overrides = new Map<string, boolean>();
    restoreSessionOverrides(sessionManager, overrides);

    expect(overrides.size).toBe(0);
  });

  it('handles entry with null data without error', () => {
    const sessionManager = {
      getEntries: (): SessionEntry[] => [
        {
          type: 'custom',
          customType: 'pi-package-manager-overrides',
          data: null,
        },
      ],
    };

    const overrides = new Map<string, boolean>();
    restoreSessionOverrides(sessionManager, overrides);

    expect(overrides.size).toBe(0);
  });

  it('preserves existing overrides when no matching entry is found', () => {
    const mgr = {
      getEntries: (): SessionEntry[] => [{ type: 'text', data: 'hello' }],
    };

    const map = new Map<string, boolean>([['npm:existing', true]]);
    restoreSessionOverrides(mgr, map);

    expect(map.size).toBe(1);
    expect(map.get('npm:existing')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// checkAndRunAutoUpdate
// ---------------------------------------------------------------------------

describe('checkAndRunAutoUpdate', () => {
  it('returns false when shouldCheckForUpdates returns false', async () => {
    const config: AutoUpdateConfig = {
      intervalMs: 3600000,
      enabled: false,
      displayText: '1 hour',
      nextCheck: 0,
    };
    const settings: Settings = {};

    const result = await checkAndRunAutoUpdate(config, settings, {
      shouldCheckForUpdates: () => false,
      isNewerVersion: () => false,
      readPackageJson: () => Promise.resolve(null),
      getLatestVersion: () => Promise.resolve(null),
      writeAutoUpdateConfig: () => Promise.resolve(),
      execFileAsync: () => Promise.resolve({ stdout: '' }),
      hasUI: true,
      notify: () => {},
      cwd: '/tmp',
      sendReload: () => {},
    });

    expect(result).toBe(false);
  });

  it('returns false when no npm packages are in settings', async () => {
    const config: AutoUpdateConfig = {
      intervalMs: 3600000,
      enabled: true,
      displayText: '1 hour',
      nextCheck: 0,
    };
    const settings: Settings = { packages: [] };

    const result = await checkAndRunAutoUpdate(config, settings, {
      shouldCheckForUpdates: () => true,
      isNewerVersion: () => false,
      readPackageJson: () => Promise.resolve(null),
      getLatestVersion: () => Promise.resolve(null),
      writeAutoUpdateConfig: () => Promise.resolve(),
      execFileAsync: () => Promise.resolve({ stdout: '' }),
      hasUI: true,
      notify: () => {},
      cwd: '/tmp',
      sendReload: () => {},
    });

    expect(result).toBe(false);
  });

  it('returns false when settings.packages is undefined', async () => {
    const config: AutoUpdateConfig = {
      intervalMs: 3600000,
      enabled: true,
      displayText: '1 hour',
      nextCheck: 0,
    };
    const settings: Settings = {};

    const result = await checkAndRunAutoUpdate(config, settings, {
      shouldCheckForUpdates: () => true,
      isNewerVersion: () => false,
      readPackageJson: () => Promise.resolve(null),
      getLatestVersion: () => Promise.resolve(null),
      writeAutoUpdateConfig: () => Promise.resolve(),
      execFileAsync: () => Promise.resolve({ stdout: '' }),
      hasUI: true,
      notify: () => {},
      cwd: '/tmp',
      sendReload: () => {},
    });

    expect(result).toBe(false);
  });

  it('resolves PackageFilter object entries by their source field', async () => {
    const config: AutoUpdateConfig = {
      intervalMs: 3600000,
      enabled: true,
      displayText: '1 hour',
      nextCheck: 0,
    };
    const settings: Settings = {
      packages: [{ source: 'npm:pi-lens', extensions: [] }],
    };

    const result = await checkAndRunAutoUpdate(config, settings, {
      shouldCheckForUpdates: () => true,
      isNewerVersion: () => true,
      readPackageJson: () => Promise.resolve({ name: 'pi-lens', version: '1.0.0' }),
      getLatestVersion: () => Promise.resolve('2.0.0'),
      writeAutoUpdateConfig: () => Promise.resolve(),
      execFileAsync: () => Promise.resolve({ stdout: '' }),
      hasUI: false,
      notify: () => {},
      cwd: '/tmp',
      sendReload: () => {},
    });

    expect(result).toBe(true);
  });

  it('returns false when all packages are up to date', async () => {
    const config: AutoUpdateConfig = {
      intervalMs: 3600000,
      enabled: true,
      displayText: '1 hour',
      nextCheck: 0,
    };
    const settings: Settings = { packages: ['npm:pi-lens'] };

    const result = await checkAndRunAutoUpdate(config, settings, {
      shouldCheckForUpdates: () => true,
      isNewerVersion: () => false,
      readPackageJson: () =>
        Promise.resolve({
          name: 'pi-lens',
          version: '1.0.0',
        }),
      getLatestVersion: () => Promise.resolve('1.0.0'),
      writeAutoUpdateConfig: () => Promise.resolve(),
      execFileAsync: () => Promise.resolve({ stdout: '' }),
      hasUI: true,
      notify: () => {},
      cwd: '/tmp',
      sendReload: () => {},
    });

    expect(result).toBe(false);
  });

  it('schedules next check via writeAutoUpdateConfig', async () => {
    const config: AutoUpdateConfig = {
      intervalMs: 3600000,
      enabled: true,
      displayText: '1 hour',
      nextCheck: 0,
    };
    const settings: Settings = { packages: ['npm:pi-lens'] };
    const writeConfig = vi.fn();

    await checkAndRunAutoUpdate(config, settings, {
      shouldCheckForUpdates: () => true,
      isNewerVersion: () => true,
      readPackageJson: () => Promise.resolve({ name: 'pi-lens', version: '1.0.0' }),
      getLatestVersion: () => Promise.resolve('2.0.0'),
      writeAutoUpdateConfig: writeConfig,
      execFileAsync: () => Promise.resolve({ stdout: '' }),
      hasUI: true,
      notify: () => {},
      cwd: '/tmp',
      sendReload: () => {},
    });

    expect(writeConfig).toHaveBeenCalledOnce();
    expect(config.nextCheck).toBeGreaterThan(0);
  });

  it('notifies and runs pi update when update found with hasUI=true', async () => {
    const config: AutoUpdateConfig = {
      intervalMs: 3600000,
      enabled: true,
      displayText: '1 hour',
      nextCheck: 0,
    };
    const settings: Settings = { packages: ['npm:pi-lens'] };
    const notify = vi.fn();
    const execFile = vi.fn().mockResolvedValue({ stdout: '' });
    const sendReload = vi.fn();

    const result = await checkAndRunAutoUpdate(config, settings, {
      shouldCheckForUpdates: () => true,
      isNewerVersion: () => true,
      readPackageJson: () => Promise.resolve({ name: 'pi-lens', version: '1.0.0' }),
      getLatestVersion: () => Promise.resolve('2.0.0'),
      writeAutoUpdateConfig: () => Promise.resolve(),
      execFileAsync: execFile,
      hasUI: true,
      notify,
      cwd: '/tmp',
      sendReload,
    });

    expect(result).toBe(true);
    expect(notify).toHaveBeenCalledTimes(2);
    expect(notify).toHaveBeenCalledWith(expect.stringContaining('Auto-updating'), 'info');
    expect(notify).toHaveBeenCalledWith('Packages updated. Reloading…', 'info');
    expect(execFile).toHaveBeenCalledWith(
      'pi',
      ['update', '--extensions'],
      expect.objectContaining({ timeout: 120000, cwd: '/tmp' }),
    );
    expect(sendReload).toHaveBeenCalledOnce();
  });

  it('skips UI notification when hasUI=false', async () => {
    const config: AutoUpdateConfig = {
      intervalMs: 3600000,
      enabled: true,
      displayText: '1 hour',
      nextCheck: 0,
    };
    const settings: Settings = { packages: ['npm:pi-lens'] };
    const notify = vi.fn();

    const result = await checkAndRunAutoUpdate(config, settings, {
      shouldCheckForUpdates: () => true,
      isNewerVersion: () => true,
      readPackageJson: () => Promise.resolve({ name: 'pi-lens', version: '1.0.0' }),
      getLatestVersion: () => Promise.resolve('2.0.0'),
      writeAutoUpdateConfig: () => Promise.resolve(),
      execFileAsync: () => Promise.resolve({ stdout: '' }),
      hasUI: false,
      notify,
      cwd: '/tmp',
      sendReload: () => {},
    });

    expect(result).toBe(true);
    expect(notify).not.toHaveBeenCalled();
  });

  it('notifies error when pi update execution fails', async () => {
    const config: AutoUpdateConfig = {
      intervalMs: 3600000,
      enabled: true,
      displayText: '1 hour',
      nextCheck: 0,
    };
    const settings: Settings = { packages: ['npm:pi-lens'] };
    const notify = vi.fn();
    const execFile = vi.fn().mockRejectedValue(new Error('exec failed'));

    const result = await checkAndRunAutoUpdate(config, settings, {
      shouldCheckForUpdates: () => true,
      isNewerVersion: () => true,
      readPackageJson: () => Promise.resolve({ name: 'pi-lens', version: '1.0.0' }),
      getLatestVersion: () => Promise.resolve('2.0.0'),
      writeAutoUpdateConfig: () => Promise.resolve(),
      execFileAsync: execFile,
      hasUI: true,
      notify,
      cwd: '/tmp',
      sendReload: () => {},
    });

    expect(result).toBe(true);
    expect(notify).toHaveBeenCalledWith(
      'Package update failed. Run `pi update --extensions` manually.',
      'error',
    );
  });

  it('skips entries where package.json is missing', async () => {
    const config: AutoUpdateConfig = {
      intervalMs: 3600000,
      enabled: true,
      displayText: '1 hour',
      nextCheck: 0,
    };
    const settings: Settings = {
      packages: ['npm:pi-lens', 'npm:context-mode'],
    };
    const readPkgJson = vi
      .fn()
      .mockResolvedValueOnce(null) // pi-lens has no package.json
      .mockResolvedValueOnce({ name: 'context-mode', version: '1.0.0' }); // context-mode does

    const result = await checkAndRunAutoUpdate(config, settings, {
      shouldCheckForUpdates: () => true,
      isNewerVersion: () => true,
      readPackageJson: readPkgJson,
      getLatestVersion: () => Promise.resolve('2.0.0'),
      writeAutoUpdateConfig: () => Promise.resolve(),
      execFileAsync: () => Promise.resolve({ stdout: '' }),
      hasUI: true,
      notify: () => {},
      cwd: '/tmp',
      sendReload: () => {},
    });

    expect(result).toBe(true);
    expect(readPkgJson).toHaveBeenCalledTimes(2);
  });

  it('uses isNewerVersion to compare versions', async () => {
    const config: AutoUpdateConfig = {
      intervalMs: 3600000,
      enabled: true,
      displayText: '1 hour',
      nextCheck: 0,
    };
    const settings: Settings = { packages: ['npm:pi-lens'] };
    const isNewer = vi.fn().mockReturnValue(true);

    await checkAndRunAutoUpdate(config, settings, {
      shouldCheckForUpdates: () => true,
      isNewerVersion: isNewer,
      readPackageJson: () => Promise.resolve({ name: 'pi-lens', version: '1.0.0' }),
      getLatestVersion: () => Promise.resolve('2.0.0'),
      writeAutoUpdateConfig: () => Promise.resolve(),
      execFileAsync: () => Promise.resolve({ stdout: '' }),
      hasUI: true,
      notify: () => {},
      cwd: '/tmp',
      sendReload: () => {},
    });

    expect(isNewer).toHaveBeenCalledWith('1.0.0', '2.0.0');
  });
});
