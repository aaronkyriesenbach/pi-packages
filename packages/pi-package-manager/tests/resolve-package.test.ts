import { describe, it, expect } from "vitest";
import { resolvePackageEntry } from "../lib/resolve-package";
import type { PackageJson, PackageFilter } from "../lib/types";

const piLensPkg: PackageJson = {
	name: "pi-lens",
	version: "3.8.67",
	pi: { extensions: ["./dist/index.js"], skills: ["../../skills"] },
};

const contextModePkg: PackageJson = {
	name: "context-mode",
	version: "1.0.169",
	pi: {
		extensions: ["./build/adapters/pi/extension.js"],
		skills: ["./skills"],
	},
};

const todoPkg: PackageJson = {
	name: "@juicesharp/rpiv-todo",
	version: "1.20.0",
	pi: { extensions: ["./index.ts"] },
};

const readPackageJson = async (name: string): Promise<PackageJson | null> => {
	const map: Record<string, PackageJson> = {
		"pi-lens": piLensPkg,
		"context-mode": contextModePkg,
		"@juicesharp/rpiv-todo": todoPkg,
	};
	return map[name] ?? null;
};

describe("resolvePackageEntry", () => {
	it("resolves a string entry with full name, version, and resources", async () => {
		const result = await resolvePackageEntry(
			"npm:pi-lens",
			new Map(),
			readPackageJson,
		);

		expect(result).not.toBeNull();
		expect(result).toMatchObject({
			name: "pi-lens",
			source: "npm:pi-lens",
			version: "3.8.67",
			enabled: true,
		});
		expect(result!.resources.extensions).toEqual(["./dist/index.js"]);
		expect(result!.resources.skills).toEqual(["../../skills"]);
	});

	it("returns null for non-npm: source", async () => {
		const result = await resolvePackageEntry(
			"/some/path",
			new Map(),
			readPackageJson,
		);
		expect(result).toBeNull();
	});

	it("returns version unknown and empty resources for missing package.json", async () => {
		const result = await resolvePackageEntry(
			"npm:missing-pkg",
			new Map(),
			readPackageJson,
		);
		expect(result).not.toBeNull();
		expect(result).toMatchObject({
			name: "missing-pkg",
			version: "unknown",
			enabled: true,
		});
		expect(result!.resources).toEqual({
			extensions: [],
			skills: [],
			prompts: [],
			themes: [],
		});
	});

	it("resolves a PackageFilter entry with selective filtering", async () => {
		const filter: PackageFilter = {
			source: "npm:pi-lens",
			skills: ["+../../skills"],
		};

		const result = await resolvePackageEntry(
			filter,
			new Map(),
			readPackageJson,
		);

		expect(result).not.toBeNull();
		expect(result).toMatchObject({
			name: "pi-lens",
			enabled: true,
		});
		expect(result!.resources.extensions).toEqual(["./dist/index.js"]);
		expect(result!.resources.skills).toEqual(["../../skills"]);
	});

	it("marks PackageFilter entry as disabled when all resources are empty", async () => {
		const filter: PackageFilter = {
			source: "npm:pi-lens",
			extensions: [],
			skills: [],
			prompts: [],
			themes: [],
		};

		const result = await resolvePackageEntry(
			filter,
			new Map(),
			readPackageJson,
		);

		expect(result).not.toBeNull();
		expect(result!.enabled).toBe(false);
	});

	it("applies session override to enable a disabled package", async () => {
		const filter: PackageFilter = {
			source: "npm:pi-lens",
			extensions: [],
			skills: [],
			prompts: [],
			themes: [],
		};
		const overrides = new Map<string, boolean>();
		overrides.set("npm:pi-lens", true);

		const result = await resolvePackageEntry(
			filter,
			overrides,
			readPackageJson,
		);

		expect(result).not.toBeNull();
		expect(result!.enabled).toBe(true);
	});

	it("applies session override to disable an enabled package", async () => {
		const overrides = new Map<string, boolean>();
		overrides.set("npm:pi-lens", false);

		const result = await resolvePackageEntry(
			"npm:pi-lens",
			overrides,
			readPackageJson,
		);

		expect(result).not.toBeNull();
		expect(result!.enabled).toBe(false);
	});

	it("falls back to persisted enabled state when no session override exists", async () => {
		const filter: PackageFilter = {
			source: "npm:pi-lens",
			extensions: [],
			skills: [],
			prompts: [],
			themes: [],
		};

		const result = await resolvePackageEntry(
			filter,
			new Map(),
			readPackageJson,
		);

		expect(result).not.toBeNull();
		expect(result!.enabled).toBe(false);
	});

	it("string entry is always enabled when no session override", async () => {
		const result = await resolvePackageEntry(
			"npm:pi-lens",
			new Map(),
			readPackageJson,
		);

		expect(result).not.toBeNull();
		expect(result!.enabled).toBe(true);
	});
});
