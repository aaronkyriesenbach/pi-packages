import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mirrors pi-package-manager's node:fs/promises mock pattern in its own tests.
const fsStore = vi.hoisted(() => new Map<string, string>());

vi.mock('node:fs/promises', () => ({
  readFile: vi.fn((path: string): string => {
    const cached = fsStore.get(path);
    if (cached !== undefined) return cached;
    const err = new Error('ENOENT: no such file') as NodeJS.ErrnoException;
    err.code = 'ENOENT';
    throw err;
  }),
}));

import {
  CONFIG_FILENAME,
  DEFAULT_CONFIG,
  getProjectConfigPath,
  getUserConfigPath,
  resolveCleanCommentsConfig,
} from '../extensions/config.js';

const CWD = '/project';
const PROJECT_CONFIG_PATH = getProjectConfigPath(CWD);
const USER_CONFIG_PATH = getUserConfigPath();

beforeEach(() => {
  fsStore.clear();
  vi.clearAllMocks();
});

describe('getProjectConfigPath', () => {
  it('places the config file under .pi in cwd', () => {
    expect(getProjectConfigPath(CWD)).toBe(`${CWD}/.pi/${CONFIG_FILENAME}`);
  });
});

describe('getUserConfigPath', () => {
  it('places the config file under the agent extensions directory', () => {
    expect(getUserConfigPath()).toMatch(new RegExp(`extensions/${CONFIG_FILENAME}$`));
  });
});

describe('resolveCleanCommentsConfig', () => {
  it('falls back to hardcoded defaults when neither file is present', async () => {
    await expect(resolveCleanCommentsConfig(CWD)).resolves.toEqual(DEFAULT_CONFIG);
  });

  it('applies project values when only the project file is present', async () => {
    fsStore.set(
      PROJECT_CONFIG_PATH,
      JSON.stringify({ enforcement: 'gate', threshold: 5, allowAgentBypassRequest: true }),
    );

    await expect(resolveCleanCommentsConfig(CWD)).resolves.toEqual({
      enforcement: 'gate',
      threshold: 5,
      allowAgentBypassRequest: true,
    });
  });

  it('applies user values when only the user file is present', async () => {
    fsStore.set(
      USER_CONFIG_PATH,
      JSON.stringify({ enforcement: 'gate', threshold: 8, allowAgentBypassRequest: true }),
    );

    await expect(resolveCleanCommentsConfig(CWD)).resolves.toEqual({
      enforcement: 'gate',
      threshold: 8,
      allowAgentBypassRequest: true,
    });
  });

  it('lets project values win over user values on a per-key basis', async () => {
    fsStore.set(USER_CONFIG_PATH, JSON.stringify({ enforcement: 'gate', threshold: 8 }));
    fsStore.set(PROJECT_CONFIG_PATH, JSON.stringify({ threshold: 3 }));

    await expect(resolveCleanCommentsConfig(CWD)).resolves.toEqual({
      enforcement: 'gate',
      threshold: 3,
      allowAgentBypassRequest: false,
    });
  });

  it('falls back to defaults for keys missing from both files', async () => {
    fsStore.set(USER_CONFIG_PATH, JSON.stringify({ threshold: 8 }));
    fsStore.set(PROJECT_CONFIG_PATH, JSON.stringify({ allowAgentBypassRequest: true }));

    await expect(resolveCleanCommentsConfig(CWD)).resolves.toEqual({
      enforcement: 'nudge',
      threshold: 8,
      allowAgentBypassRequest: true,
    });
  });

  it('falls back to defaults when the project file is malformed JSON', async () => {
    fsStore.set(PROJECT_CONFIG_PATH, '{ not valid json');
    fsStore.set(USER_CONFIG_PATH, JSON.stringify({ enforcement: 'gate' }));

    await expect(resolveCleanCommentsConfig(CWD)).resolves.toEqual({
      enforcement: 'gate',
      threshold: DEFAULT_CONFIG.threshold,
      allowAgentBypassRequest: DEFAULT_CONFIG.allowAgentBypassRequest,
    });
  });

  it('drops individually malformed keys rather than the whole file', async () => {
    fsStore.set(
      PROJECT_CONFIG_PATH,
      JSON.stringify({
        enforcement: 'strict',
        threshold: 'not-a-number',
        allowAgentBypassRequest: true,
      }),
    );

    await expect(resolveCleanCommentsConfig(CWD)).resolves.toEqual({
      enforcement: DEFAULT_CONFIG.enforcement,
      threshold: DEFAULT_CONFIG.threshold,
      allowAgentBypassRequest: true,
    });
  });

  it('falls back to defaults when a config file is not a JSON object', async () => {
    fsStore.set(PROJECT_CONFIG_PATH, JSON.stringify(['nudge', 2]));

    await expect(resolveCleanCommentsConfig(CWD)).resolves.toEqual(DEFAULT_CONFIG);
  });
});
