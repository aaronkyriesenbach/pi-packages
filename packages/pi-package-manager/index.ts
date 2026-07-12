import { homedir } from "node:os";
import { join } from "node:path";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type {
	ExtensionAPI,
	ExtensionCommandContext,
	Theme,
} from "@earendil-works/pi-coding-agent";
import { matchesKey } from "@earendil-works/pi-tui";

import { isNewerVersion, shouldCheckForUpdates } from "./lib/updates";
import { resolveDeclared } from "./lib/packages";
import type {
	AutoUpdateConfig,
	PackageFilter,
	PackageInfo,
	PackageJson,
	Settings,
} from "./lib/types";

const execFileAsync = promisify(execFile);

// ---------------------------------------------------------------------------
// Filesystem helpers
// ---------------------------------------------------------------------------

function settingsPath(): string {
	return join(homedir(), ".pi", "agent", "settings.json");
}

function npmDir(): string {
	return join(homedir(), ".pi", "agent", "npm", "node_modules");
}

function cacheDir(): string {
	return join(homedir(), ".pi", "agent", ".extmgr-cache");
}

async function readSettings(): Promise<Settings> {
	try {
		const raw = await readFile(settingsPath(), "utf-8");
		return JSON.parse(raw) as Settings;
	} catch {
		return {};
	}
}

async function writeSettings(settings: Settings): Promise<void> {
	await writeFile(
		settingsPath(),
		JSON.stringify(settings, null, 2) + "\n",
		"utf-8",
	);
}

async function readPackageJson(pkgName: string): Promise<PackageJson | null> {
	const pkgPath = join(npmDir(), pkgName, "package.json");
	try {
		const raw = await readFile(pkgPath, "utf-8");
		return JSON.parse(raw) as PackageJson;
	} catch {
		return null;
	}
}

async function readAutoUpdateConfig(): Promise<AutoUpdateConfig> {
	const defaults: AutoUpdateConfig = {
		intervalMs: 3600000,
		enabled: true,
		displayText: "1 hour",
		nextCheck: 0,
	};
	try {
		const raw = await readFile(join(cacheDir(), "auto-update.json"), "utf-8");
		return { ...defaults, ...(JSON.parse(raw) as Partial<AutoUpdateConfig>) };
	} catch {
		return defaults;
	}
}

async function writeAutoUpdateConfig(config: AutoUpdateConfig): Promise<void> {
	await mkdir(cacheDir(), { recursive: true });
	await writeFile(
		join(cacheDir(), "auto-update.json"),
		JSON.stringify(config, null, 2) + "\n",
		"utf-8",
	);
}

async function getLatestVersion(pkgName: string): Promise<string | null> {
	try {
		const { stdout } = await execFileAsync(
			"npm",
			["view", pkgName, "version"],
			{
				timeout: 15000,
			},
		);
		return stdout.trim() || null;
	} catch {
		return null;
	}
}

async function resolvePackageEntry(
	entry: string | PackageFilter,
	sessionOverrides: Map<string, boolean>,
): Promise<PackageInfo | null> {
	const source = typeof entry === "string" ? entry : entry.source;
	if (!source.startsWith("npm:")) return null;
	const name = source.slice(4);

	const pkgJson = await readPackageJson(name);
	const persistedEnabled =
		typeof entry === "string" ? true : isFilterEnabled(entry);
	const sessionOverride = sessionOverrides.get(source);
	const enabled =
		sessionOverride !== undefined ? sessionOverride : persistedEnabled;

	const resources =
		typeof entry === "string"
			? {
					extensions: pkgJson?.pi?.extensions ?? [],
					skills: pkgJson?.pi?.skills ?? [],
					prompts: pkgJson?.pi?.prompts ?? [],
					themes: pkgJson?.pi?.themes ?? [],
				}
			: {
					extensions: resolveDeclared(
						pkgJson?.pi?.extensions ?? [],
						entry.extensions,
					),
					skills: resolveDeclared(pkgJson?.pi?.skills ?? [], entry.skills),
					prompts: resolveDeclared(pkgJson?.pi?.prompts ?? [], entry.prompts),
					themes: resolveDeclared(pkgJson?.pi?.themes ?? [], entry.themes),
				};

	return {
		name,
		source,
		version: pkgJson?.version ?? "unknown",
		enabled,
		resources,
	};
}

// ---------------------------------------------------------------------------
// TUI component for /packages
// ---------------------------------------------------------------------------

type CloseResult = {
	settings: Settings;
	autoUpdateEnabled: boolean;
};

class PackageListComponent {
	private packages: Array<PackageInfo & { _persistedEnabled?: boolean }>;
	private selectedIndex = 0;
	private settings: Settings;
	private autoUpdateEnabled: boolean;
	private sessionOverrides: Map<string, boolean>;
	private theme: Theme;
	private onClose: (result: CloseResult) => void;
	private cachedWidth?: number;
	private cachedLines?: string[];

	constructor(
		packages: PackageInfo[],
		settings: Settings,
		autoUpdateEnabled: boolean,
		sessionOverrides: Map<string, boolean>,
		theme: Theme,
		onClose: (result: CloseResult) => void,
	) {
		this.packages = packages.map((p) => ({
			...p,
			_persistedEnabled: this.getPersistedEnabled(p.source),
		}));
		this.settings = settings;
		this.autoUpdateEnabled = autoUpdateEnabled;
		this.sessionOverrides = sessionOverrides;
		this.theme = theme;
		this.onClose = onClose;
	}

	handleInput(data: string): void {
		if (matchesKey(data, "escape")) {
			this.onClose({
				settings: this.settings,
				autoUpdateEnabled: this.autoUpdateEnabled,
			});
			return;
		}

		if (matchesKey(data, "enter") || matchesKey(data, "return")) {
			this.onClose({
				settings: this.settings,
				autoUpdateEnabled: this.autoUpdateEnabled,
			});
			return;
		}

		if (matchesKey(data, "j") || matchesKey(data, "down")) {
			if (this.packages.length === 0) return;
			this.selectedIndex = (this.selectedIndex + 1) % this.packages.length;
			this.invalidate();
			return;
		}

		if (matchesKey(data, "k") || matchesKey(data, "up")) {
			if (this.packages.length === 0) return;
			this.selectedIndex =
				(this.selectedIndex - 1 + this.packages.length) % this.packages.length;
			this.invalidate();
			return;
		}

		if (data === " ") {
			if (this.packages.length === 0) return;
			const pkg = this.packages[this.selectedIndex];
			const source = pkg.source;
			const persisted = this.getPersistedEnabled(source);

			// Toggle effective state
			pkg.enabled = !pkg.enabled;

			// Set or clear session override based on whether new state
			// differs from what's in settings.json
			if (pkg.enabled === persisted) {
				this.sessionOverrides.delete(source);
			} else {
				this.sessionOverrides.set(source, pkg.enabled);
			}
			pkg._persistedEnabled = persisted;
			this.invalidate();
			return;
		}

		if (data === "p") {
			this.persistState();
			this.invalidate();
			return;
		}

		if (data === "u") {
			this.autoUpdateEnabled = !this.autoUpdateEnabled;
			this.invalidate();
			return;
		}
	}

	private getPersistedEnabled(source: string): boolean {
		const entry = (this.settings.packages ?? []).find(
			(e) => (typeof e === "string" ? e : e.source) === source,
		);
		if (!entry) return true;
		return typeof entry === "string" || !isAllResourcesEmpty(entry);
	}

	private persistState(): void {
		for (const pkg of this.packages) {
			const currentIdx = (this.settings.packages ?? []).findIndex((entry) =>
				typeof entry === "string"
					? entry === pkg.source
					: entry.source === pkg.source,
			);
			if (currentIdx === -1) continue;

			const entry = this.settings.packages![currentIdx];
			const isCurrentlyEnabled =
				typeof entry === "string" || !isAllResourcesEmpty(entry);

			if (pkg.enabled && !isCurrentlyEnabled) {
				this.settings.packages![currentIdx] = pkg.source;
			} else if (!pkg.enabled && isCurrentlyEnabled) {
				this.settings.packages![currentIdx] = {
					source: pkg.source,
					extensions: [],
					skills: [],
					prompts: [],
					themes: [],
				};
			}
			pkg._persistedEnabled = pkg.enabled;
		}
		// All overrides are now persisted — clear session state
		this.sessionOverrides.clear();
	}

	private rowForPkg(
		index: number,
		pkg: PackageInfo & { _persistedEnabled?: boolean },
	): string {
		const th = this.theme;
		const isSelected = index === this.selectedIndex;
		const hasPending =
			pkg._persistedEnabled !== undefined &&
			pkg._persistedEnabled !== pkg.enabled;

		const cursor = isSelected ? th.fg("accent", ">") : " ";
		const status = pkg.enabled
			? th.fg("success", "● enabled")
			: th.fg("dim", "○ disabled");
		const pending = hasPending ? th.fg("warning", " (unsaved)") : "";
		const res = [];
		if (pkg.resources.extensions.length) res.push("ext");
		if (pkg.resources.skills.length) res.push("skills");
		if (pkg.resources.prompts.length) res.push("prompts");
		if (pkg.resources.themes.length) res.push("themes");
		const resStr = res.length ? ` ${th.fg("dim", `(${res.join(", ")})`)}` : "";

		const nameLine = `${cursor} ${status} ${th.bold(pkg.name)}${th.fg("dim", `@${pkg.version}`)}${resStr}${pending}`;
		return nameLine;
	}

	render(width: number): string[] {
		if (this.cachedLines && this.cachedWidth === width) {
			return this.cachedLines;
		}

		const th = this.theme;
		const lines: string[] = [];

		// Header
		lines.push("");
		const title = th.fg("accent", " Pi Packages ");
		const headerLine =
			th.fg("borderMuted", "─".repeat(3)) +
			title +
			th.fg("borderMuted", "─".repeat(Math.max(0, width - title.length - 6)));
		lines.push(headerLine);
		lines.push("");

		if (this.packages.length === 0) {
			lines.push(
				`  ${th.fg("dim", "No packages installed. Use `pi install <pkg>` to add one.")}`,
			);
		} else {
			for (let i = 0; i < this.packages.length; i++) {
				lines.push(`  ${this.rowForPkg(i, this.packages[i])}`);
			}
		}

		// Auto-update section
		lines.push("");
		lines.push(
			`  ${
				this.autoUpdateEnabled
					? th.fg("success", "● auto-update on")
					: th.fg("dim", "○ auto-update off")
			}`,
		);

		// Footer
		lines.push("");
		const keys = [
			`${th.fg("accent", "↑↓/jk")} navigate`,
			`${th.fg("accent", "space")} toggle`,
			`${th.fg("accent", "p")} save`,
			`${th.fg("accent", "u")} auto-update`,
			`${th.fg("accent", "enter")} close`,
			`${th.fg("accent", "esc")} cancel`,
		];
		lines.push(`  ${keys.join(`  ${th.fg("borderMuted", "│")}  `)}`);
		lines.push("");

		this.cachedWidth = width;
		this.cachedLines = lines;
		return lines;
	}

	invalidate(): void {
		this.cachedWidth = undefined;
		this.cachedLines = undefined;
	}
}

// ---------------------------------------------------------------------------
// Extension entry point
// ---------------------------------------------------------------------------

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
				const pkg = await resolvePackageEntry(entry, sessionOverrides);
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

			// Persist settings to disk before reload
			await writeSettings(closeResult.settings);
			autoUpdateConfig.enabled = closeResult.autoUpdateEnabled;
			await writeAutoUpdateConfig(autoUpdateConfig);

			// Persist session overrides so they survive reload
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
				// Session overrides were cleared — nuke the entry by writing an empty one
				pi.appendEntry("pi-package-manager-overrides", {});
			}

			// Hot-reload if anything changed
			const settingsChanged =
				JSON.stringify(closeResult.settings) !== settingsBefore ||
				closeResult.autoUpdateEnabled !== autoUpdateBefore;
			if (settingsChanged || overridesChanged) {
				await ctx.reload();
				return;
			}
		},
	});

	// -----------------------------------------------------------------------
	// session_start: auto-update
	// -----------------------------------------------------------------------
	pi.on("session_start", async (_event, ctx) => {
		try {
			// Restore session overrides from previous session entries
			// (survives /reload since appendEntry persists in the session file)
			const entries = ctx.sessionManager.getEntries();
			for (let i = entries.length - 1; i >= 0; i--) {
				const entry = entries[i];
				if (
					entry.type === "custom" &&
					"customType" in entry &&
					entry.customType === "pi-package-manager-overrides" &&
					typeof entry.data === "object" &&
					entry.data !== null
				) {
					for (const [source, enabled] of Object.entries(
						entry.data as Record<string, unknown>,
					)) {
						if (typeof enabled === "boolean") {
							sessionOverrides.set(source, enabled);
						}
					}
					break; // Use the most recent override entry
				}
			}

			const config = await readAutoUpdateConfig();
			if (!shouldCheckForUpdates(config)) {
				return;
			}

			// Always schedule next check
			config.nextCheck = Date.now() + config.intervalMs;
			await writeAutoUpdateConfig(config);

			const settings = await readSettings();
			const npmPackages = (settings.packages ?? []).filter((e) => {
				const s = typeof e === "string" ? e : e.source;
				return s.startsWith("npm:");
			});

			if (npmPackages.length === 0) return;

			const updates: Array<{
				name: string;
				current: string;
				latest: string;
			}> = [];

			for (const entry of npmPackages) {
				const source = typeof entry === "string" ? entry : entry.source;
				const name = source.slice(4);
				const pkgJson = await readPackageJson(name);
				const current = pkgJson?.version;
				if (!current) continue;

				const latest = await getLatestVersion(name);
				if (latest && isNewerVersion(current, latest)) {
					updates.push({ name, current, latest });
				}
			}

			if (updates.length === 0) return;

			const updateList = updates
				.map((u) => `${u.name} ${u.current} → ${u.latest}`)
				.join(", ");

			if (ctx.hasUI) {
				ctx.ui.notify(
					`Auto-updating ${updates.length} package(s): ${updateList}`,
					"info",
				);

				// Run pi update
				try {
					await execFileAsync("pi", ["update", "--extensions"], {
						timeout: 120000,
						env: { ...process.env },
						cwd: ctx.cwd,
					});
					ctx.ui.notify("Packages updated. Reloading…", "info");
					pi.sendUserMessage("/reload");
				} catch {
					// Update may have partially succeeded
					ctx.ui.notify(
						"Package update failed. Run `pi update --extensions` manually.",
						"error",
					);
				}
			}
		} catch {
			// Silently skip errors
		}
	});
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function isFilterEnabled(entry: PackageFilter): boolean {
	return !isAllResourcesEmpty(entry);
}

function isAllResourcesEmpty(entry: PackageFilter): boolean {
	return (
		entry.extensions?.length === 0 &&
		entry.skills?.length === 0 &&
		entry.prompts?.length === 0 &&
		entry.themes?.length === 0
	);
}

function mapsEqual<K, V>(a: Map<K, V>, b: Map<K, V>): boolean {
	if (a.size !== b.size) return false;
	for (const [key, value] of a) {
		if (!b.has(key) || b.get(key) !== value) return false;
	}
	return true;
}
