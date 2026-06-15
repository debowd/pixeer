import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Mock the LLM so tests don't make real API calls
vi.mock('../llm.js', () => ({
  callLlm: vi.fn<() => Promise<Record<string, string>>>().mockResolvedValue({
    'Save': 'Saves the current document',
    'Cancel': 'Discards changes and closes',
  }),
}));

import { analyze } from '../analyzer.js';
import { callLlm } from '../llm.js';

const mockedCallLlm = vi.mocked(callLlm);

let tmpDir: string;

function makeRouteFile(dir: string, name: string, content: string) {
  const routesDir = path.join(dir, 'src', 'routes');
  fs.mkdirSync(routesDir, { recursive: true });
  fs.writeFileSync(path.join(routesDir, name), content, 'utf8');
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pixeer-analyzer-test-'));
  // Fake package.json
  fs.writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify({ name: 'test-app' }));
  mockedCallLlm.mockClear();
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('analyze()', () => {
  it('discovers route files and writes output', async () => {
    makeRouteFile(tmpDir, 'dashboard.tsx', `export const Route = createFileRoute('/dashboard')({ component: D })`);

    const result = await analyze({
      cwd: tmpDir,
      routes: 'src/routes/**/*.tsx',
      output: 'out/context.ts',
    });

    expect(result.routes).toHaveLength(1);
    expect(result.routes[0].routePath).toBe('/dashboard');
    expect(fs.existsSync(path.join(tmpDir, 'out', 'context.ts'))).toBe(true);
  });

  it('skips layout files', async () => {
    makeRouteFile(tmpDir, '__root__.tsx', `export function Root() {}`);
    makeRouteFile(tmpDir, 'home.tsx', `export const Route = createFileRoute('/')({ component: Home })`);

    const result = await analyze({ cwd: tmpDir });
    const paths = result.routes.map(r => r.routePath);
    expect(paths).not.toContain('/__root__');
    expect(paths).toContain('/');
  });

  it('calls LLM when llm option is provided with apiKey', async () => {
    makeRouteFile(tmpDir, 'settings.tsx', `export const Route = createFileRoute('/settings')({ component: S })`);

    await analyze({
      cwd: tmpDir,
      llm: { apiKey: 'test-key' },
    });

    expect(mockedCallLlm).toHaveBeenCalledOnce();
    expect(mockedCallLlm).toHaveBeenCalledWith(
      expect.stringContaining('createFileRoute'),
      '/settings',
      expect.objectContaining({ apiKey: 'test-key' }),
    );
  });

  it('uses cache on second run for same file', async () => {
    makeRouteFile(tmpDir, 'profile.tsx', `export const Route = createFileRoute('/profile')({ component: P })`);

    const opts = { cwd: tmpDir, llm: { apiKey: 'key', cacheDir: '.cache' } };
    await analyze(opts);
    mockedCallLlm.mockClear();
    await analyze(opts);

    expect(mockedCallLlm).not.toHaveBeenCalled();
  });

  it('skips LLM when no llm option is provided', async () => {
    makeRouteFile(tmpDir, 'about.tsx', `export const Route = createFileRoute('/about')({ component: A })`);

    const result = await analyze({ cwd: tmpDir });
    expect(mockedCallLlm).not.toHaveBeenCalled();
    expect(result.routes[0].elements).toEqual({});
    expect(result.llmCalls).toBe(0);
  });

  it('builds appContext with correct app name from package.json', async () => {
    makeRouteFile(tmpDir, 'index.tsx', `export const Route = createFileRoute('/')({ component: Home })`);

    const result = await analyze({ cwd: tmpDir });
    expect(result.appContext.app).toBe('test-app');
  });

  it('uses provided app name over package.json', async () => {
    makeRouteFile(tmpDir, 'index.tsx', `export const Route = createFileRoute('/')({ component: Home })`);

    const result = await analyze({ cwd: tmpDir, app: 'Custom App' });
    expect(result.appContext.app).toBe('Custom App');
  });

  it('writes valid TypeScript with satisfies PixeerAppContext', async () => {
    makeRouteFile(tmpDir, 'dash.tsx', `export const Route = createFileRoute('/dash')({ component: D })`);

    const result = await analyze({ cwd: tmpDir });
    const content = fs.readFileSync(result.outputPath, 'utf8');
    expect(content).toContain('satisfies PixeerAppContext');
    expect(content).toContain('AUTO-GENERATED');
  });

  it('respects ignore list', async () => {
    makeRouteFile(tmpDir, 'secret.tsx', `export const Route = createFileRoute('/secret')({ component: S })`);
    makeRouteFile(tmpDir, 'public.tsx', `export const Route = createFileRoute('/public')({ component: P })`);

    const result = await analyze({
      cwd: tmpDir,
      ignore: [path.join(tmpDir, 'src', 'routes', 'secret.tsx')],
    });

    const paths = result.routes.map(r => r.routePath);
    expect(paths).not.toContain('/secret');
    expect(paths).toContain('/public');
  });

  it('reports timing stats', async () => {
    makeRouteFile(tmpDir, 'timed.tsx', `export const Route = createFileRoute('/timed')({ component: T })`);

    const result = await analyze({ cwd: tmpDir });
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(result.routes[0].durationMs).toBeGreaterThanOrEqual(0);
  });
});
