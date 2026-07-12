import type {
	ExtensionAPI,
	ExtensionCommandContext,
} from "@earendil-works/pi-coding-agent";

import { isNewerVersion, shouldCheckForUpdates } from "./lib/updates";
import { resolvePackageEntry } from "./lib/resolve-package";
import { mapsEqual, applyOverrides } from "./lib/utils";
import {
	backupOriginalSettings,
	execFileAsync,
	getLatestVersion,
	readAutoUpdateConfig,
	readPackageJson,
	readSettings,
	restoreOriginalSettings,
	writeAutoUpdateConfig,
	writeSettings,
} from "./lib/fs-helpers";
import { checkAndRunAutoUpdate, restoreSessionOverrides } from "./lib/session";
import type { PackageInfo } from "./lib/types";
import { PackageListComponent } from "./lib/package-list";
import type { CloseResult } from "./lib/package-list";

export default function piExtmgr(pi: ExtensionAPI) {
	const sessionOverrides = new Map<string, boolean>();

	// -----------------------------------------------------------------------
	// Command: /packages
	// -----------------------------------------------------------------------
	pi.registerCommand("packages", {
		description:
			"Manage installed Pi packages — enable, disable, and configure auto-update",
		handler: async (_args, ctx: ExtensionCommandContext) => {
			if (ctx.mode !== "tui") {
				ctx.ui.notify("/packages requires interactive mode", "error");
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
				const pkg = await resolvePackageEntry(
					entry,
					sessionOverrides,
					readPackageJson,
				);
				if (pkg) packages.push(pkg);
			}

			let closeResult!: CloseResult;

			await ctx.ui.custom<void>((_tui, theme, _keybindings, done) => {
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

			// Build effective settings: persisted changes + session overrides.
			// This is what Pi's extension loader sees after reload.
			const effectiveSettings = applyOverrides(
				closeResult.settings,
				sessionOverrides,
			);
			await writeSettings(effectiveSettings);
			autoUpdateConfig.enabled = closeResult.autoUpdateEnabled;
			await writeAutoUpdateConfig(autoUpdateConfig);

			// Persist session overrides so they survive reload (for /packages display)
			const overridesChanged = !mapsEqual(
				sessionOverrides,
				sessionOverridesBefore,
			);
			if (overridesChanged && sessionOverrides.size > 0) {
				pi.appendEntry(
					"pi-package-manager-overrides",
					Object.fromEntries(sessionOverrides),
				);
			} else if (overridesChanged && sessionOverrides.size === 0) {
				pi.appendEntry("pi-package-manager-overrides", {});
			}

			// Backup original settings so we can restore them on session end.
			// Effective settings may differ from the original because of session
			// overrides — and we don't want those to persist across Pi restarts.
			if (overridesChanged || sessionOverrides.size > 0) {
				try {
					await backupOriginalSettings(JSON.parse(settingsBefore));
				} catch {
					// settingsBefore is always valid JSON (we produced it) — ignore
				}
			}

			// Hot-reload if anything changed
			const settingsChanged =
				JSON.stringify(effectiveSettings) !== settingsBefore ||
				closeResult.autoUpdateEnabled !== autoUpdateBefore;
			if (settingsChanged || overridesChanged) {
				await ctx.reload();
				return;
			}
		},
	});

	// -----------------------------------------------------------------------
	// session_shutdown: restore original settings (undo session overrides)
	// -----------------------------------------------------------------------
	pi.on("session_shutdown", async (event) => {
		// Don't restore during reload — the modified settings are needed for
		// this session. Only restore on actual session end (quit, new, resume, fork).
		if (event.reason !== "reload") {
			await restoreOriginalSettings();
		}
	});

	// -----------------------------------------------------------------------
	// session_start: crash recovery + auto-update
	// -----------------------------------------------------------------------
	pi.on("session_start", async (_event, ctx) => {
		try {
			// Crash recovery: if Pi crashed while session overrides were active,
			// the backup file still exists. Restore original settings on fresh start.
			if (_event.reason === "startup") {
				await restoreOriginalSettings();
			}

			// Restore session overrides from previous session entries
			restoreSessionOverrides(ctx.sessionManager, sessionOverrides);

			const config = await readAutoUpdateConfig();
			const settings = await readSettings();
			await checkAndRunAutoUpdate(config, settings, {
				isNewerVersion: isNewerVersion,
				shouldCheckForUpdates,
				readPackageJson,
				getLatestVersion,
				writeAutoUpdateConfig,
				execFileAsync,
				hasUI: ctx.hasUI,
				notify: (msg, level) =>
					ctx.ui.notify(msg, level as "error" | "warning" | "info" | undefined),
				cwd: ctx.cwd,
				sendReload: () => pi.sendUserMessage("/reload"),
			});
		} catch {
			// Silently skip errors
		}
	});
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------
