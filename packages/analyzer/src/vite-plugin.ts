import path from 'node:path';
import type { Plugin } from 'vite';
import { analyze } from './analyzer.js';
import type { AnalyzerOptions } from './types.js';

export interface PixeerAnalyzerPluginOptions extends AnalyzerOptions {
  /**
   * Whether to print a summary after each analysis run.
   * @default true
   */
  verbose?: boolean;
}

export function pixeerAnalyzer(options: PixeerAnalyzerPluginOptions = {}): Plugin {
  const verbose = options.verbose ?? true;
  let cwd: string;
  let routePatterns: string[];
  let isRunning = false;

  async function run(trigger: string) {
    if (isRunning) return;
    isRunning = true;
    try {
      const result = await analyze({ ...options, cwd });
      if (verbose) {
        const cached = result.cacheHits > 0 ? ` (${result.cacheHits} cached)` : '';
        console.log(
          `[pixeer-analyzer] ${trigger}: ${result.routes.length} routes → ${result.outputPath}${cached} (${result.durationMs}ms)`,
        );
      }
    } catch (err) {
      console.error('[pixeer-analyzer] Analysis failed:', err);
    } finally {
      isRunning = false;
    }
  }

  return {
    name: 'pixeer-analyzer',
    async buildStart() {
      cwd = options.cwd ?? process.cwd();
      const patterns = Array.isArray(options.routes)
        ? options.routes
        : [options.routes ?? 'src/routes/**/*.tsx'];
      routePatterns = patterns.map(p => path.resolve(cwd, p));
      await run('build start');
    },
    async watchChange(id, { event }) {
      if (event === 'delete') return;
      // Only re-analyze when a route file changes
      const isRoute = routePatterns.some(pattern => {
        // Simple suffix check — good enough for typical route globs
        return id.startsWith(path.resolve(cwd, 'src/routes'));
      });
      if (isRoute) {
        await run(`changed ${path.relative(cwd, id)}`);
      }
    },
  };
}
