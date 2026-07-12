import { matchesKey } from "@earendil-works/pi-tui";
import type { Theme } from "@earendil-works/pi-coding-agent";
import { isAllResourcesEmpty, togglePackage } from "./settings";
import type { PackageInfo, Settings } from "./types";

// ---------------------------------------------------------------------------
// View model types
// ---------------------------------------------------------------------------

export interface PackageRowViewModel {
	name: string;
	version: string;
	enabled: boolean;
	hasPending: boolean;
	selected: boolean;
	resources: {
		extensions: string[];
		skills: string[];
		prompts: string[];
		themes: string[];
	};
}

export interface PackageListViewModel {
	rows: PackageRowViewModel[];
	autoUpdateEnabled: boolean;
	isEmpty: boolean;
}

// ---------------------------------------------------------------------------
// Close result
// ---------------------------------------------------------------------------

export type CloseResult = {
	settings: Settings;
	autoUpdateEnabled: boolean;
	/** True when the user pressed ESC with unsaved session toggles — discard them. */
	discarded: boolean;
};

// ---------------------------------------------------------------------------
// TUI component for /packages
// ---------------------------------------------------------------------------

export class PackageListComponent {
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
		this.settings = settings;
		this.packages = packages.map((p) => ({
			...p,
			_persistedEnabled: this.getPersistedEnabled(p.source),
		}));
		this.autoUpdateEnabled = autoUpdateEnabled;
		this.sessionOverrides = sessionOverrides;
		this.theme = theme;
		this.onClose = onClose;
	}

	/** Return structured view data without any ANSI formatting. */
	buildViewModel(): PackageListViewModel {
		return {
			rows: this.packages.map((pkg, i) => ({
				name: pkg.name,
				version: pkg.version,
				enabled: pkg.enabled,
				hasPending:
					pkg._persistedEnabled !== undefined &&
					pkg._persistedEnabled !== pkg.enabled,
				selected: i === this.selectedIndex,
				resources: { ...pkg.resources },
			})),
			isEmpty: this.packages.length === 0,
			autoUpdateEnabled: this.autoUpdateEnabled,
		};
	}

	handleInput(data: string): void {
		if (matchesKey(data, "escape")) {
			const hasPending = this.packages.some(
				(pkg) =>
					pkg._persistedEnabled !== undefined &&
					pkg._persistedEnabled !== pkg.enabled,
			);
			this.onClose({
				settings: this.settings,
				autoUpdateEnabled: this.autoUpdateEnabled,
				discarded: hasPending,
			});
			return;
		}

		if (matchesKey(data, "enter") || matchesKey(data, "return")) {
			this.onClose({
				settings: this.settings,
				autoUpdateEnabled: this.autoUpdateEnabled,
				discarded: false,
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

			if (isCurrentlyEnabled !== pkg.enabled) {
				togglePackage(this.settings, pkg.source);
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
		const pending = hasPending ? th.fg("warning", " (session only)") : "";
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

		// Session-only hint
		const hasPending = this.packages.some(
			(pkg) =>
				pkg._persistedEnabled !== undefined &&
				pkg._persistedEnabled !== pkg.enabled,
		);
		if (hasPending) {
			lines.push(
				`  ${th.fg("warning", "⚠ Session-only toggles revert when Pi restarts. Press p to save permanently.")}`,
			);
		}

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
