import { describe, it, expect, vi, beforeEach } from "vitest";

const fsStore = vi.hoisted(() => new Map<string, string>());

vi.mock("node:os", () => ({
	homedir: () => "/tmp/test-pi-home",
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

import {
	readSettings,
	writeSettings,
	readPackageJson,
	readAutoUpdateConfig,
	writeAutoUpdateConfig,
	backupOriginalSettings,
	restoreOriginalSettings,
} from "../lib/fs-helpers";

const SETTINGS_PATH = "/tmp/test-pi-home/.pi/agent/settings.json";
const BACKUP_PATH = "/tmp/test-pi-home/.pi/agent/settings-backup.json";
const AUTO_UPDATE_PATH = "/tmp/test-pi-home/.pi/agent/auto-update.json";

beforeEach(() => {
	fsStore.clear();
	vi.clearAllMocks();
});

describe("readSettings", () => {
	it("returns parsed JSON when file exists", async () => {
		fsStore.set(SETTINGS_PATH, JSON.stringify({ packages: ["npm:foo"] }));
		const result = await readSettings();
		expect(result).toEqual({ packages: ["npm:foo"] });
	});

	it("returns empty object when file is missing", async () => {
		const result = await readSettings();
		expect(result).toEqual({});
	});
});

describe("writeSettings", () => {
	it("writes formatted JSON to the settings path", async () => {
		await writeSettings({ packages: ["npm:foo"] });
		const written = fsStore.get(SETTINGS_PATH);
		expect(written).toBe(
			JSON.stringify({ packages: ["npm:foo"] }, null, 2) + "\n",
		);
	});
});

describe("readPackageJson", () => {
	it("returns parsed JSON when package.json exists", async () => {
		const pkgPath =
			"/tmp/test-pi-home/.pi/agent/npm/node_modules/pi-lens/package.json";
		fsStore.set(pkgPath, JSON.stringify({ name: "pi-lens", version: "1.0.0" }));
		const result = await readPackageJson("pi-lens");
		expect(result).toEqual({ name: "pi-lens", version: "1.0.0" });
	});

	it("returns null when package.json is missing", async () => {
		const result = await readPackageJson("nonexistent");
		expect(result).toBeNull();
	});
});

describe("readAutoUpdateConfig", () => {
	it("returns defaults when file is missing", async () => {
		const result = await readAutoUpdateConfig();
		expect(result).toEqual({
			intervalMs: 3600000,
			enabled: true,
			displayText: "1 hour",
			nextCheck: 0,
		});
	});

	it("merges partial config with defaults", async () => {
		fsStore.set(AUTO_UPDATE_PATH, JSON.stringify({ enabled: false }));
		const result = await readAutoUpdateConfig();
		expect(result.enabled).toBe(false);
		expect(result.intervalMs).toBe(3600000);
	});
});

describe("writeAutoUpdateConfig", () => {
	it("writes formatted JSON to auto-update path", async () => {
		const config = {
			intervalMs: 3600000,
			enabled: false,
			displayText: "1 hour",
			nextCheck: 0,
		};
		await writeAutoUpdateConfig(config);
		const written = fsStore.get(AUTO_UPDATE_PATH);
		expect(written).toBe(JSON.stringify(config, null, 2) + "\n");
	});
});

describe("backup and restore settings", () => {
	it("backups settings then restores them and removes the backup", async () => {
		const settings = { packages: ["npm:foo"] };
		await backupOriginalSettings(settings);

		const backup = fsStore.get(BACKUP_PATH);
		expect(backup).toBe(JSON.stringify(settings, null, 2) + "\n");

		// Restore
		await restoreOriginalSettings();
		const restored = fsStore.get(SETTINGS_PATH);
		expect(restored).toBe(JSON.stringify(settings, null, 2) + "\n");
		expect(fsStore.has(BACKUP_PATH)).toBe(false);
	});

	it("silently succeeds when restoring with no backup", async () => {
		await restoreOriginalSettings();
		// No error thrown
	});
});

// getLatestVersion is tested through the command handler and integration tests
// (depends on child_process.execFile via promisify, which is tested at a higher level)
