import type { AutoUpdateConfig, PackageJson, Settings } from './types';

// ---------------------------------------------------------------------------
// Session override restoration
// ---------------------------------------------------------------------------

/**
 * Walk session entries in reverse to find the most recent
 * pi-package-manager-overrides entry and populate the override map.
 */
export function restoreSessionOverrides(
  sessionManager: {
    getEntries(): {
      type: string;
      customType?: string;
      data?: unknown;
    }[];
  },
  overrides: Map<string, boolean>,
): void {
  const entries = sessionManager.getEntries();
  for (let i = entries.length - 1; i >= 0; i--) {
    const entry = entries[i];
    if (
      entry.type === 'custom' &&
      'customType' in entry &&
      entry.customType === 'pi-package-manager-overrides' &&
      typeof entry.data === 'object' &&
      entry.data !== null
    ) {
      for (const [source, enabled] of Object.entries(entry.data as Record<string, unknown>)) {
        if (typeof enabled === 'boolean') {
          overrides.set(source, enabled);
        }
      }
      break; // Use the most recent override entry
    }
  }
}

// ---------------------------------------------------------------------------
// Auto-update check and execution
// ---------------------------------------------------------------------------

export interface AutoUpdateDeps {
  isNewerVersion: (current: string, latest: string) => boolean;
  shouldCheckForUpdates: (c: AutoUpdateConfig) => boolean;
  readPackageJson: (name: string) => Promise<PackageJson | null>;
  getLatestVersion: (name: string) => Promise<string | null>;
  writeAutoUpdateConfig: (c: AutoUpdateConfig) => Promise<void>;
  execFileAsync: (
    cmd: string,
    args: string[],
    opts: Record<string, unknown>,
  ) => Promise<{ stdout: string }>;
  hasUI: boolean;
  notify: (msg: string, level: string) => void;
  cwd: string;
  sendReload: () => void;
}

/**
 * Check for package updates and run `pi update --extensions` if any are found.
 * Returns true if an update was attempted, false otherwise.
 *
 * All I/O and external dependencies are injected via the `deps` parameter.
 */
export async function checkAndRunAutoUpdate(
  config: AutoUpdateConfig,
  settings: Settings,
  deps: AutoUpdateDeps,
): Promise<boolean> {
  if (!deps.shouldCheckForUpdates(config)) return false;

  // Always schedule next check
  config.nextCheck = Date.now() + config.intervalMs;
  await deps.writeAutoUpdateConfig(config);

  const npmPackages = (settings.packages ?? []).filter((e) => {
    const s = typeof e === 'string' ? e : e.source;
    return s.startsWith('npm:');
  });

  if (npmPackages.length === 0) return false;

  const updates: { name: string; current: string; latest: string }[] = [];

  for (const entry of npmPackages) {
    const source = typeof entry === 'string' ? entry : entry.source;
    const name = source.slice(4);
    const pkgJson = await deps.readPackageJson(name);
    const current = pkgJson?.version;
    if (!current) continue;

    const latest = await deps.getLatestVersion(name);
    if (latest && deps.isNewerVersion(current, latest)) {
      updates.push({ name, current, latest });
    }
  }

  if (updates.length === 0) return false;

  const updateList = updates.map((u) => `${u.name} ${u.current} → ${u.latest}`).join(', ');

  if (deps.hasUI) {
    deps.notify(`Auto-updating ${String(updates.length)} package(s): ${updateList}`, 'info');

    // Run pi update
    try {
      await deps.execFileAsync('pi', ['update', '--extensions'], {
        timeout: 120000,
        env: { ...process.env },
        cwd: deps.cwd,
      });
      deps.notify('Packages updated. Reloading…', 'info');
      deps.sendReload();
    } catch {
      // Update may have partially succeeded
      deps.notify('Package update failed. Run `pi update --extensions` manually.', 'error');
    }
  }

  return true;
}
