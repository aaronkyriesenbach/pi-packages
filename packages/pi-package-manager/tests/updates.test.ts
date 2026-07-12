import { describe, it, expect } from "vitest";
import { isNewerVersion, shouldCheckForUpdates } from "../lib/updates";
import type { AutoUpdateConfig } from "../lib/types";

describe("isNewerVersion edge cases", () => {
	it("handles shorter version strings (< 3 segments)", () => {
		expect(isNewerVersion("1.2", "1.2.0")).toBe(false);
	});

	it("release current vs pre-release latest returns false", () => {
		expect(isNewerVersion("1.0.0", "1.0.0-beta.1")).toBe(false);
	});

	it("pre-release current vs release latest returns true", () => {
		expect(isNewerVersion("1.0.0-alpha.1", "1.0.0")).toBe(true);
	});

	it("pre-release current vs pre-release latest with same segments", () => {
		expect(isNewerVersion("1.0.0-beta.1", "1.0.0-beta.2")).toBe(false);
	});

	it("single-segment version string", () => {
		expect(isNewerVersion("1", "2")).toBe(true);
		expect(isNewerVersion("2", "1")).toBe(false);
	});

	it("two-segment version strings", () => {
		expect(isNewerVersion("1.0", "1.1")).toBe(true);
		expect(isNewerVersion("1.1", "1.0")).toBe(false);
	});
});

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

	it("shorter version string is equal when padded with zeros", () => {
		expect(isNewerVersion("1.2", "1.2.0")).toBe(false);
	});

	it("shorter version string detects a newer version", () => {
		expect(isNewerVersion("1.2", "1.3.0")).toBe(true);
	});

	it("release vs pre-release — pre-release is not newer", () => {
		expect(isNewerVersion("1.0.0", "1.0.0-beta.1")).toBe(false);
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
