import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

// ---------------------------------------------------------------------------
// Mock filesystem at the node level — all integration tests use a virtual
// temp directory to verify the fs helpers wire together correctly.
// ---------------------------------------------------------------------------

const TEMP_HOME = "/tmp/test-pi-home";
const fsStore = vi.hoisted(() => new Map<string, string>());

vi.mock("node:os", () => ({
	homedir: () => TEMP_HOME,
}));

vi.mock("node:fs/promises", () => ({
	readFile: vi.fn(async (path: string) => {
		const p = String(path);
		if (fsStore.has(p)) return fsStore.get(p);
		const err = new Error("ENOENT: no such file") as NodeJS.ErrnoException;
		err.code = "ENOENT";
		throw err;
	}),
	writeFile: vi.fn(async (path: string, data: string) => {
		fsStore.set(String(path), data);
	}),
	rm: vi.fn(async (path: string) => {
		fsStore.delete(String(path));
	}),
}));

vi.mock("node:child_process", () => ({
	execFile: vi.fn(async () => ({ stdout: "" })),
}));

// Mock PackageListComponent to call onClose immediately so the handler continues
vi.mock("../lib/package-list", () => ({
	PackageListComponent: vi.fn(
		(
			_packages: unknown[],
			settings: Record<string, unknown>,
			autoUpdateEnabled: boolean,
			_overrides: Map<string, boolean>,
			_theme: unknown,
			onClose: (r: {
				settings: Record<string, unknown>;
				autoUpdateEnabled: boolean;
			}) => void,
		) => {
			// Immediately close with the given settings
			onClose({ settings, autoUpdateEnabled });
			return { buildViewModel: vi.fn(), handleInput: vi.fn() };
		},
	),
}));

import piExtmgr from "../index";
import { readSettings, readAutoUpdateConfig } from "../lib/fs-helpers";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("index integration test", () => {
	beforeEach(() => {
		fsStore.clear();
		vi.clearAllMocks();

		// Seed the filesystem with default settings and auto-update config
		fsStore.set(
			`${TEMP_HOME}/.pi/agent/settings.json`,
			JSON.stringify({ packages: ["npm:pi-lens"] }) + "\n",
		);
		fsStore.set(
			`${TEMP_HOME}/.pi/agent/auto-update.json`,
			JSON.stringify({
				intervalMs: 3600000,
				enabled: true,
				displayText: "1 hour",
				nextCheck: 0,
			}) + "\n",
		);
		// Seed a package.json fixture
		fsStore.set(
			`${TEMP_HOME}/.pi/agent/npm/node_modules/pi-lens/package.json`,
			JSON.stringify({
				name: "pi-lens",
				version: "3.8.67",
				pi: { extensions: ["./dist/index.js"] },
			}) + "\n",
		);
	});

	it("wires piExtmgr, handler, fs-helpers, and PackageListComponent together", async () => {
		// -----------------------------------------------------------------------
		// 1. Create the fake ExtensionAPI and register the extension
		// -----------------------------------------------------------------------
		const appendEntry = vi.fn();

		// Track the registered command handler
		let registeredHandler:
			| ((_args: unknown, ctx: unknown) => Promise<void>)
			| undefined;

		const fakeApi: ExtensionAPI = {
			registerCommand: vi.fn(
				(name: string, cmd: { handler: (...args: unknown[]) => void }) => {
					if (name === "packages") {
						registeredHandler = cmd.handler as (
							_args: unknown,
							ctx: unknown,
						) => Promise<void>;
					}
				},
			),
			on: vi.fn() as unknown as ExtensionAPI["on"],
			appendEntry: appendEntry as ExtensionAPI["appendEntry"],
			sendUserMessage: vi.fn() as ExtensionAPI["sendUserMessage"],
		} as unknown as ExtensionAPI;

		piExtmgr(fakeApi);

		expect(registeredHandler).toBeDefined();

		// -----------------------------------------------------------------------
		// 2. Invoke the /packages handler with a fake context
		// -----------------------------------------------------------------------
		const fakeCtx = {
			mode: "tui",
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
		await registeredHandler!({}, fakeCtx);

		// -----------------------------------------------------------------------
		// 3. Assert the TUI component was created
		// -----------------------------------------------------------------------
		expect(fakeCtx.ui.custom).toHaveBeenCalled();

		// -----------------------------------------------------------------------
		// 4. Assert filesystem state
		// -----------------------------------------------------------------------
		const settings = await readSettings();
		expect(settings.packages).toEqual(["npm:pi-lens"]);

		const autoUpdateConfig = await readAutoUpdateConfig();
		expect(autoUpdateConfig.enabled).toBe(true);
	});

	it("handles session_shutdown and restores backup settings", async () => {
		const onHandlers = new Map<string, (event: { reason: string }) => void>();
		const appendEntry = vi.fn();
		const fakeApi = {
			registerCommand: vi.fn(),
			on: vi.fn(
				(event: string, handler: (event: { reason: string }) => void) => {
					onHandlers.set(event, handler);
				},
			) as unknown as ExtensionAPI["on"],
			appendEntry: appendEntry as ExtensionAPI["appendEntry"],
			sendUserMessage: vi.fn() as ExtensionAPI["sendUserMessage"],
		} as unknown as ExtensionAPI;

		piExtmgr(fakeApi);

		fsStore.set(
			`${TEMP_HOME}/.pi/agent/settings-backup.json`,
			JSON.stringify({
				packages: ["npm:original-pkg"],
			}) + "\n",
		);

		const shutdownHandler = onHandlers.get("session_shutdown");
		expect(shutdownHandler).toBeDefined();
		await shutdownHandler!({ reason: "quit" });

		const settings = await readSettings();
		expect(settings.packages).toEqual(["npm:original-pkg"]);
		expect(fsStore.has(`${TEMP_HOME}/.pi/agent/settings-backup.json`)).toBe(
			false,
		);
	});

	it("does not restore backup on session_shutdown with reload reason", async () => {
		const onHandlers = new Map<string, (event: { reason: string }) => void>();
		const appendEntry = vi.fn();
		const fakeApi = {
			registerCommand: vi.fn(),
			on: vi.fn(
				(event: string, handler: (event: { reason: string }) => void) => {
					onHandlers.set(event, handler);
				},
			) as unknown as ExtensionAPI["on"],
			appendEntry: appendEntry as ExtensionAPI["appendEntry"],
			sendUserMessage: vi.fn() as ExtensionAPI["sendUserMessage"],
		} as unknown as ExtensionAPI;

		piExtmgr(fakeApi);

		fsStore.set(
			`${TEMP_HOME}/.pi/agent/settings-backup.json`,
			JSON.stringify({ packages: ["npm:original-pkg"] }) + "\n",
		);

		const shutdownHandler = onHandlers.get("session_shutdown");
		await shutdownHandler!({ reason: "reload" });

		expect(fsStore.has(`${TEMP_HOME}/.pi/agent/settings-backup.json`)).toBe(
			true,
		);
		const settings = await readSettings();
		expect(settings.packages).toEqual(["npm:pi-lens"]);
	});

	it("handles session_start with crash recovery and override restoration", async () => {
		const onHandlers = new Map<
			string,
			(event: { reason: string }, ctx: unknown) => void
		>();
		const sessionManager = {
			getEntries: vi.fn(() => [
				{
					type: "custom",
					customType: "pi-package-manager-overrides",
					data: { "npm:pi-lens": true },
				},
			]),
		};

		const fakeApi = {
			registerCommand: vi.fn(),
			on: vi.fn(
				(event: string, handler: (event: unknown, ctx: unknown) => void) => {
					onHandlers.set(
						event,
						handler as (event: { reason: string }, ctx: unknown) => void,
					);
				},
			) as unknown as ExtensionAPI["on"],
			appendEntry: vi.fn() as ExtensionAPI["appendEntry"],
			sendUserMessage: vi.fn() as ExtensionAPI["sendUserMessage"],
		} as unknown as ExtensionAPI;

		piExtmgr(fakeApi);

		fsStore.set(
			`${TEMP_HOME}/.pi/agent/settings-backup.json`,
			JSON.stringify({
				packages: ["npm:crash-recovery-pkg"],
			}) + "\n",
		);

		const startHandler = onHandlers.get("session_start");
		await startHandler!(
			{ reason: "startup" },
			{
				sessionManager,
				hasUI: false,
				ui: { notify: vi.fn() },
				cwd: TEMP_HOME,
			},
		);

		const settings = await readSettings();
		expect(settings.packages).toEqual(["npm:crash-recovery-pkg"]);
		expect(fsStore.has(`${TEMP_HOME}/.pi/agent/settings-backup.json`)).toBe(
			false,
		);
	});
});
