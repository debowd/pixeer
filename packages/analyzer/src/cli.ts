import path from 'node:path';
import { analyze } from './analyzer.js';
import type { AnalyzerOptions, LlmOptions, RouteAnalysis } from './types.js';

// ─── ANSI / terminal helpers ──────────────────────────────────────────────────

const isTTY = process.stdout.isTTY;
const c = {
  reset: (s: string) => `\x1b[0m${s}\x1b[0m`,
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  cyan: (s: string) => `\x1b[36m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  blue: (s: string) => `\x1b[34m${s}\x1b[0m`,
  magenta: (s: string) => `\x1b[35m${s}\x1b[0m`,
  gray: (s: string) => `\x1b[90m${s}\x1b[0m`,
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
};

class Spinner {
  private frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  private i = 0;
  private timer: NodeJS.Timeout | null = null;
  private currentText = '';

  start(text: string) {
    this.currentText = text;
    if (!isTTY) { process.stdout.write(`  ${text}…\n`); return; }
    this.timer = setInterval(() => {
      process.stdout.write(`\r  ${c.cyan(this.frames[this.i++ % this.frames.length])} ${this.currentText} `);
    }, 80);
  }

  update(text: string) {
    this.currentText = text;
    if (!isTTY) process.stdout.write(`  ${text}…\n`);
  }

  succeed(text: string) {
    this.stop();
    process.stdout.write(`\r  ${c.green('✓')} ${text}\n`);
  }

  warn(text: string) {
    this.stop();
    process.stdout.write(`\r  ${c.yellow('⚠')} ${text}\n`);
  }

  fail(text: string) {
    this.stop();
    process.stdout.write(`\r  ${c.red('✗')} ${text}\n`);
  }

  stop() {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
    if (isTTY) process.stdout.write('\r\x1b[2K');
  }
}

function printBanner() {
  console.log();
  console.log(c.bold(c.magenta('  ◆ pixeer-analyze')));
  console.log(c.gray('  Build-time route analyzer → PixeerAppContext'));
  console.log();
}

function printRouteResult(route: RouteAnalysis, cwd: string) {
  const rel = path.relative(cwd, route.filePath);
  const count = Object.keys(route.elements).length;
  const tag = route.fromCache
    ? c.dim(c.blue('cached'))
    : count > 0
    ? c.green(`${count} elements`)
    : c.gray('no LLM');
  const timing = route.durationMs > 0 ? c.gray(` ${route.durationMs}ms`) : '';
  console.log(
    `  ${c.cyan(route.routePath.padEnd(32))} ${c.gray(rel)}  ${tag}${timing}`,
  );
}

function printSummary(result: {
  routes: RouteAnalysis[];
  outputPath: string;
  durationMs: number;
  cacheHits: number;
  llmCalls: number;
}, cwd: string) {
  const totalElements = result.routes.reduce((n, r) => n + Object.keys(r.elements).length, 0);
  const relOut = path.relative(cwd, result.outputPath);

  console.log();
  console.log('  ' + '─'.repeat(56));
  console.log();
  const cols = [
    [c.bold(String(result.routes.length)), 'routes'],
    [c.bold(String(totalElements)), 'elements'],
    [c.bold(String(result.llmCalls)), 'LLM calls'],
    [c.bold(String(result.cacheHits)), 'cached'],
    [c.bold(`${result.durationMs}ms`), 'total'],
  ];
  console.log('  ' + cols.map(([n, l]) => `${n} ${c.gray(l)}`).join(c.gray('  ·  ')));
  console.log();
  console.log(`  ${c.green('→')} ${c.bold(relOut)}`);
  console.log();
}

// ─── CLI args ────────────────────────────────────────────────────────────────

function parseArgs(argv: string[]): AnalyzerOptions & { help?: boolean; verbose?: boolean } {
  const args = argv.slice(2);
  const opts: AnalyzerOptions & { help?: boolean; verbose?: boolean } = {};
  const llm: LlmOptions = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const next = args[i + 1];

    switch (arg) {
      case '--help': case '-h': opts.help = true; break;
      case '--verbose': case '-v': opts.verbose = true; break;
      case '--routes': opts.routes = next; i++; break;
      case '--output': opts.output = next; i++; break;
      case '--cwd': opts.cwd = next; i++; break;
      case '--app': opts.app = next; i++; break;
      case '--api-key': llm.apiKey = next; i++; break;
      case '--model': llm.model = next; i++; break;
      case '--max-tokens': llm.maxTokens = parseInt(next, 10); i++; break;
      case '--cache-dir': llm.cacheDir = next; i++; break;
      case '--base-url': llm.baseUrl = next; i++; break;
      case '--no-llm': /* skip */ break;
    }
  }

  const hasLlmConfig = Object.keys(llm).length > 0;
  const hasEnvKey = !!(process.env.ANTHROPIC_API_KEY ?? process.env.OPENROUTER_API_KEY);
  if (hasLlmConfig || hasEnvKey) opts.llm = llm;

  return opts;
}

const HELP = `
${c.bold(c.magenta('pixeer-analyze'))} — build-time Pixeer context generator

${c.bold('Usage:')}
  pixeer-analyze [options]

${c.bold('Options:')}
  ${c.cyan('--routes')} ${c.gray('<glob>')}       Glob for route files ${c.gray('(default: src/routes/**/*.tsx)')}
  ${c.cyan('--output')} ${c.gray('<path>')}       Output file ${c.gray('(default: src/__generated__/pixeer-context.ts)')}
  ${c.cyan('--cwd')} ${c.gray('<dir>')}           Working directory ${c.gray('(default: cwd)')}
  ${c.cyan('--app')} ${c.gray('<name>')}          App name for PixeerAppContext
  ${c.cyan('--api-key')} ${c.gray('<key>')}       Anthropic/OpenRouter API key
  ${c.cyan('--model')} ${c.gray('<model>')}       LLM model ${c.gray('(default: claude-sonnet-4-6)')}
  ${c.cyan('--max-tokens')} ${c.gray('<n>')}      Max completion tokens
  ${c.cyan('--cache-dir')} ${c.gray('<dir>')}     LLM cache directory ${c.gray('(default: .pixeer-cache)')}
  ${c.cyan('--base-url')} ${c.gray('<url>')}      Custom base URL ${c.gray('(OpenRouter, Ollama, etc.)')}
  ${c.cyan('--no-llm')}              Skip LLM even if API key is set
  ${c.cyan('-v, --verbose')}         Print per-route details
  ${c.cyan('-h, --help')}            Show this help

${c.bold('Examples:')}
  ${c.gray('# Static only (no LLM)')}
  pixeer-analyze

  ${c.gray('# With Anthropic')}
  pixeer-analyze --model claude-opus-4-7

  ${c.gray('# With OpenRouter + Gemma 4')}
  pixeer-analyze --base-url https://openrouter.ai/api/v1 --model google/gemma-4-31b-it

  ${c.gray('# Custom routes glob')}
  pixeer-analyze --routes "src/pages/**/*.tsx" --output src/pixeer-context.ts
`.trim();

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const opts = parseArgs(process.argv);
  const cwd = opts.cwd ?? process.cwd();

  if (opts.help) { console.log(HELP); process.exit(0); }

  printBanner();

  const spin = new Spinner();
  spin.start('Discovering route files');

  const completedRoutes: RouteAnalysis[] = [];

  try {
    const result = await analyze({
      ...opts,
      cwd,
      onProgress(route, index, total) {
        completedRoutes.push(route);
        const rel = path.relative(cwd, route.filePath);
        const status = route.fromCache ? 'cached' : opts.llm ? 'analyzed' : 'scanned';
        spin.update(`[${index + 1}/${total}] ${status} ${c.cyan(rel)}`);
      },
    });

    spin.stop();

    for (const route of result.routes) {
      printRouteResult(route, cwd);
    }

    printSummary(result, cwd);
  } catch (err) {
    spin.fail('Analysis failed');
    console.error(c.red(`  ${String(err)}`));
    process.exit(1);
  }
}

main();
