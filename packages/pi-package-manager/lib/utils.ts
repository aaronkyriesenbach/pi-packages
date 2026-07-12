import type { Settings } from "./types";

/**
 * Deep equality check for two Maps (same keys, same values).
 */
export function mapsEqual<K, V>(a: Map<K, V>, b: Map<K, V>): boolean {
	if (a.size !== b.size) return false;
	for (const [key, value] of a) {
		if (!b.has(key) || b.get(key) !== value) return false;
	}
	return true;
}

/**
 * Apply session overrides on top of persisted settings.
 * Returns a new Settings object — does not mutate the original.
 */
export function applyOverrides(
	settings: Settings,
	overrides: Map<string, boolean>,
): Settings {
	if (overrides.size === 0) return settings;
	const packages = [...(settings.packages ?? [])];
	for (const [source, enabled] of overrides) {
		const idx = packages.findIndex(
			(e) => (typeof e === "string" ? e : e.source) === source,
		);
		if (idx === -1) continue;
		if (enabled) {
			packages[idx] = source;
		} else {
			packages[idx] = {
				source,
				extensions: [],
				skills: [],
				prompts: [],
				themes: [],
			};
		}
	}
	return { ...settings, packages };
}
