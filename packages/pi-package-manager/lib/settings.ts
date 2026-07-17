import type { PackageFilter, Settings } from './types';

/**
 * Toggle a package's enabled state in the settings.packages array.
 *
 * - String entry → disabled: converted to filter form with empty resource arrays
 * - Filter entry with all empty arrays → enabled: converted back to string
 * - Otherwise → disabled: replaced with empty filter form
 *
 * Mutates the settings object in place and returns the new enabled state.
 */
export function isAllResourcesEmpty(entry: PackageFilter): boolean {
  return (
    entry.extensions?.length === 0 &&
    entry.skills?.length === 0 &&
    entry.prompts?.length === 0 &&
    entry.themes?.length === 0
  );
}

export function isFilterEnabled(entry: PackageFilter): boolean {
  return !isAllResourcesEmpty(entry);
}

export function togglePackage(settings: Settings, source: string): boolean {
  if (!settings.packages) return false;

  const idx = settings.packages.findIndex((entry) =>
    typeof entry === 'string' ? entry === source : entry.source === source,
  );

  if (idx === -1) return false;

  const entry = settings.packages[idx];

  if (typeof entry === 'string') {
    // Disable: convert to empty filter
    settings.packages[idx] = {
      source,
      extensions: [],
      skills: [],
      prompts: [],
      themes: [],
    };
    return false;
  }

  // Check if currently disabled (all arrays explicitly empty)
  if (
    entry.extensions?.length === 0 &&
    entry.skills?.length === 0 &&
    entry.prompts?.length === 0 &&
    entry.themes?.length === 0
  ) {
    // Enable: convert back to string
    settings.packages[idx] = source;
    return true;
  }

  // Has selective filtering — disable entirely
  settings.packages[idx] = {
    source: entry.source,
    extensions: [],
    skills: [],
    prompts: [],
    themes: [],
  };
  return false;
}
