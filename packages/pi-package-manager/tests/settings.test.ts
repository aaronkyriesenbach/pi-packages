import { describe, it, expect } from "vitest";
import { togglePackage, isAllResourcesEmpty } from "../lib/settings";
import type { PackageFilter, Settings } from "../lib/types";

describe("isAllResourcesEmpty", () => {
	it("returns true when all resource arrays are empty", () => {
		const entry: PackageFilter = {
			source: "npm:foo",
			extensions: [],
			skills: [],
			prompts: [],
			themes: [],
		};
		expect(isAllResourcesEmpty(entry)).toBe(true);
	});

	it("returns false when extensions is non-empty", () => {
		const entry: PackageFilter = {
			source: "npm:foo",
			extensions: ["ext"],
			skills: [],
			prompts: [],
			themes: [],
		};
		expect(isAllResourcesEmpty(entry)).toBe(false);
	});

	it("returns false when skills is non-empty", () => {
		const entry: PackageFilter = {
			source: "npm:foo",
			extensions: [],
			skills: ["skill"],
			prompts: [],
			themes: [],
		};
		expect(isAllResourcesEmpty(entry)).toBe(false);
	});

	it("returns false when prompts is non-empty", () => {
		const entry: PackageFilter = {
			source: "npm:foo",
			extensions: [],
			skills: [],
			prompts: ["prompt"],
			themes: [],
		};
		expect(isAllResourcesEmpty(entry)).toBe(false);
	});

	it("returns false when themes is non-empty", () => {
		const entry: PackageFilter = {
			source: "npm:foo",
			extensions: [],
			skills: [],
			prompts: [],
			themes: ["theme"],
		};
		expect(isAllResourcesEmpty(entry)).toBe(false);
	});
});

describe("togglePackage", () => {
	it("disables a string-enrty package by converting to empty-filter form", () => {
		const settings: Settings = {
			packages: ["npm:pi-lens", "npm:context-mode"],
		};

		togglePackage(settings, "npm:pi-lens");

		expect(settings.packages).toEqual([
			{
				source: "npm:pi-lens",
				extensions: [],
				skills: [],
				prompts: [],
				themes: [],
			},
			"npm:context-mode",
		]);
	});

	it("enables a disabled package by converting back to string", () => {
		const settings: Settings = {
			packages: [
				"npm:pi-lens",
				{
					source: "npm:context-mode",
					extensions: [],
					skills: [],
					prompts: [],
					themes: [],
				},
			],
		};

		togglePackage(settings, "npm:context-mode");

		expect(settings.packages).toEqual(["npm:pi-lens", "npm:context-mode"]);
	});

	it("disables a package with selective filtering", () => {
		const settings: Settings = {
			packages: [
				{
					source: "npm:@juicesharp/rpiv-todo",
					extensions: ["+index.ts"],
				},
			],
		};

		togglePackage(settings, "npm:@juicesharp/rpiv-todo");

		expect(settings.packages).toEqual([
			{
				source: "npm:@juicesharp/rpiv-todo",
				extensions: [],
				skills: [],
				prompts: [],
				themes: [],
			},
		]);
	});

	it("is a no-op for packages not in the list", () => {
		const settings: Settings = { packages: ["npm:pi-lens"] };
		togglePackage(settings, "npm:nonexistent");
		expect(settings.packages).toEqual(["npm:pi-lens"]);
	});

	it("returns true when disabling, false when enabling", () => {
		const settings: Settings = {
			packages: ["npm:pi-lens", "npm:context-mode"],
		};

		// Disable
		const becameDisabled = togglePackage(settings, "npm:pi-lens");
		expect(becameDisabled).toBe(false); // now disabled

		// Enable
		const becameEnabled = togglePackage(settings, "npm:pi-lens");
		expect(becameEnabled).toBe(true); // now enabled
	});

	it("returns false when settings.packages is undefined", () => {
		const settings: Settings = {};
		const result = togglePackage(settings, "npm:foo");
		expect(result).toBe(false);
		expect(settings.packages).toBeUndefined();
	});
});
