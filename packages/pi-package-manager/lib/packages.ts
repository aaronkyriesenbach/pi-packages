import type { PackageInfo, PackageFilter, PackageJson, Settings } from './types';

/**
 * Parse settings.json and produce a list of installed packages with their
 * enabled/disabled state and resources.  Pure logic — no filesystem I/O.
 */
export function getPackagesFromSettings(
  settings: Settings,
  getPackageJson: (name: string) => PackageJson | null,
): PackageInfo[] {
  const entries = settings.packages ?? [];
  if (entries.length === 0) return [];

  return entries
    .filter((entry) => {
      const source = typeof entry === 'string' ? entry : entry.source;
      if (!source.startsWith('npm:')) return false;
      return true;
    })
    .map((entry) => {
      if (typeof entry === 'string') {
        return resolveStringEntry(entry, getPackageJson);
      }
      return resolveFilterEntry(entry, getPackageJson);
    });
}

function resolveStringEntry(
  source: string,
  getPackageJson: (name: string) => PackageJson | null,
): PackageInfo {
  // Callers only invoke this after filtering to entries whose source starts
  // with 'npm:' (see getPackagesFromSettings), so the prefix is always present.
  const name = source.slice(4);
  const pkgJson = getPackageJson(name);

  return {
    name,
    source,
    version: pkgJson?.version ?? 'unknown',
    enabled: true,
    resources: {
      extensions: pkgJson?.pi?.extensions ?? [],
      skills: pkgJson?.pi?.skills ?? [],
      prompts: pkgJson?.pi?.prompts ?? [],
      themes: pkgJson?.pi?.themes ?? [],
    },
  };
}

function resolveFilterEntry(
  filter: PackageFilter,
  getPackageJson: (name: string) => PackageJson | null,
): PackageInfo {
  // Callers only invoke this after filtering to entries whose source starts
  // with 'npm:' (see getPackagesFromSettings), so the prefix is always present.
  const name = filter.source.slice(4);
  const pkgJson = getPackageJson(name);
  const piResources = pkgJson?.pi;

  const extensions = resolveDeclared(piResources?.extensions ?? [], filter.extensions);
  const skills = resolveDeclared(piResources?.skills ?? [], filter.skills);
  const prompts = resolveDeclared(piResources?.prompts ?? [], filter.prompts);
  const themes = resolveDeclared(piResources?.themes ?? [], filter.themes);

  const enabled = !(
    isExplicitlyEmpty(filter.extensions) &&
    isExplicitlyEmpty(filter.skills) &&
    isExplicitlyEmpty(filter.prompts) &&
    isExplicitlyEmpty(filter.themes)
  );

  return {
    name,
    source: filter.source,
    version: pkgJson?.version ?? 'unknown',
    enabled,
    resources: { extensions, skills, prompts, themes },
  };
}

/**
 * If filter is defined and empty, return an empty array (filtered out).
 * Otherwise, resolve `+path` and `-path` entries against the declared list.
 */
export function resolveDeclared(declared: string[], filter: string[] | undefined): string[] {
  if (!filter) return declared;
  if (filter.length === 0) return [];

  // If the filter only contains force-include paths (+prefix),
  // use those directly as the active set.
  const forced = filter.map((f) => {
    if (f.startsWith('+')) return f.slice(1);
    if (f.startsWith('-')) return undefined;
    return f;
  });
  const explicit = forced.filter((f): f is string => f !== undefined);
  if (explicit.length > 0) return explicit;

  // Every entry mapped to `undefined` above, meaning every entry is an
  // exclusion (-prefix) — start from declared minus excluded.
  const excludes = filter.map((f) => f.slice(1));
  return declared.filter((d) => !excludes.includes(d));
}

function isExplicitlyEmpty(arr: string[] | undefined): boolean {
  return arr?.length === 0;
}
