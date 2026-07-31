import { SettingsManager } from '@earendil-works/pi-coding-agent';

/**
 * Method names on `SettingsManager` that write `defaultModel`, `defaultProvider`,
 * or `defaultThinkingLevel` to settings.json. These are the *only* places in pi
 * that write those three fields (verified against pi 0.80.6's source) — freezing
 * exactly these four methods is sufficient to make the three fields immutable
 * except via a direct settings.json edit.
 */
export const FROZEN_METHOD_NAMES = [
  'setDefaultModel',
  'setDefaultProvider',
  'setDefaultModelAndProvider',
  'setDefaultThinkingLevel',
] as const;

export type FrozenMethodName = (typeof FROZEN_METHOD_NAMES)[number];

/**
 * Structural shape `freezeDefaults` operates on: an object exposing the four
 * methods above. `SettingsManager.prototype` satisfies this, and so does any
 * test double built for unit tests.
 */
export type FreezableSettingsTarget = Record<FrozenMethodName, unknown>;

/**
 * Replaces the four default-persisting methods on `target` with no-ops, so
 * calling them no longer writes to settings.json. Read methods
 * (`getDefaultModel`, `getDefaultProvider`, `getDefaultThinkingLevel`) are left
 * untouched, so startup model/thinking-level resolution is unaffected.
 *
 * Throws if any of the four methods is missing from `target`, on the
 * assumption that pi's internals changed in a way this package can no longer
 * safely patch. See docs/adr/0001-freeze-defaults-via-prototype-patch.md for
 * why that's an acceptable failure mode here.
 */
export function freezeDefaults(target: FreezableSettingsTarget): void {
  for (const methodName of FROZEN_METHOD_NAMES) {
    if (typeof target[methodName] !== 'function') {
      throw new Error(
        `pi-frozen-defaults: expected SettingsManager.prototype.${methodName} to be a function, ` +
          'but it was not found. This likely means the installed version of pi changed how ' +
          'default persistence works internally, so pi-frozen-defaults can no longer safely ' +
          'patch it. See https://github.com/aaronkyriesenbach/pi-frozen-defaults for details.',
      );
    }
  }

  for (const methodName of FROZEN_METHOD_NAMES) {
    target[methodName] = (): void => {};
  }
}

/**
 * pi extension entry point. Freezes `defaultModel`, `defaultProvider`, and
 * `defaultThinkingLevel` persistence for the lifetime of the process.
 */
export default function (): void {
  freezeDefaults(SettingsManager.prototype);
}
