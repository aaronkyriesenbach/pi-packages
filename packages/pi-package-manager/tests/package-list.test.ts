import { describe, it, expect, vi } from "vitest";
import type { Theme } from "@earendil-works/pi-coding-agent";
import { PackageListComponent } from "../lib/package-list";
import type { PackageInfo, Settings } from "../lib/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const mockTheme: Theme = {
	fg: (_color: string, text: string) => text,
	bold: (text: string) => text,
} as Theme;

function makePackage(overrides: Partial<PackageInfo> = {}): PackageInfo {
	return {
		name: "pi-lens",
		source: "npm:pi-lens",
		version: "3.8.67",
		enabled: true,
		resources: {
			extensions: ["./dist/index.js"],
			skills: [],
			prompts: [],
			themes: [],
		},
		...overrides,
	};
}

// ---------------------------------------------------------------------------
// buildViewModel
// ---------------------------------------------------------------------------

describe("buildViewModel", () => {
	it("returns empty rows and isEmpty=true when no packages", () => {
		const settings: Settings = { packages: [] };
		const overrides = new Map<string, boolean>();
		const onClose = vi.fn();
		const comp = new PackageListComponent(
			[],
			settings,
			true,
			overrides,
			mockTheme,
			onClose,
		);
		const vm = comp.buildViewModel();
		expect(vm.rows).toEqual([]);
		expect(vm.isEmpty).toBe(true);
		expect(vm.autoUpdateEnabled).toBe(true);
	});

	it("returns one enabled row for a single enabled package", () => {
		const settings: Settings = { packages: ["npm:pi-lens"] };
		const overrides = new Map<string, boolean>();
		const onClose = vi.fn();
		const comp = new PackageListComponent(
			[makePackage()],
			settings,
			true,
			overrides,
			mockTheme,
			onClose,
		);
		const vm = comp.buildViewModel();
		expect(vm.rows).toHaveLength(1);
		expect(vm.rows[0].name).toBe("pi-lens");
		expect(vm.rows[0].version).toBe("3.8.67");
		expect(vm.rows[0].enabled).toBe(true);
		expect(vm.rows[0].hasPending).toBe(false);
		expect(vm.rows[0].selected).toBe(true); // first item selected
	});

	it("returns a disabled row for a disabled package", () => {
		const settings: Settings = {
			packages: [
				{
					source: "npm:pi-lens",
					extensions: [],
					skills: [],
					prompts: [],
					themes: [],
				},
			],
		};
		const overrides = new Map<string, boolean>();
		const onClose = vi.fn();
		const comp = new PackageListComponent(
			[makePackage({ enabled: false })],
			settings,
			true,
			overrides,
			mockTheme,
			onClose,
		);
		const vm = comp.buildViewModel();
		expect(vm.rows[0].enabled).toBe(false);
	});

	it("reflects selectedIndex as selection", () => {
		const settings: Settings = { packages: ["npm:pi-lens", "npm:other"] };
		const overrides = new Map<string, boolean>();
		const onClose = vi.fn();
		const comp = new PackageListComponent(
			[
				makePackage({ name: "pi-lens", source: "npm:pi-lens" }),
				makePackage({ name: "other", source: "npm:other" }),
			],
			settings,
			true,
			overrides,
			mockTheme,
			onClose,
		);

		// First item selected by default
		expect(comp.buildViewModel().rows[0].selected).toBe(true);
		expect(comp.buildViewModel().rows[1].selected).toBe(false);

		// Navigate down
		comp.handleInput("\x1b[B");
		expect(comp.buildViewModel().rows[0].selected).toBe(false);
		expect(comp.buildViewModel().rows[1].selected).toBe(true);
	});

	it("shows hasPending when toggled without persist", () => {
		const settings: Settings = { packages: ["npm:pi-lens"] };
		const overrides = new Map<string, boolean>();
		const onClose = vi.fn();
		const comp = new PackageListComponent(
			[makePackage()],
			settings,
			true,
			overrides,
			mockTheme,
			onClose,
		);

		// Toggle off
		comp.handleInput(" ");
		const vm = comp.buildViewModel();
		expect(vm.rows[0].enabled).toBe(false); // toggled off via session override
		expect(vm.rows[0].hasPending).toBe(true); // differs from persisted
	});

	it("reports autoUpdateEnabled correctly", () => {
		const settings: Settings = { packages: [] };
		const overrides = new Map<string, boolean>();

		const compOn = new PackageListComponent(
			[],
			settings,
			true,
			overrides,
			mockTheme,
			vi.fn(),
		);
		expect(compOn.buildViewModel().autoUpdateEnabled).toBe(true);

		const compOff = new PackageListComponent(
			[],
			settings,
			false,
			overrides,
			mockTheme,
			vi.fn(),
		);
		expect(compOff.buildViewModel().autoUpdateEnabled).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// handleInput
// ---------------------------------------------------------------------------

describe("handleInput", () => {
	it("escape triggers onClose", () => {
		const settings: Settings = { packages: [] };
		const overrides = new Map<string, boolean>();
		const onClose = vi.fn();
		const comp = new PackageListComponent(
			[],
			settings,
			true,
			overrides,
			mockTheme,
			onClose,
		);

		comp.handleInput("\x1b");

		expect(onClose).toHaveBeenCalledTimes(1);
		expect(onClose).toHaveBeenCalledWith({
			settings,
			autoUpdateEnabled: true,
		});
	});

	it("enter triggers onClose", () => {
		const settings: Settings = { packages: [] };
		const overrides = new Map<string, boolean>();
		const onClose = vi.fn();
		const comp = new PackageListComponent(
			[],
			settings,
			true,
			overrides,
			mockTheme,
			onClose,
		);

		comp.handleInput("\r");

		expect(onClose).toHaveBeenCalledTimes(1);
	});

	it("return triggers onClose", () => {
		const settings: Settings = { packages: [] };
		const overrides = new Map<string, boolean>();
		const onClose = vi.fn();
		const comp = new PackageListComponent(
			[],
			settings,
			true,
			overrides,
			mockTheme,
			onClose,
		);

		comp.handleInput("\r");

		expect(onClose).toHaveBeenCalledTimes(1);
	});

	it("j navigates down and wraps", () => {
		const settings: Settings = { packages: ["npm:a", "npm:b"] };
		const overrides = new Map<string, boolean>();
		const comp = new PackageListComponent(
			[
				makePackage({ name: "a", source: "npm:a" }),
				makePackage({ name: "b", source: "npm:b" }),
			],
			settings,
			true,
			overrides,
			mockTheme,
			vi.fn(),
		);

		expect(comp.buildViewModel().rows[0].selected).toBe(true);
		comp.handleInput("j");
		expect(comp.buildViewModel().rows[1].selected).toBe(true);
		comp.handleInput("j");
		expect(comp.buildViewModel().rows[0].selected).toBe(true); // wraps
	});

	it("k navigates up and wraps", () => {
		const settings: Settings = { packages: ["npm:a", "npm:b"] };
		const overrides = new Map<string, boolean>();
		const comp = new PackageListComponent(
			[
				makePackage({ name: "a", source: "npm:a" }),
				makePackage({ name: "b", source: "npm:b" }),
			],
			settings,
			true,
			overrides,
			mockTheme,
			vi.fn(),
		);

		// Start at index 0, navigate up wraps to last
		comp.handleInput("k");
		expect(comp.buildViewModel().rows[1].selected).toBe(true);
		comp.handleInput("k");
		expect(comp.buildViewModel().rows[0].selected).toBe(true); // wraps
	});

	it("down and up are equivalent to j and k", () => {
		const settings: Settings = { packages: ["npm:a", "npm:b"] };
		const overrides = new Map<string, boolean>();
		const comp = new PackageListComponent(
			[
				makePackage({ name: "a", source: "npm:a" }),
				makePackage({ name: "b", source: "npm:b" }),
			],
			settings,
			true,
			overrides,
			mockTheme,
			vi.fn(),
		);

		comp.handleInput("\x1b[B");
		expect(comp.buildViewModel().rows[1].selected).toBe(true);
		comp.handleInput("\x1b[A");
		expect(comp.buildViewModel().rows[0].selected).toBe(true);
	});

	it("space toggles enabled state on selected package", () => {
		const settings: Settings = { packages: ["npm:pi-lens"] };
		const overrides = new Map<string, boolean>();
		const comp = new PackageListComponent(
			[makePackage()],
			settings,
			true,
			overrides,
			mockTheme,
			vi.fn(),
		);

		expect(comp.buildViewModel().rows[0].enabled).toBe(true);

		comp.handleInput(" ");
		expect(comp.buildViewModel().rows[0].enabled).toBe(false);

		comp.handleInput(" ");
		expect(comp.buildViewModel().rows[0].enabled).toBe(true);
	});

	it("space sets session override when new state differs from persisted", () => {
		const settings: Settings = { packages: ["npm:pi-lens"] };
		const overrides = new Map<string, boolean>();
		const comp = new PackageListComponent(
			[makePackage()],
			settings,
			true,
			overrides,
			mockTheme,
			vi.fn(),
		);

		// Toggle off — should set override
		comp.handleInput(" ");
		expect(overrides.get("npm:pi-lens")).toBe(false);
	});

	it("space clears session override when new state matches persisted", () => {
		const settings: Settings = { packages: ["npm:pi-lens"] };
		const overrides = new Map<string, boolean>([["npm:pi-lens", false]]); // already has override
		const comp = new PackageListComponent(
			[makePackage()],
			settings,
			true,
			overrides,
			mockTheme,
			vi.fn(),
		);

		// Package starts enabled in the component (though overridden to disabled)
		// Toggle off first: sets override to false (matches existing)
		comp.handleInput(" ");
		// Override is still set (false matches existing, but we still set it)
		expect(overrides.get("npm:pi-lens")).toBe(false);

		// Toggle on: enabled returns to true, which matches persisted (true) → clear override
		comp.handleInput(" ");
		expect(overrides.has("npm:pi-lens")).toBe(false);
	});

	it("p calls persistState", () => {
		const settings: Settings = { packages: ["npm:pi-lens"] };
		const overrides = new Map<string, boolean>();
		const comp = new PackageListComponent(
			[makePackage()],
			settings,
			true,
			overrides,
			mockTheme,
			vi.fn(),
		);

		// Toggle off first
		comp.handleInput(" ");
		expect(overrides.get("npm:pi-lens")).toBe(false);

		// Persist
		comp.handleInput("p");

		// Overrides should be cleared after persist
		expect(overrides.size).toBe(0);
		// The settings.packages should now have pi-lens disabled
		expect(settings.packages).toEqual([
			{
				source: "npm:pi-lens",
				extensions: [],
				skills: [],
				prompts: [],
				themes: [],
			},
		]);
	});

	it("u toggles autoUpdateEnabled", () => {
		const settings: Settings = { packages: [] };
		const overrides = new Map<string, boolean>();
		const comp = new PackageListComponent(
			[],
			settings,
			true,
			overrides,
			mockTheme,
			vi.fn(),
		);

		expect(comp.buildViewModel().autoUpdateEnabled).toBe(true);
		comp.handleInput("u");
		expect(comp.buildViewModel().autoUpdateEnabled).toBe(false);
		comp.handleInput("u");
		expect(comp.buildViewModel().autoUpdateEnabled).toBe(true);
	});

	it("keyboard operations on empty list are no-ops", () => {
		const settings: Settings = { packages: [] };
		const overrides = new Map<string, boolean>();
		const onClose = vi.fn();
		const comp = new PackageListComponent(
			[],
			settings,
			true,
			overrides,
			mockTheme,
			onClose,
		);

		// These should not throw or change anything
		comp.handleInput("j");
		comp.handleInput("k");
		comp.handleInput(" ");

		expect(onClose).not.toHaveBeenCalled();
	});
});
