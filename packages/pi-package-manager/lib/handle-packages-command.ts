import {
  readSettings,
  writeSettings,
  readAutoUpdateConfig,
  writeAutoUpdateConfig,
  readPackageJson,
  backupOriginalSettings,
} from './fs-helpers';
import { resolvePackageEntry } from './resolve-package';
import { PackageListComponent } from './package-list';
import type { CloseResult } from './package-list';
import { mapsEqual, applyOverrides } from './utils';
import type { PackageInfo, Settings } from './types';
import type { Theme } from '@earendil-works/pi-coding-agent';

/**
 * Dependencies that come from the ExtensionAPI surface
 * (not from the filesystem helpers, which are imported directly).
 */
export interface CommandDeps {
  appendEntry: (type: string, data: Record<string, unknown>) => void;
  reload: () => Promise<void>;
}

/**
 * Narrow context interface — only the properties the handler actually uses.
 */
export interface CmdContext {
  mode: string;
  ui: {
    notify: (msg: string, level?: string) => void;
    custom: (fn: (...args: unknown[]) => unknown) => Promise<unknown>;
  };
}

/**
 * Handle the /packages command — show the TUI package list, collect user
 * interactions, persist changes, manage session overrides, and reload.
 *
 * `sessionOverrides` is mutated in place by PackageListComponent during the
 * TUI interaction. It is both an input (existing overrides) and an output
 * (updated after user actions that aren't persisted).
 */
export async function handlePackagesCommand(
  ctx: CmdContext,
  sessionOverrides: Map<string, boolean>,
  deps: CommandDeps,
): Promise<void> {
  if (ctx.mode !== 'tui') {
    ctx.ui.notify('/packages requires interactive mode', 'error');
    return;
  }

  const settings = await readSettings();
  const settingsBefore = JSON.stringify(settings);
  const sessionOverridesBefore = new Map(sessionOverrides);
  const autoUpdateConfig = await readAutoUpdateConfig();
  const autoUpdateBefore = autoUpdateConfig.enabled;
  const entries = settings.packages ?? [];
  const packages: PackageInfo[] = [];

  for (const entry of entries) {
    const pkg = await resolvePackageEntry(entry, sessionOverrides, readPackageJson);
    if (pkg) packages.push(pkg);
  }

  let closeResult!: CloseResult;

  await ctx.ui.custom((...args: unknown[]) => {
    const theme = args[1] as Theme;
    const done = args[3] as () => void;
    return new PackageListComponent(
      packages,
      settings,
      autoUpdateConfig.enabled,
      sessionOverrides,
      theme,
      (result) => {
        closeResult = result;
        done();
      },
    );
  });

  // If the user cancelled (ESC with unsaved toggles), discard session
  // overrides made during this TUI interaction — revert to pre-TUI state.
  if (closeResult.discarded) {
    sessionOverrides.clear();
    for (const [k, v] of sessionOverridesBefore) {
      sessionOverrides.set(k, v);
    }

    // Auto-update toggle is always persisted even on cancel.
    autoUpdateConfig.enabled = closeResult.autoUpdateEnabled;
    await writeAutoUpdateConfig(autoUpdateConfig);

    if (closeResult.autoUpdateEnabled !== autoUpdateBefore) {
      await deps.reload();
    }
    return;
  }

  // Persist session overrides so they survive reload (for /packages display)
  const overridesChanged = !mapsEqual(sessionOverrides, sessionOverridesBefore);

  // Backup original settings BEFORE writing effective settings, so a crash
  // between the write and session_shutdown restore is recoverable on the
  // next startup (session_start restores from backup).
  if (overridesChanged || sessionOverrides.size > 0) {
    try {
      await backupOriginalSettings(JSON.parse(settingsBefore) as Settings);
    } catch {
      // settingsBefore is always valid JSON (we produced it) — ignore
    }
  }

  // Build effective settings: persisted changes + session overrides.
  // This is what Pi's extension loader sees after reload.
  const effectiveSettings = applyOverrides(closeResult.settings, sessionOverrides);
  await writeSettings(effectiveSettings);
  autoUpdateConfig.enabled = closeResult.autoUpdateEnabled;
  await writeAutoUpdateConfig(autoUpdateConfig);

  if (overridesChanged && sessionOverrides.size > 0) {
    deps.appendEntry('pi-package-manager-overrides', Object.fromEntries(sessionOverrides));
  } else if (overridesChanged && sessionOverrides.size === 0) {
    deps.appendEntry('pi-package-manager-overrides', {});
  }

  // Hot-reload if anything changed
  const settingsChanged =
    JSON.stringify(effectiveSettings) !== settingsBefore ||
    closeResult.autoUpdateEnabled !== autoUpdateBefore;
  if (settingsChanged || overridesChanged) {
    await deps.reload();
    return;
  }
}
