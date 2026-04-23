/**
 * The bridge is the glue between your transport and the DOM engine.
 *
 * Call createPixeerBridge() with your transport and it registers all the
 * RPC methods your agent needs to understand and interact with the page:
 *
 *   dom.getContext        → page markdown + interactive elements
 *   dom.click             → click by selector or accessible name
 *   dom.type              → type into an input by selector or name
 *   dom.getComponentState → read React component props/state
 *   screen.capture        → screenshot as base64 JPEG (opt-in)
 *
 * When you're done, call bridge.dispose() to clean everything up.
 */

import { DomService } from './dom-service';
import { ScreenCapture } from './screen-capture';
import { PixeerAnalytics } from './analytics';
import { sendTelemetry } from './telemetry';
import type { PixeerTransport, PixeerBridgeOptions, PixeerBridge } from './types';
import type { PixeerEvent } from './analytics';

type ParseResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

function parsePayload<T>(payload: string): ParseResult<T> {
  try {
    const data = JSON.parse(payload) as T;
    return { ok: true, data };
  } catch {
    return { ok: false, error: 'Invalid JSON payload' };
  }
}

function safeMetaFromPayload(payload: string): Record<string, unknown> | undefined {
  try {
    const parsed = JSON.parse(payload);
    if (parsed && typeof parsed === 'object') {
      const { selector, name, direction, key } = parsed as Record<string, unknown>;
      const meta: Record<string, unknown> = {};
      if (selector) meta.selector = selector;
      if (name) meta.name = name;
      if (direction) meta.direction = direction;
      if (key) meta.key = key;
      return Object.keys(meta).length ? meta : undefined;
    }
  } catch {
    // ignore
  }
  return undefined;
}

function makeTracked(
  method: string,
  handler: (payload: string) => Promise<string>,
  analytics: PixeerAnalytics,
): (payload: string) => Promise<string> {
  return async (payload: string) => {
    const start = performance.now();
    const base: Omit<PixeerEvent, 'type' | 'durationMs' | 'success' | 'error'> = {
      method,
      sessionId: analytics.sessionId,
      timestamp: Date.now(),
      meta: safeMetaFromPayload(payload),
    };

    analytics.emit({ ...base, type: 'action:start' });

    try {
      const result = await handler(payload);
      const parsed = JSON.parse(result) as Record<string, unknown>;
      const success = parsed.success !== false && !parsed.error;
      const durationMs = performance.now() - start;

      analytics.emit({
        ...base,
        type: success ? 'action:success' : 'action:error',
        durationMs,
        success,
        error: typeof parsed.error === 'string' ? parsed.error : undefined,
      });

      return result;
    } catch (err) {
      analytics.emit({
        ...base,
        type: 'action:error',
        durationMs: performance.now() - start,
        success: false,
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  };
}

/**
 * Wire up your transport so your agent can see and interact with the page.
 * Pass any PixeerTransport and you're good to go.
 */
export function createPixeerBridge(
  transport: PixeerTransport,
  options?: PixeerBridgeOptions,
): PixeerBridge {
  const screenCapture = options?.enableScreenCapture
    ? new ScreenCapture({ quality: options?.captureQuality })
    : null;

  const analytics = options?.analytics ?? null;
  const transportName = options?.transportName ?? 'unknown';

  const track = analytics
    ? (method: string, handler: (p: string) => Promise<string>) =>
        makeTracked(method, handler, analytics)
    : (_method: string, handler: (p: string) => Promise<string>) => handler;

  sendTelemetry({
    event: 'bridge:init',
    transport: transportName,
    screenCapture: !!screenCapture,
  });

  if (analytics) {
    analytics.emit({
      type: 'bridge:init',
      method: 'bridge',
      sessionId: analytics.sessionId,
      timestamp: Date.now(),
      meta: { transport: transportName, screenCapture: !!screenCapture },
    });
  }

  transport.onMethod(
    'dom.getContext',
    track('dom.getContext', async () => {
      try {
        const context = await DomService.getPageContext();
        const elements = await DomService.getInteractiveElements();

        if (analytics) {
          analytics.emit({
            type: 'snapshot:taken',
            method: 'dom.getContext',
            sessionId: analytics.sessionId,
            timestamp: Date.now(),
            meta: {
              contextLength: context.length,
              elementCount: elements.length,
              estimatedTokens: Math.ceil(context.length / 4),
            },
          });
        }

        return JSON.stringify({ context, elements });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to get DOM context';
        return JSON.stringify({ error: message });
      }
    }),
  );

  transport.onMethod(
    'dom.click',
    track('dom.click', async (payload: string) => {
      try {
        const parsed = parsePayload<{ selector?: unknown; name?: unknown }>(payload);
        if (!parsed.ok) {
          return JSON.stringify({ success: false, error: parsed.error });
        }
        const { selector, name } = parsed.data;

        const selectorValue = typeof selector === 'string' ? selector.trim() : '';
        const nameValue = typeof name === 'string' ? name.trim() : '';

        let success: boolean;

        if (selectorValue) {
          success = DomService.click(selectorValue);
        } else if (nameValue) {
          success = await DomService.clickByName(nameValue);
        } else {
          return JSON.stringify({ success: false, error: 'No selector or name provided' });
        }

        return JSON.stringify({ success });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Click failed';
        return JSON.stringify({ success: false, error: message });
      }
    }),
  );

  transport.onMethod(
    'dom.type',
    track('dom.type', async (payload: string) => {
      try {
        const parsed = parsePayload<{ selector?: unknown; name?: unknown; text?: unknown }>(payload);
        if (!parsed.ok) {
          return JSON.stringify({ success: false, error: parsed.error });
        }
        const { selector, name, text } = parsed.data;

        const selectorValue = typeof selector === 'string' ? selector.trim() : '';
        const nameValue = typeof name === 'string' ? name.trim() : '';
        const textValue = typeof text === 'string' ? text : null;
        if (textValue === null) {
          return JSON.stringify({ success: false, error: 'Text must be a string' });
        }

        let success: boolean;

        if (selectorValue) {
          success = DomService.type(selectorValue, textValue);
        } else if (nameValue) {
          success = await DomService.typeByName(nameValue, textValue);
        } else {
          return JSON.stringify({ success: false, error: 'No selector or name provided' });
        }

        return JSON.stringify({ success });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Type failed';
        return JSON.stringify({ success: false, error: message });
      }
    }),
  );

  transport.onMethod(
    'dom.getComponentState',
    track('dom.getComponentState', async (payload: string) => {
      try {
        const parsed = parsePayload<{ componentName?: unknown }>(payload);
        if (!parsed.ok) {
          return JSON.stringify({ error: parsed.error });
        }
        const componentName =
          typeof parsed.data.componentName === 'string' ? parsed.data.componentName.trim() : '';
        if (!componentName) {
          return JSON.stringify({ error: 'componentName is required' });
        }

        const state = await DomService.getComponentState(componentName);
        return JSON.stringify({ state });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to get component state';
        return JSON.stringify({ error: message });
      }
    }),
  );

  transport.onMethod(
    'dom.scroll',
    track('dom.scroll', async (payload: string) => {
      try {
        const parsed = parsePayload<{
          selector?: unknown;
          name?: unknown;
          direction?: unknown;
          amount?: unknown;
        }>(payload);
        if (!parsed.ok) {
          return JSON.stringify({ success: false, error: parsed.error });
        }
        const { selector, name, direction, amount } = parsed.data;

        const dir = typeof direction === 'string' ? direction.trim() : '';
        if (!['up', 'down', 'left', 'right'].includes(dir)) {
          return JSON.stringify({ success: false, error: 'Invalid direction' });
        }

        const selectorValue = typeof selector === 'string' ? selector.trim() : '';
        const nameValue = typeof name === 'string' ? name.trim() : '';
        const amountValue = typeof amount === 'number' ? amount : 300;

        let success: boolean;
        if (nameValue) {
          success = await DomService.scrollByName(
            nameValue,
            dir as 'up' | 'down' | 'left' | 'right',
            amountValue,
          );
        } else {
          success = DomService.scroll(
            selectorValue || null,
            dir as 'up' | 'down' | 'left' | 'right',
            amountValue,
          );
        }

        return JSON.stringify({ success });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Scroll failed';
        return JSON.stringify({ success: false, error: message });
      }
    }),
  );

  transport.onMethod(
    'dom.pressKey',
    track('dom.pressKey', async (payload: string) => {
      try {
        const parsed = parsePayload<{
          selector?: unknown;
          name?: unknown;
          key?: unknown;
        }>(payload);
        if (!parsed.ok) {
          return JSON.stringify({ success: false, error: parsed.error });
        }
        const { selector, name, key } = parsed.data;

        const keyValue = typeof key === 'string' ? key.trim() : '';
        if (!keyValue) {
          return JSON.stringify({ success: false, error: 'key is required' });
        }

        const selectorValue = typeof selector === 'string' ? selector.trim() : '';
        const nameValue = typeof name === 'string' ? name.trim() : '';

        let success: boolean;
        if (nameValue) {
          success = await DomService.pressKeyByName(nameValue, keyValue);
        } else {
          success = DomService.pressKey(selectorValue || null, keyValue);
        }

        return JSON.stringify({ success });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'pressKey failed';
        return JSON.stringify({ success: false, error: message });
      }
    }),
  );

  if (screenCapture) {
    transport.onMethod(
      'screen.capture',
      track('screen.capture', async () => {
        try {
          const image = await screenCapture.capture();
          return JSON.stringify({ image });
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Screen capture failed';
          return JSON.stringify({ error: message });
        }
      }),
    );
  }

  return {
    analytics: analytics ?? undefined,
    dispose() {
      screenCapture?.dispose();
      transport.dispose();
      if (analytics) {
        analytics.emit({
          type: 'bridge:dispose',
          method: 'bridge',
          sessionId: analytics.sessionId,
          timestamp: Date.now(),
        });
      }
      sendTelemetry({ event: 'bridge:dispose', transport: transportName });
    },
  };
}
