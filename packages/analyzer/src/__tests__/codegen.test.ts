import { describe, it, expect } from 'vitest';
import { generateContextModule } from '../codegen.js';
import type { PixeerAppContext } from 'pixeer';

describe('generateContextModule', () => {
  it('generates a valid TypeScript module', () => {
    const ctx: PixeerAppContext = {
      app: 'My App',
      routes: {
        '/': 'Home page',
        '/dashboard': {
          description: 'Dashboard route',
          elements: { 'New Project': 'Creates a new project' },
        },
      },
    };

    const output = generateContextModule(ctx);
    expect(output).toContain('AUTO-GENERATED');
    expect(output).toContain("import type { PixeerAppContext } from 'pixeer'");
    expect(output).toContain('export const pixeerAppContext =');
    expect(output).toContain('satisfies PixeerAppContext');
    expect(output).toContain('"app": "My App"');
    expect(output).toContain('"New Project"');
  });

  it('produces parseable JSON inside the module', () => {
    const ctx: PixeerAppContext = { app: 'test', routes: { '/about': 'About' } };
    const output = generateContextModule(ctx);
    // Extract the JSON portion
    const match = output.match(/export const pixeerAppContext = (.+) satisfies/s);
    expect(match).toBeTruthy();
    expect(() => JSON.parse(match![1])).not.toThrow();
  });

  it('ends with a newline', () => {
    const ctx: PixeerAppContext = { app: 'x', routes: {} };
    expect(generateContextModule(ctx).endsWith('\n')).toBe(true);
  });
});
