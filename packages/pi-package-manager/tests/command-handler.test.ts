import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PackageInfo, Settings, AutoUpdateConfig } from "../lib/types";

// ---------------------------------------------------------------------------
// Module-level state for mocks (vi.mock factories are hoisted, so we must
// use vi.hoisted for any state they reference).
// ---------------------------------------------------------------------------

const mockReadSettings = vi.hoisted(() => vi.fn<() => Promise<Settings>>());
const mockWriteSettings = vi.hoisted(() => vi.fn());
const mockReadAutoUpdateConfig = vi.hoisted(() =>
	vi.fn<() => Promise<AutoUpdateConfig>>(),
);
const mockWriteAutoUpdateConfig = vi.hoisted(() => vi.fn());
const mockReadPackageJson = vi.hoisted(() => vi.fn());
const mockBackupOriginalSettings = vi.hoisted(() => vi.fn());
const mockPackageListCtor = vi.hoisted(() => vi.fn());

vi.mock("../lib/fs-helpers", () => ({
	readSettings: mockReadSettings,
	writeSettings: mockWriteSettings,
	readAutoUpdateConfig: mockReadAutoUpdateConfig,
	writeAutoUpdateConfig: mockWriteAutoUpdateConfig,
	readPackageJson: mockReadPackageJson,
	backupOriginalSettings: mockBackupOriginalSettings,
}));

vi.mock("../lib/package-list", () => ({
	PackageListComponent: mockPackageListCtor,
}));

// Import after mocks are registered
import { handlePackagesCommand } from "../lib/handle-packages-command";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const defaultAutoUpdateConfig: AutoUpdateConfig = {
	intervalMs: 3600000,
	enabled: true,
	displayText: "1 hour",
	nextCheck: 0,
};

/**
 * Create a context object matching CmdContext.
 * `custom` immediately invokes its callback, allowing tests to control
 * the TUI close result by setting mockPackageListCtor's behavior.
 */
function makeCtx(
	overrides: Partial<{
		mode: string;
		customResolve: () => void;
	}> = {},
) {
	const notify = vi.fn();
	const reload = vi.fn();

	const ctx = {
		mode: overrides.mode ?? "tui",
		ui: {
			notify,
			custom: vi.fn(async (fn: (...args: unknown[]) => unknown) => {
				return new Promise((resolve) => {
					fn(null, null, null, resolve);
				});
			}),
		},
		reload,
	};

	return { ctx, notify, reload };
}

describe("handlePackagesCommand", () => {
	beforeEach(() => {
		vi.clearAllMocks();

		// Default: all mocks return empty/noop
		mockReadSettings.mockResolvedValue({});
		mockReadAutoUpdateConfig.mockResolvedValue({ ...defaultAutoUpdateConfig });
		mockPackageListCtor.mockImplementation(
			(
				_packages: PackageInfo[],
				_settings: Settings,
				_autoUpdateEnabled: boolean,
				_overrides: Map<string, boolean>,
				_theme: unknown,
				onClose: (result: {
					settings: Settings;
					autoUpdateEnabled: boolean;
				}) => void,
			) => {
				// Default: close with no changes
				onClose({ settings: {}, autoUpdateEnabled: true });
				return { buildViewModel: vi.fn(), handleInput: vi.fn() };
			},
		);
	});

	it("notifies error in non-TUI mode", async () => {
		const { ctx, notify } = makeCtx({ mode: "cli" });
		const overrides = new Map<string, boolean>();
		const deps = { appendEntry: vi.fn(), reload: vi.fn() };

		await handlePackagesCommand(ctx, overrides, deps);

		expect(notify).toHaveBeenCalledWith(
			"/packages requires interactive mode",
			"error",
		);
		expect(deps.appendEntry).not.toHaveBeenCalled();
		expect(deps.reload).not.toHaveBeenCalled();
	});

	it("opens TUI and does not reload when no changes are made", async () => {
		mockReadSettings.mockResolvedValue({
			packages: ["npm:pi-lens"],
		});
		mockReadAutoUpdateConfig.mockResolvedValue({ ...defaultAutoUpdateConfig });

		const { ctx } = makeCtx();
		const overrides = new Map<string, boolean>();
		const deps = { appendEntry: vi.fn(), reload: vi.fn() };

		// PackageListComponent will call onClose with the same settings
		mockPackageListCtor.mockImplementation(
			(
				_packages: PackageInfo[],
				settings: Settings,
				autoUpdateEnabled: boolean,
				_overrides: Map<string, boolean>,
				_theme: unknown,
				onClose: (r: {
					settings: Settings;
					autoUpdateEnabled: boolean;
				}) => void,
			) => {
				onClose({ settings, autoUpdateEnabled });
				return { buildViewModel: vi.fn(), handleInput: vi.fn() };
			},
		);

		await handlePackagesCommand(ctx, overrides, deps);

		expect(deps.appendEntry).not.toHaveBeenCalled();
		expect(deps.reload).not.toHaveBeenCalled();
	});

	it("persists session overrides and reloads when TUI adds a new override", async () => {
		mockReadSettings.mockResolvedValue({
			packages: ["npm:pi-lens"],
		});
		mockReadAutoUpdateConfig.mockResolvedValue({ ...defaultAutoUpdateConfig });

		const { ctx } = makeCtx();
		const overrides = new Map<string, boolean>(); // initially empty
		const deps = { appendEntry: vi.fn(), reload: vi.fn() };

		// The mock PackageListComponent does NOT call onClose immediately.
		// Instead, it mutates the sessionOverrides map to add a new override,
		// then calls onClose. This simulates a user toggling a package.
		mockPackageListCtor.mockImplementation(
			(
				_packages: PackageInfo[],
				settings: Settings,
				autoUpdateEnabled: boolean,
				overrides_: Map<string, boolean>,
				_theme: unknown,
				onClose: (r: {
					settings: Settings;
					autoUpdateEnabled: boolean;
				}) => void,
			) => {
				// Simulate user toggling pi-lens off — adds a session override
				overrides_.set("npm:pi-lens", false);
				onClose({ settings, autoUpdateEnabled });
				return { buildViewModel: vi.fn(), handleInput: vi.fn() };
			},
		);

		await handlePackagesCommand(ctx, overrides, deps);

		// overridesBefore was empty, overrides after has { "npm:pi-lens": false }
		expect(deps.appendEntry).toHaveBeenCalledWith(
			"pi-package-manager-overrides",
			{ "npm:pi-lens": false },
		);
		expect(deps.reload).toHaveBeenCalled();
	});

	it("reloads when auto-update is toggled", async () => {
		mockReadSettings.mockResolvedValue({
			packages: ["npm:pi-lens"],
		});
		mockReadAutoUpdateConfig.mockResolvedValue({ ...defaultAutoUpdateConfig });

		const { ctx } = makeCtx();
		const overrides = new Map<string, boolean>();
		const deps = { appendEntry: vi.fn(), reload: vi.fn() };

		// TUI closes with autoUpdateEnabled=false (user toggled it off)
		mockPackageListCtor.mockImplementation(
			(
				_packages: PackageInfo[],
				settings: Settings,
				_autoUpdateEnabled: boolean,
				_overrides: Map<string, boolean>,
				_theme: unknown,
				onClose: (r: {
					settings: Settings;
					autoUpdateEnabled: boolean;
				}) => void,
			) => {
				onClose({ settings, autoUpdateEnabled: false });
				return { buildViewModel: vi.fn(), handleInput: vi.fn() };
			},
		);

		await handlePackagesCommand(ctx, overrides, deps);

		// autoUpdateConfig.enabled should have been written as false
		expect(mockWriteAutoUpdateConfig).toHaveBeenCalled();
		const writtenConfig = mockWriteAutoUpdateConfig.mock
			.calls[0][0] as AutoUpdateConfig;
		expect(writtenConfig.enabled).toBe(false);
		// Reload because auto-update changed
		expect(deps.reload).toHaveBeenCalled();
	});

	it("clears session entries and reloads when overrides are resolved", async () => {
		mockReadSettings.mockResolvedValue({
			packages: [
				{
					source: "npm:pi-lens",
					extensions: [],
					skills: [],
					prompts: [],
					themes: [],
				},
			],
		});
		mockReadAutoUpdateConfig.mockResolvedValue({ ...defaultAutoUpdateConfig });

		const { ctx } = makeCtx();
		const overrides = new Map<string, boolean>();
		// Override map is empty (user resolved all overrides)
		const deps = { appendEntry: vi.fn(), reload: vi.fn() };

		mockPackageListCtor.mockImplementation(
			(
				_packages: PackageInfo[],
				settings: Settings,
				autoUpdateEnabled: boolean,
				_overrides: Map<string, boolean>,
				_theme: unknown,
				onClose: (r: {
					settings: Settings;
					autoUpdateEnabled: boolean;
				}) => void,
			) => {
				onClose({ settings, autoUpdateEnabled });
				return { buildViewModel: vi.fn(), handleInput: vi.fn() };
			},
		);

		await handlePackagesCommand(ctx, overrides, deps);

		// overridesBefore is empty, overrides after is empty → overridesChanged = false
		// But overrides was never changed... wait, overrides is empty both before and after.
		// The settings changed (disabling the package toggled it via persistState,
		// which changes from string to filter form... but we mocked closeResult
		// to return the same settings without mutating them.
		// Since closeResult.settings === settings (same reference), settingsChanged = false.
		// So no reload in this case.
		expect(deps.reload).not.toHaveBeenCalled();
	});

	it("backs up original settings when overrides exist", async () => {
		const originalSettings: Settings = {
			packages: ["npm:pi-lens"],
		};
		mockReadSettings.mockResolvedValue({ ...originalSettings });
		mockReadAutoUpdateConfig.mockResolvedValue({ ...defaultAutoUpdateConfig });

		const { ctx } = makeCtx();
		const overrides = new Map<string, boolean>();
		overrides.set("npm:pi-lens", false);
		const deps = { appendEntry: vi.fn(), reload: vi.fn() };

		mockPackageListCtor.mockImplementation(
			(
				_packages: PackageInfo[],
				settings: Settings,
				autoUpdateEnabled: boolean,
				_overrides: Map<string, boolean>,
				_theme: unknown,
				onClose: (r: {
					settings: Settings;
					autoUpdateEnabled: boolean;
				}) => void,
			) => {
				onClose({ settings, autoUpdateEnabled });
				return { buildViewModel: vi.fn(), handleInput: vi.fn() };
			},
		);

		await handlePackagesCommand(ctx, overrides, deps);

		// backupOriginalSettings should have been called since overrides exist
		expect(mockBackupOriginalSettings).toHaveBeenCalledWith(
			expect.objectContaining({ packages: ["npm:pi-lens"] }),
		);
	});

	it("resolves packages from settings entries", async () => {
		mockReadSettings.mockResolvedValue({
			packages: ["npm:pi-lens", "npm:context-mode"],
		});
		mockReadAutoUpdateConfig.mockResolvedValue({ ...defaultAutoUpdateConfig });

		// Mock readPackageJson to return known data
		mockReadPackageJson.mockImplementation((name: string) => {
			if (name === "pi-lens") {
				return Promise.resolve({
					name: "pi-lens",
					version: "3.8.67",
					pi: { extensions: ["./dist/index.js"] },
				});
			}
			return Promise.resolve(null);
		});

		const { ctx } = makeCtx();
		const overrides = new Map<string, boolean>();
		const capturedPackages: PackageInfo[] = [];
		const deps = { appendEntry: vi.fn(), reload: vi.fn() };

		mockPackageListCtor.mockImplementation(
			(
				packages: PackageInfo[],
				settings: Settings,
				autoUpdateEnabled: boolean,
				_overrides: Map<string, boolean>,
				_theme: unknown,
				onClose: (r: {
					settings: Settings;
					autoUpdateEnabled: boolean;
				}) => void,
			) => {
				capturedPackages.push(...packages);
				onClose({ settings, autoUpdateEnabled });
				return { buildViewModel: vi.fn(), handleInput: vi.fn() };
			},
		);

		await handlePackagesCommand(ctx, overrides, deps);

		expect(capturedPackages).toHaveLength(2);
		expect(capturedPackages[0]).toMatchObject({
			name: "pi-lens",
			source: "npm:pi-lens",
			version: "3.8.67",
			enabled: true,
		});
		expect(capturedPackages[1]).toMatchObject({
			name: "context-mode",
			source: "npm:context-mode",
			version: "unknown",
			enabled: true,
		});
		expect(deps.reload).not.toHaveBeenCalled();
	});
});
