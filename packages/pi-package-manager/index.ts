import type {
	ExtensionAPI,
	ExtensionCommandContext,
} from "@earendil-works/pi-coding-agent";

import { isNewerVersion, shouldCheckForUpdates } from "./lib/updates";
import {
	execFileAsync,
	getLatestVersion,
	readAutoUpdateConfig,
	readPackageJson,
	readSettings,
	restoreOriginalSettings,
	writeAutoUpdateConfig,
} from "./lib/fs-helpers";
import { checkAndRunAutoUpdate, restoreSessionOverrides } from "./lib/session";
import { handlePackagesCommand } from "./lib/handle-packages-command";

export default function piExtmgr(pi: ExtensionAPI) {
	const sessionOverrides = new Map<string, boolean>();

	// -----------------------------------------------------------------------
	// Command: /packages
	// -----------------------------------------------------------------------
	pi.registerCommand("packages", {
		description:
			"Manage installed Pi packages — enable, disable, and configure auto-update",
		handler: async (_args, ctx: ExtensionCommandContext) => {
			await handlePackagesCommand(
				ctx as import("./lib/handle-packages-command").CmdContext,
				sessionOverrides,
				{
					appendEntry: (type, data) => pi.appendEntry(type, data),
					reload: () => ctx.reload(),
				},
			);
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
