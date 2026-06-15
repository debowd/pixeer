/**
 * App context serializers.
 *
 * The same PixeerAppContext object is used in two places:
 *
 *   1. Bridge (dom.getContext) — full render: static knowledge + current view + element hints.
 *      Injected at the top of every context snapshot so the agent always has both global
 *      knowledge and current-screen specifics on every call.
 *
 *   2. System prompt (voice/tour agent) — static render only: app description, all routes,
 *      schemas. Baked in once at session start so the agent can plan multi-step flows before
 *      it even calls dom.getContext for the first time.
 *
 * Both produce similar-looking markdown blocks — same headings, same voice — so the agent
 * treats them as one coherent source of truth about the app.
 */

import type { PixeerAppContext, PixeerViewContext, InteractiveElement } from './types.js';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function resolveViewContext(appCtx: PixeerAppContext): PixeerViewContext | string | undefined {
  if (appCtx.getCurrentView) {
    return appCtx.getCurrentView();
  }
  if (appCtx.routes && typeof window !== 'undefined') {
    const path = window.location.pathname;
    const match = Object.entries(appCtx.routes)
      .filter(([r]) => path === r || path.startsWith(r.endsWith('/') ? r : r + '/'))
      .sort(([a], [b]) => b.length - a.length)[0];
    return match?.[1];
  }
  return undefined;
}

function appendSchemas(lines: string[], schemas: Record<string, string | object>): void {
  if (!Object.keys(schemas).length) return;
  lines.push('**Data schemas:**');
  for (const [name, schema] of Object.entries(schemas)) {
    lines.push(`- ${name}: ${typeof schema === 'string' ? schema : JSON.stringify(schema)}`);
  }
  lines.push('');
}

function appendRoutes(lines: string[], routes: Record<string, string | PixeerViewContext>): void {
  if (!Object.keys(routes).length) return;
  lines.push('**Navigation:**');
  for (const [route, def] of Object.entries(routes)) {
    const desc = typeof def === 'string' ? def : def.description;
    lines.push(`- \`${route}\` — ${desc}`);
  }
  lines.push('');
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Render the **static** parts of an app context to a markdown string.
 *
 * Includes: app description, full route/navigation map, data schemas.
 * Does NOT call `getCurrentView()` and does NOT include per-element hints —
 * those are dynamic and belong in the per-call dom.getContext snapshot.
 *
 * Use this to build the **system prompt** for voice/tour agents so they have
 * a mental model of the whole app before the first dom.getContext call.
 */
export function formatStaticAppContext(ctx: PixeerAppContext): string {
  const lines: string[] = ['## App Context'];

  if (ctx.app) {
    lines.push(`**App:** ${ctx.app}`);
    lines.push('');
  }

  if (ctx.routes) appendRoutes(lines, ctx.routes);
  if (ctx.schemas) appendSchemas(lines, ctx.schemas);

  return lines.join('\n').trimEnd();
}

/**
 * Render the **full** context header injected into every `dom.getContext` snapshot.
 *
 * Includes everything from `formatStaticAppContext` PLUS the current view description
 * (from `getCurrentView()` or path matching) and any `data-pixeer` element hints.
 *
 * Use this in the bridge to give the agent current-screen knowledge on every call.
 */
export function formatFullAppContext(
  ctx: PixeerAppContext,
  elements: InteractiveElement[] = [],
): string {
  const lines: string[] = ['## Pixeer App Context'];

  if (ctx.app) {
    lines.push(`**App:** ${ctx.app}`);
    lines.push('');
  }

  // Dynamic: current view
  const view = resolveViewContext(ctx);
  if (view) {
    if (typeof view === 'string') {
      lines.push(`**Current view:** ${view}`);
    } else {
      lines.push(`**Current view:** ${view.description}`);
      if (view.elements && Object.keys(view.elements).length > 0) {
        lines.push('');
        lines.push('**What elements do on this view:**');
        for (const [label, hint] of Object.entries(view.elements)) {
          lines.push(`- "${label}" → ${hint}`);
        }
      }
    }
    lines.push('');
  }

  if (ctx.routes) appendRoutes(lines, ctx.routes);
  if (ctx.schemas) appendSchemas(lines, ctx.schemas);

  // Element hints from data-pixeer attributes
  const hinted = elements.filter((el) => el.metadata?.hint);
  if (hinted.length > 0) {
    lines.push('**Element action hints (from page annotations):**');
    for (const el of hinted) {
      lines.push(`- "${el.name}" (${el.type}) → ${el.metadata!.hint}`);
    }
    lines.push('');
  }

  // Discoverable content: elements that are currently collapsed or control hidden panels.
  // This solves the "local horizon" problem — the agent knows what's reachable before clicking.
  const discoverable = elements.filter(
    (el) =>
      el.metadata?.expanded === 'false' ||
      (el.metadata?.hasPopup && el.metadata?.expanded !== 'true'),
  );
  if (discoverable.length > 0) {
    lines.push('**Discoverable content (click to reveal):**');
    for (const el of discoverable) {
      const popup = el.metadata?.hasPopup ? ` [opens ${el.metadata.hasPopup}]` : '';
      const controls = el.metadata?.controls ? ` → ${el.metadata.controls}` : '';
      lines.push(`- "${el.name}" is currently closed${popup}${controls}`);
    }
    lines.push('');
  }

  lines.push('---');
  lines.push('');
  return lines.join('\n');
}
