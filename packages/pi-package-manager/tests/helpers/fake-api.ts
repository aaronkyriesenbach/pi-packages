import { vi } from 'vitest';
import type { Theme } from '@earendil-works/pi-coding-agent';

export function createFakeApi(): {
  appendEntry: ReturnType<typeof vi.fn>;
  reload: ReturnType<typeof vi.fn>;
  sessionManager: { getEntries: ReturnType<typeof vi.fn> };
} {
  return {
    appendEntry: vi.fn(),
    reload: vi.fn(),
    sessionManager: { getEntries: vi.fn((): never[] => []) },
  };
}

export type FakeApi = ReturnType<typeof createFakeApi>;

/** Minimal Theme double — the handler only uses fg and bold. */
export function makeFakeTheme(): Theme {
  return { fg: (_c: string, t: string): string => t, bold: (t: string): string => t } as Theme;
}
