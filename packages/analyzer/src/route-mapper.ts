import path from 'node:path';

/**
 * Patterns that extract the route path from various router setups.
 * Checked in order; first match wins.
 */
const ROUTE_PATTERNS: RegExp[] = [
  // TanStack Router file routes: createFileRoute('/path')
  /createFileRoute\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/,
  // TanStack Router lazy: createLazyFileRoute('/path')
  /createLazyFileRoute\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/,
  // React Router / Remix: path: '/path'
  /\bpath\s*:\s*['"`]([^'"`]+)['"`]/,
  // Next.js / generic: Route = '/path'
  /\bRoute\s*=\s*['"`]([^'"`]+)['"`]/,
];

/**
 * Extract the URL route path from a component's source, falling back to
 * deriving it from the file path relative to the routes directory.
 */
export function extractRoutePath(source: string, filePath: string, routesDir?: string): string {
  for (const pattern of ROUTE_PATTERNS) {
    const m = source.match(pattern);
    if (m?.[1]) return m[1];
  }

  // File-based fallback
  const base = routesDir ?? findRoutesDir(filePath);
  const rel = path.relative(base, filePath);
  return (
    '/' +
    rel
      .replace(/\\/g, '/')
      .replace(/\.(tsx?|jsx?)$/, '')
      .replace(/\/index$/, '')
      .replace(/^index$/, '')
  );
}

function findRoutesDir(filePath: string): string {
  // Walk up until we find a 'routes' directory ancestor
  const parts = filePath.split(path.sep);
  const idx = parts.lastIndexOf('routes');
  if (idx !== -1) return parts.slice(0, idx + 1).join(path.sep);
  return path.dirname(filePath);
}

/**
 * Cheap heuristic: skip files that look like layout/root wrappers.
 * Returns true if the file should be excluded from analysis.
 */
export function isLayoutFile(filePath: string): boolean {
  const name = path.basename(filePath, path.extname(filePath)).toLowerCase();
  return name === '__root__' || name === '_layout' || name === 'layout' || name === '_app';
}
