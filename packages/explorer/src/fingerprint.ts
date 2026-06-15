import type { InteractiveElement } from 'pixeer';

/** FNV-1a 32-bit hash — fast, no dependencies, browser-safe. */
function fnv1a(str: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

/**
 * Produce a stable state ID from the current URL path and visible element names.
 * Same set of elements on the same path → same fingerprint, regardless of order.
 */
export function fingerprintState(url: string, elements: InteractiveElement[]): string {
  let path: string;
  try {
    path = new URL(url, 'http://x').pathname;
  } catch {
    path = url;
  }

  const names = elements
    .map((el) => el.name)
    .filter(Boolean)
    .sort()
    .join('\x00');

  return fnv1a(`${path}\x01${names}`);
}
