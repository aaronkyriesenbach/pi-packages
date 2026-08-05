import { describe, expect, it, vi } from 'vitest';

vi.mock('unbash', async (importOriginal) => {
  const actual = await importOriginal<typeof import('unbash')>();
  return {
    ...actual,
    parse: vi.fn((source: string) => {
      if (source === 'grep foo') throw new Error('boom');
      return actual.parse(source);
    }),
  };
});

import { findBlockableInvocations } from '../extensions/detect.js';

describe('findBlockableInvocations (nested unbash throws)', () => {
  it('fails open locally when parsing a nested -c script throws', () => {
    expect(findBlockableInvocations("bash -c 'grep foo'")).toEqual([]);
  });
});
