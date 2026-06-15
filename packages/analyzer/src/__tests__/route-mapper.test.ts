import { describe, it, expect } from 'vitest';
import { extractRoutePath, isLayoutFile } from '../route-mapper.js';

describe('extractRoutePath', () => {
  it('extracts TanStack Router createFileRoute path', () => {
    const src = `export const Route = createFileRoute('/dashboard/accounts')({ component: Accounts })`;
    expect(extractRoutePath(src, '/app/src/routes/dashboard/accounts.tsx')).toBe('/dashboard/accounts');
  });

  it('extracts createLazyFileRoute path', () => {
    const src = `export const Route = createLazyFileRoute('/settings/profile')({ component: Profile })`;
    expect(extractRoutePath(src, '/app/src/routes/settings/profile.tsx')).toBe('/settings/profile');
  });

  it('extracts React Router path: property', () => {
    const src = `{ path: '/users/:id', component: UserDetail }`;
    expect(extractRoutePath(src, '/app/src/routes/users/detail.tsx')).toBe('/users/:id');
  });

  it('extracts Next.js Route = const', () => {
    const src = `export const Route = '/about'`;
    expect(extractRoutePath(src, '/app/src/routes/about.tsx')).toBe('/about');
  });

  it('falls back to file path relative to routes dir', () => {
    const src = `export default function Page() {}`;
    const result = extractRoutePath(src, '/app/src/routes/settings/profile.tsx');
    expect(result).toBe('/settings/profile');
  });

  it('strips index from file-based fallback', () => {
    const src = `export default function Home() {}`;
    const result = extractRoutePath(src, '/app/src/routes/index.tsx');
    expect(result).toBe('/');
  });

  it('uses provided routesDir for fallback', () => {
    const src = `export default function Page() {}`;
    const result = extractRoutePath(src, '/app/src/pages/about.tsx', '/app/src/pages');
    expect(result).toBe('/about');
  });
});

describe('isLayoutFile', () => {
  it('identifies __root__ as layout', () => {
    expect(isLayoutFile('/app/src/routes/__root__.tsx')).toBe(true);
  });

  it('identifies _layout as layout', () => {
    expect(isLayoutFile('/app/src/routes/_layout.tsx')).toBe(true);
  });

  it('identifies layout as layout', () => {
    expect(isLayoutFile('/app/src/routes/layout.tsx')).toBe(true);
  });

  it('identifies _app as layout', () => {
    expect(isLayoutFile('/app/src/routes/_app.tsx')).toBe(true);
  });

  it('does not flag regular route files', () => {
    expect(isLayoutFile('/app/src/routes/dashboard.tsx')).toBe(false);
    expect(isLayoutFile('/app/src/routes/settings/profile.tsx')).toBe(false);
  });
});
