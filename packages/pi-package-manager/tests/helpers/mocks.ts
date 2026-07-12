import { vi } from "vitest";

/**
 * Set up filesystem mocks for testing. Must be called at the top level
 * of a test file (vi.mock calls are hoisted by Vitest).
 *
 * Returns the mock store so tests can seed fixtures and assert side effects.
 */
export function createFsMockStore(): Map<string, string> {
	return new Map<string, string>();
}

/**
 * Mock node:os to point homedir() at a temp directory.
 * Call at top level in the test file (vi.mock is hoisted).
 */
export function mockHomedir(tempDir: string): void {
	vi.mock("node:os", () => ({
		homedir: () => tempDir,
	}));
}
