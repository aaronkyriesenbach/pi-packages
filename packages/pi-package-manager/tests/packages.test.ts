import { describe, it, expect } from "vitest";
import { getPackagesFromSettings } from "../lib/packages";
import type { PackageJson, PackageFilter, Settings } from "../lib/types";

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

const noPiPkg: PackageJson = {
	name: "no-pi-config",
	version: "1.0.0",
};

const getPkgJson = (name: string): PackageJson | null => {
	const map: Record<string, PackageJson> = {
		"pi-lens": piLensPkg,
		"context-mode": contextModePkg,
		"@juicesharp/rpiv-todo": todoPkg,
		"no-pi-config": noPiPkg,
	};
	return map[name] ?? null;
};

describe("getPackagesFromSettings", () => {
	it("discovers packages from simple string entries", () => {
		const settings: Settings = {
			packages: ["npm:pi-lens", "npm:context-mode"],
		};

		const result = getPackagesFromSettings(settings, getPkgJson);

		expect(result).toHaveLength(2);
		expect(result[0]).toMatchObject({
			name: "pi-lens",
			source: "npm:pi-lens",
			version: "3.8.67",
			enabled: true,
		});
		expect(result[0].resources.extensions).toEqual(["./dist/index.js"]);
		expect(result[1].resources.skills).toEqual(["./skills"]);
	});

	it("marks filtered packages as disabled when all resources are filtered out", () => {
		const filter: PackageFilter = {
			source: "npm:context-mode",
			extensions: [],
			skills: [],
			prompts: [],
			themes: [],
		};
		const settings: Settings = {
			packages: ["npm:pi-lens", filter],
		};

		const result = getPackagesFromSettings(settings, getPkgJson);

		expect(result).toHaveLength(2);
		expect(result[0].enabled).toBe(true);
		expect(result[1].enabled).toBe(false);
	});

	it("handles packages with selective resource filtering", () => {
		const filter: PackageFilter = {
			source: "npm:@juicesharp/rpiv-todo",
			extensions: ["+index.ts"],
		};
		const settings: Settings = {
			packages: [filter],
		};

		const result = getPackagesFromSettings(settings, getPkgJson);

		expect(result).toHaveLength(1);
		expect(result[0].enabled).toBe(true);
		expect(result[0].resources.extensions).toEqual(["index.ts"]);
	});

	it("returns empty array for empty settings", () => {
		const result = getPackagesFromSettings({}, getPkgJson);
		expect(result).toEqual([]);
	});

	it("handles packages without pi config gracefully", () => {
		const settings: Settings = {
			packages: ["npm:no-pi-config"],
		};

		const result = getPackagesFromSettings(settings, getPkgJson);

		expect(result).toHaveLength(1);
		expect(result[0].resources.extensions).toEqual([]);
		expect(result[0].resources.skills).toEqual([]);
	});
});
