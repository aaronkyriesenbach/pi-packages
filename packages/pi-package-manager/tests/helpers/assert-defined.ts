/**
 * Narrow an indexed/optional read (`arr[i]`, `map.get(k)`, ...) to its
 * defined type, throwing if the value is actually absent. Exists because
 * `noUncheckedIndexedAccess` types every indexed read as possibly
 * `undefined`, even when a preceding `toHaveLength`/`expect` assertion has
 * already proven the index is in bounds.
 */
export function assertDefined<T>(value: T | undefined, message?: string): asserts value is T {
  if (value === undefined) {
    throw new Error(message ?? 'Expected value to be defined');
  }
}
