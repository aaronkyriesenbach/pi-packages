import { describe, it, expect } from "vitest";
import { isNewerVersion, shouldCheckForUpdates } from "../lib/updates";
import type { AutoUpdateConfig } from "../lib/types";

describe("isNewerVersion", () => {
	it("detects a newer version", () => {
		expect(isNewerVersion("1.0.0", "1.0.1")).toBe(true);
		expect(isNewerVersion("1.0.0", "2.0.0")).toBe(true);
		expect(isNewerVersion("1.0.0", "1.1.0")).toBe(true);
		expect(isNewerVersion("0.1.0", "1.0.0")).toBe(true);
	});

	it("detects same version as not newer", () => {
		expect(isNewerVersion("1.0.0", "1.0.0")).toBe(false);
	});

	it("detects older version as not newer", () => {
		expect(isNewerVersion("2.0.0", "1.9.9")).toBe(false);
		expect(isNewerVersion("1.0.1", "1.0.0")).toBe(false);
	});

	it("handles pre-release versions", () => {
		// pre-release is considered older than release
		expect(isNewerVersion("1.0.0-beta.1", "1.0.0")).toBe(true);
	});

	it("handles larger version numbers correctly", () => {
		expect(isNewerVersion("3.8.67", "3.8.70")).toBe(true);
		expect(isNewerVersion("3.8.67", "4.0.0")).toBe(true);
		expect(isNewerVersion("3.8.67", "3.9.0")).toBe(true);
		expect(isNewerVersion("3.8.67", "3.8.67")).toBe(false);
	});

	it("handles multi-digit version components", () => {
		expect(isNewerVersion("0.80.5", "0.81.0")).toBe(true);
	});
});

describe("shouldCheckForUpdates", () => {
	it("returns false when auto-update is disabled", () => {
		const config: AutoUpdateConfig = {
			intervalMs: 3600000,
			enabled: false,
			displayText: "1 hour",
			nextCheck: Date.now() - 10000,
		};
		expect(shouldCheckForUpdates(config)).toBe(false);
	});

	it("returns true when nextCheck is in the past", () => {
		const config: AutoUpdateConfig = {
			intervalMs: 3600000,
			enabled: true,
			displayText: "1 hour",
			nextCheck: Date.now() - 10000,
		};
		expect(shouldCheckForUpdates(config)).toBe(true);
	});

	it("returns false when nextCheck is in the future", () => {
		const config: AutoUpdateConfig = {
			intervalMs: 3600000,
			enabled: true,
			displayText: "1 hour",
			nextCheck: Date.now() + 3600000,
		};
		expect(shouldCheckForUpdates(config)).toBe(false);
	});
});
