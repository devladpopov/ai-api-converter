const DANGEROUS_KEYS = new Set(['__proto__', 'constructor', 'prototype'])

/**
 * Safely merge `extra` fields into a result object.
 * - Filters out prototype pollution keys (__proto__, constructor, prototype)
 * - Only copies keys that are NOT already set on result (explicit fields win)
 */
export function mergeExtra(result: Record<string, unknown>, extra: Record<string, unknown>): void {
  for (const key of Object.keys(extra)) {
    if (DANGEROUS_KEYS.has(key)) continue
    if (!(key in result)) {
      result[key] = extra[key]
    }
  }
}
