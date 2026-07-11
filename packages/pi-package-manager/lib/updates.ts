import type { AutoUpdateConfig } from "./types";

/**
 * Compare two semver strings. Returns true if latest > current.
 * Handles pre-release tags by treating them as lower priority.
 */
export function isNewerVersion(current: string, latest: string): boolean {
  const curr = parseVersion(current);
  const lat = parseVersion(latest);

  // Compare major.minor.patch
  for (let i = 0; i < 3; i++) {
    const c = curr.segments[i] ?? 0;
    const l = lat.segments[i] ?? 0;
    if (l > c) return true;
    if (l < c) return false;
  }

  // Segments equal — pre-release is older than release
  if (curr.preRelease && !lat.preRelease) return true;
  if (!curr.preRelease && lat.preRelease) return false;

  return false;
}

interface ParsedVersion {
  segments: number[];
  preRelease: string | undefined;
}

function parseVersion(version: string): ParsedVersion {
  const [core, ...preParts] = version.split("-");
  const segments = core.split(".").map(Number);
  return {
    segments,
    preRelease: preParts.length > 0 ? preParts.join("-") : undefined,
  };
}

/**
 * Determine whether auto-update should trigger based on the config's
 * nextCheck timestamp.  Returns true when the interval has elapsed.
 */
export function shouldCheckForUpdates(config: AutoUpdateConfig): boolean {
  return config.enabled && Date.now() >= config.nextCheck;
}