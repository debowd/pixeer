import fs from 'node:fs';
import path from 'node:path';
import fg from 'fast-glob';
import type { PixeerAppContext, PixeerViewContext } from 'pixeer';
import { hashSource, readCache, writeCache } from './cache.js';
import { callLlm } from './llm.js';
import { generateContextModule } from './codegen.js';
import { extractRoutePath, isLayoutFile } from './route-mapper.js';
import type { AnalyzerOptions, AnalyzerResult, RouteAnalysis } from './types.js';

const DEFAULT_ROUTES = 'src/routes/**/*.tsx';
const DEFAULT_OUTPUT = 'src/__generated__/pixeer-context.ts';
const DEFAULT_CACHE_DIR = '.pixeer-cache';

export async function analyze(options: AnalyzerOptions = {}): Promise<AnalyzerResult> {
  const startTime = Date.now();
  const cwd = options.cwd ?? process.cwd();
  const outputRel = options.output ?? DEFAULT_OUTPUT;
  const outputPath = path.resolve(cwd, outputRel);
  const cacheDir = path.resolve(cwd, options.llm?.cacheDir ?? DEFAULT_CACHE_DIR);
  const ignoreSet = new Set((options.ignore ?? []).map(p => path.resolve(cwd, p)));

  // Discover route files
  const patterns = Array.isArray(options.routes)
    ? options.routes
    : [options.routes ?? DEFAULT_ROUTES];

  const files = await fg(patterns, { cwd, absolute: true, onlyFiles: true });

  let cacheHits = 0;
  let llmCalls = 0;
  const routes: RouteAnalysis[] = [];

  for (const filePath of files) {
    if (ignoreSet.has(filePath)) continue;
    if (isLayoutFile(filePath)) continue;

    const fileStart = Date.now();
    const source = fs.readFileSync(filePath, 'utf8');
    const routePath = extractRoutePath(source, filePath);

    let elements: Record<string, string> = {};
    let fromCache = false;

    if (options.llm) {
      const model = options.llm.model ?? 'claude-sonnet-4-6';
      const key = hashSource(source, model);
      const cached = readCache(cacheDir, key);

      if (cached) {
        elements = cached.elements;
        fromCache = true;
        cacheHits++;
      } else {
        elements = await callLlm(source, routePath, options.llm);
        writeCache(cacheDir, key, { elements, model, timestamp: Date.now() });
        llmCalls++;
      }
    }

    const routeAnalysis: RouteAnalysis = {
      filePath,
      routePath,
      elements,
      fromCache,
      durationMs: Date.now() - fileStart,
    };
    routes.push(routeAnalysis);
    options.onProgress?.(routeAnalysis, routes.length - 1, files.length);
  }

  // Build PixeerAppContext
  const appName = options.app ?? extractAppName(files, cwd);
  const appContext = buildAppContext(appName, routes);

  // Write output
  const generated = generateContextModule(appContext);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, generated, 'utf8');

  return {
    appContext,
    routes,
    outputPath,
    durationMs: Date.now() - startTime,
    cacheHits,
    llmCalls,
  };
}

function buildAppContext(app: string, routes: RouteAnalysis[]): PixeerAppContext {
  const views: Record<string, PixeerViewContext | string> = {};

  for (const route of routes) {
    const hasElements = Object.keys(route.elements).length > 0;
    if (hasElements) {
      views[route.routePath] = {
        description: `Route ${route.routePath}`,
        elements: route.elements,
      };
    } else {
      views[route.routePath] = `Route ${route.routePath}`;
    }
  }

  return { app, routes: views };
}

function extractAppName(files: string[], cwd: string): string {
  // Try package.json name
  const pkgPath = path.join(cwd, 'package.json');
  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8')) as { name?: string };
    if (pkg.name) return pkg.name;
  } catch {
    // ignore
  }
  // Fallback to directory name
  return path.basename(cwd);
}
