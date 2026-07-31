import { isFilterEnabled } from './settings';
import { resolveDeclared } from './packages';
import type { PackageFilter, PackageInfo, PackageJson } from './types';

/**
 * Resolve a single package entry (string or PackageFilter) into a PackageInfo.
 *
 * Reads the package.json via the injected callback, applies isFilterEnabled
 * to determine persisted enabled state, then checks session overrides.
 *
 * This is the runtime resolver — it reads the filesystem via the callback.
 * For pure listing without I/O, see getPackagesFromSettings in lib/packages.ts.
 */
export async function resolvePackageEntry(
  entry: string | PackageFilter,
  sessionOverrides: Map<string, boolean>,
  readPackageJson: (pkgName: string) => Promise<PackageJson | null>,
): Promise<PackageInfo | null> {
  const source = typeof entry === 'string' ? entry : entry.source;
  if (!source.startsWith('npm:')) return null;
  const name = source.slice(4);

  const pkgJson = await readPackageJson(name);
  const persistedEnabled = typeof entry === 'string' ? true : isFilterEnabled(entry);
  const sessionOverride = sessionOverrides.get(source);
  const enabled = sessionOverride ?? persistedEnabled;

  const resources =
    typeof entry === 'string'
      ? {
          extensions: pkgJson?.pi?.extensions ?? [],
          skills: pkgJson?.pi?.skills ?? [],
          prompts: pkgJson?.pi?.prompts ?? [],
          themes: pkgJson?.pi?.themes ?? [],
        }
      : {
          extensions: resolveDeclared(pkgJson?.pi?.extensions ?? [], entry.extensions),
          skills: resolveDeclared(pkgJson?.pi?.skills ?? [], entry.skills),
          prompts: resolveDeclared(pkgJson?.pi?.prompts ?? [], entry.prompts),
          themes: resolveDeclared(pkgJson?.pi?.themes ?? [], entry.themes),
        };

  return {
    name,
    source,
    version: pkgJson?.version ?? 'unknown',
    enabled,
    resources,
  };
}
