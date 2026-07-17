import { describe, it, expect } from 'vitest';
import { mapsEqual, applyOverrides } from '../lib/utils';
import type { Settings } from '../lib/types';

describe('mapsEqual', () => {
  it('returns true for equal maps', () => {
    const a = new Map([
      ['npm:foo', true],
      ['npm:bar', false],
    ]);
    const b = new Map([
      ['npm:foo', true],
      ['npm:bar', false],
    ]);
    expect(mapsEqual(a, b)).toBe(true);
  });

  it('returns false for maps with different sizes', () => {
    const a = new Map([['npm:foo', true]]);
    const b = new Map([
      ['npm:foo', true],
      ['npm:bar', false],
    ]);
    expect(mapsEqual(a, b)).toBe(false);
  });

  it('returns false for maps with same keys but different values', () => {
    const a = new Map([['npm:foo', true]]);
    const b = new Map([['npm:foo', false]]);
    expect(mapsEqual(a, b)).toBe(false);
  });

  it('returns false for maps with different keys', () => {
    const a = new Map([['npm:foo', true]]);
    const b = new Map([['npm:bar', true]]);
    expect(mapsEqual(a, b)).toBe(false);
  });

  it('returns true for two empty maps', () => {
    expect(mapsEqual(new Map(), new Map())).toBe(true);
  });
});

describe('applyOverrides', () => {
  const baseSettings: Settings = {
    packages: ['npm:foo', 'npm:bar'],
  };

  it('returns settings unchanged when overrides is empty', () => {
    const result = applyOverrides(baseSettings, new Map());
    expect(result).toEqual(baseSettings);
    // Original not mutated
  });

  it('enables a package via string entry', () => {
    const overrides = new Map([['npm:foo', true]]);
    const result = applyOverrides(baseSettings, overrides);
    expect(result.packages).toEqual(['npm:foo', 'npm:bar']);
  });

  it('disables a package via empty filter entry', () => {
    const overrides = new Map([['npm:foo', false]]);
    const result = applyOverrides(baseSettings, overrides);
    expect(result.packages).toEqual([
      {
        source: 'npm:foo',
        extensions: [],
        skills: [],
        prompts: [],
        themes: [],
      },
      'npm:bar',
    ]);
  });

  it('skips overrides for unknown sources', () => {
    const overrides = new Map([['npm:unknown', false]]);
    const result = applyOverrides(baseSettings, overrides);
    expect(result.packages).toEqual(['npm:foo', 'npm:bar']);
  });

  it('matches a PackageFilter entry by its source field', () => {
    const settingsWithFilter: Settings = {
      packages: [{ source: 'npm:foo', extensions: [] }, 'npm:bar'],
    };
    const overrides = new Map([['npm:foo', true]]);
    const result = applyOverrides(settingsWithFilter, overrides);
    expect(result.packages).toEqual(['npm:foo', 'npm:bar']);
  });

  it('does not mutate the original settings', () => {
    const original = { packages: ['npm:foo', 'npm:bar'] };
    const overrides = new Map([['npm:foo', false]]);
    const result = applyOverrides(original, overrides);
    expect(result.packages).not.toEqual(original.packages);
    expect(original.packages).toEqual(['npm:foo', 'npm:bar']);
  });

  it('handles empty settings.packages', () => {
    const result = applyOverrides({}, new Map([['npm:foo', false]]));
    expect(result).toEqual({ packages: [] });
  });
});
