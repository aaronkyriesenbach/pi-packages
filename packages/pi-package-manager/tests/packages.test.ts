import { describe, it, expect } from 'vitest';
import { getPackagesFromSettings, resolveDeclared } from '../lib/packages';
import type { PackageJson, PackageFilter, Settings } from '../lib/types';

const piLensPkg: PackageJson = {
  name: 'pi-lens',
  version: '3.8.67',
  pi: { extensions: ['./dist/index.js'], skills: ['../../skills'] },
};

const contextModePkg: PackageJson = {
  name: 'context-mode',
  version: '1.0.169',
  pi: {
    extensions: ['./build/adapters/pi/extension.js'],
    skills: ['./skills'],
  },
};

const todoPkg: PackageJson = {
  name: '@juicesharp/rpiv-todo',
  version: '1.20.0',
  pi: { extensions: ['./index.ts'] },
};

const noPiPkg: PackageJson = {
  name: 'no-pi-config',
  version: '1.0.0',
};

const getPkgJson = (name: string): PackageJson | null => {
  const map: Record<string, PackageJson> = {
    'pi-lens': piLensPkg,
    'context-mode': contextModePkg,
    '@juicesharp/rpiv-todo': todoPkg,
    'no-pi-config': noPiPkg,
  };
  return map[name] ?? null;
};

describe('resolveDeclared', () => {
  it('exclusion-only filters return declared minus excluded', () => {
    const result = resolveDeclared(['foo', 'bar', 'baz'], ['-foo', '-bar']);
    expect(result).toEqual(['baz']);
  });

  it('plain entries (no prefix) are used directly', () => {
    const result = resolveDeclared(['a', 'b', 'c'], ['a']);
    expect(result).toEqual(['a']);
  });

  it('forced entries (+) take precedence over exclusions', () => {
    const result = resolveDeclared(['foo', 'bar', 'baz'], ['+foo', '-bar']);
    expect(result).toEqual(['foo']);
  });

  it('undefined filter returns declared unchanged', () => {
    const result = resolveDeclared(['a', 'b'], undefined);
    expect(result).toEqual(['a', 'b']);
  });

  it('empty filter returns empty array', () => {
    const result = resolveDeclared(['a', 'b'], []);
    expect(result).toEqual([]);
  });
});

describe('getPackagesFromSettings', () => {
  it('discovers packages from simple string entries', () => {
    const settings: Settings = {
      packages: ['npm:pi-lens', 'npm:context-mode'],
    };

    const result = getPackagesFromSettings(settings, getPkgJson);

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      name: 'pi-lens',
      source: 'npm:pi-lens',
      version: '3.8.67',
      enabled: true,
    });
    expect(result[0].resources.extensions).toEqual(['./dist/index.js']);
    expect(result[1].resources.skills).toEqual(['./skills']);
  });

  it('marks filtered packages as disabled when all resources are filtered out', () => {
    const filter: PackageFilter = {
      source: 'npm:context-mode',
      extensions: [],
      skills: [],
      prompts: [],
      themes: [],
    };
    const settings: Settings = {
      packages: ['npm:pi-lens', filter],
    };

    const result = getPackagesFromSettings(settings, getPkgJson);

    expect(result).toHaveLength(2);
    expect(result[0].enabled).toBe(true);
    expect(result[1].enabled).toBe(false);
  });

  it('handles packages with selective resource filtering', () => {
    const filter: PackageFilter = {
      source: 'npm:@juicesharp/rpiv-todo',
      extensions: ['+index.ts'],
    };
    const settings: Settings = {
      packages: [filter],
    };

    const result = getPackagesFromSettings(settings, getPkgJson);

    expect(result).toHaveLength(1);
    expect(result[0].enabled).toBe(true);
    expect(result[0].resources.extensions).toEqual(['index.ts']);
  });

  it('returns empty array for empty settings', () => {
    const result = getPackagesFromSettings({}, getPkgJson);
    expect(result).toEqual([]);
  });

  it('handles packages without pi config gracefully', () => {
    const settings: Settings = {
      packages: ['npm:no-pi-config'],
    };

    const result = getPackagesFromSettings(settings, getPkgJson);

    expect(result).toHaveLength(1);
    expect(result[0].resources.extensions).toEqual([]);
    expect(result[0].resources.skills).toEqual([]);
  });

  it('reports version "unknown" for a string entry with no package.json', () => {
    const settings: Settings = {
      packages: ['npm:totally-missing'],
    };

    const result = getPackagesFromSettings(settings, getPkgJson);

    expect(result).toHaveLength(1);
    expect(result[0].version).toBe('unknown');
  });

  it('reports version "unknown" and empty resources for a filter entry with no package.json', () => {
    const filter: PackageFilter = {
      source: 'npm:totally-missing',
      extensions: ['+index.ts'],
    };
    const settings: Settings = { packages: [filter] };

    const result = getPackagesFromSettings(settings, getPkgJson);

    expect(result).toHaveLength(1);
    expect(result[0].version).toBe('unknown');
    expect(result[0].resources.skills).toEqual([]);
  });

  it('rejects PackageFilter entries with non-npm: sources', () => {
    const filter: PackageFilter = {
      source: 'not-a-valid-prefix/foo',
      extensions: ['+index.ts'],
    };
    const settings: Settings = {
      packages: [
        'npm:pi-lens',
        filter,
        {
          source: '/some/local/path',
          extensions: [],
          skills: [],
          prompts: [],
          themes: [],
        },
      ],
    };

    const result = getPackagesFromSettings(settings, getPkgJson);

    expect(result).toHaveLength(1);
    expect(result[0].source).toBe('npm:pi-lens');
  });

  it('rejects string entries with non-npm: sources', () => {
    const settings: Settings = {
      packages: ['npm:pi-lens', '/some/local/path'],
    };

    const result = getPackagesFromSettings(settings, getPkgJson);

    expect(result).toHaveLength(1);
    expect(result[0].source).toBe('npm:pi-lens');
  });
});
