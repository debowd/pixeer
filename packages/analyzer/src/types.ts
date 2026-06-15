import type { PixeerAppContext } from 'pixeer';

export type { PixeerAppContext };

export interface RouteAnalysis {
  /** Absolute path to the source file */
  filePath: string;
  /** URL path extracted from the file (e.g. '/dashboard/accounts') */
  routePath: string;
  /**
   * Element hints produced by LLM analysis.
   * Keys are accessible names; values are one-sentence descriptions.
   * Empty when LLM is not configured or the file yielded no elements.
   */
  elements: Record<string, string>;
  fromCache: boolean;
  durationMs: number;
}

export interface LlmOptions {
  /**
   * Anthropic API key. Falls back to ANTHROPIC_API_KEY env var.
   * When absent the analyzer still runs but produces no element descriptions.
   */
  apiKey?: string;
  /**
   * Anthropic model to use for analysis.
   * @default 'claude-sonnet-4-6'
   */
  model?: string;
  /** Max completion tokens. @default 2048 */
  maxTokens?: number;
  /**
   * Directory for caching LLM responses keyed by source hash.
   * @default '.pixeer-cache'
   */
  cacheDir?: string;
  /** Custom OpenAI-compatible base URL (e.g. local Ollama, OpenRouter). */
  baseUrl?: string;
}

export interface AnalyzerOptions {
  /**
   * Glob pattern(s) for route/component files to analyze.
   * @default 'src/routes/**\/*.tsx'
   */
  routes?: string | string[];
  /**
   * Output file path for the generated PixeerAppContext TypeScript constant.
   * @default 'src/__generated__/pixeer-context.ts'
   */
  output?: string;
  /**
   * Working directory used to resolve globs and relative paths.
   * @default process.cwd()
   */
  cwd?: string;
  /** LLM options for generating element descriptions. Optional — omit to skip LLM. */
  llm?: LlmOptions;
  /**
   * App name / description included as the `app` field in the generated context.
   * If omitted, the analyzer tries to extract it from the source (e.g. <title>).
   */
  app?: string;
  /**
   * Files/paths to skip (relative to cwd or absolute).
   * Useful for skipping layout files that are not routes.
   */
  ignore?: string[];
  /**
   * Called after each route file is analyzed.
   * Useful for CLI progress reporting.
   */
  onProgress?: (route: RouteAnalysis, index: number, total: number) => void;
}

export interface AnalyzerResult {
  appContext: PixeerAppContext;
  routes: RouteAnalysis[];
  outputPath: string;
  durationMs: number;
  cacheHits: number;
  llmCalls: number;
}
