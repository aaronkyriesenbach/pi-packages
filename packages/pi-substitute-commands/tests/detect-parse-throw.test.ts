import { describe, expect, it, vi } from 'vitest';

vi.mock('unbash', async (importOriginal) => {
  const actual = await importOriginal<typeof import('unbash')>();
  return {
    ...actual,
    parse: vi.fn(() => {
      throw new Error('boom');
    }),
  };
});

import { findBlockableInvocations } from '../extensions/detect.js';

describe('findBlockableInvocations (unbash throws)', () => {
  it('fails open (returns an empty array) when unbash throws', () => {
    expect(findBlockableInvocations('grep TODO .')).toEqual([]);
  });
});
