import { vi } from "vitest";
import type { Theme } from "@earendil-works/pi-coding-agent";

export function createFakeApi() {
	return {
		appendEntry: vi.fn(),
		reload: vi.fn(),
		sessionManager: { getEntries: vi.fn(() => []) },
	};
}

export type FakeApi = ReturnType<typeof createFakeApi>;

/** Minimal Theme double — the handler only uses fg and bold. */
export function makeFakeTheme(): Theme {
	return { fg: (_c: string, t: string) => t, bold: (t: string) => t } as Theme;
}
