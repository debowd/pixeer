# Pixeer

[![CI](https://github.com/debowd/pixeer/actions/workflows/ci.yml/badge.svg)](https://github.com/debowd/pixeer/actions/workflows/ci.yml)
[![codecov](https://codecov.io/gh/debowd/pixeer/branch/main/graph/badge.svg)](https://codecov.io/gh/debowd/pixeer)
[![npm](https://img.shields.io/npm/v/pixeer)](https://www.npmjs.com/package/pixeer)
[![npm downloads](https://img.shields.io/npm/dw/pixeer)](https://www.npmjs.com/package/pixeer)
[![License](https://img.shields.io/github/license/debowd/pixeer)](LICENSE)

Transport-agnostic DOM understanding and screen capture for AI agents.

Pixeer lets any web app give an AI agent the ability to **see** and **interact** with the page — without coupling to a specific transport, framework, or browser automation stack.

## Features

- **DOM-to-Markdown** — converts live page content to semantic markdown optimized for LLM consumption
- **Interactive Element Discovery** — finds all clickable/typeable elements with accessible names and selectors
- **Click & Type** — interact with elements by CSS selector or accessible name
- **React State Inspection** — read component props/state via the React fiber tree
- **Screen Capture** — capture the screen as base64 JPEG for vision models
- **Transport-Agnostic** — plug in any transport (LiveKit built-in; WebSocket, postMessage, and more coming soon)
- **SSR-Safe** — all browser APIs are guarded; safe to import on the server
- **Tiny** — ~9KB minified

## Why Pixeer?

Every major AI browser tool — Stagehand, Browser-Use, Playwright MCP, AgentQL — automates browsers **from the outside** via CDP or Playwright. They need headless browser infrastructure, cloud sessions, or Docker containers.

Pixeer runs **inside the page**. No headless browsers, no cloud sessions, no extensions. Just drop it into your app and your AI agent gets eyes and hands in the user's actual browser tab, over any transport you choose.

| | Pixeer | Stagehand | Browser-Use | Playwright MCP | AgentQL |
|---|---|---|---|---|---|
| Runs client-side | Yes | No | No | No | No |
| Embeddable via npm | Yes | No | No | No | No |
| DOM-to-markdown | Yes | No | No | No | No |
| Element discovery | Yes | Yes | Yes | Yes | Yes |
| Screen capture | Yes | Yes | Yes | Yes | No |
| React state inspection | Yes | No | No | No | No |
| Transport-agnostic | Yes | No | No | No | No |
| No infrastructure needed | Yes | No | No | No | No |
| Bundle size | ~9KB | ~150MB+ | Python | ~150MB+ | Playwright + API |

## What Pixeer Is For

- Giving your AI agent real-time awareness of what the user sees on the page
- Letting an agent click buttons, fill forms, and navigate UI on behalf of the user
- Building AI copilots, tutors, assistants, or support agents that understand your app
- Sending page context to a remote AI over any transport you already use
- Adding agent vision (screen capture) to existing real-time apps

## What Pixeer Is Not

- Not a web scraper or crawler — use [Firecrawl](https://github.com/mendableai/firecrawl) or [Crawl4AI](https://github.com/unclecode/crawl4ai) for that
- Not a browser automation tool — use [Playwright](https://playwright.dev), [Stagehand](https://github.com/browserbase/stagehand), or [Browser-Use](https://github.com/browser-use/browser-use) if you need headless browsers
- Not a Chrome extension — it's an npm package you embed in your own app
- Not an AI model — it gives your agent eyes and hands, you bring the brain

## Install

| Package Manager | Command |
|---|---|
| npm | `npm install pixeer` |
| pnpm | `pnpm add pixeer` |
| yarn | `yarn add pixeer` |
| bun | `bun add pixeer` |
| deno | `deno add npm:pixeer` |

With the LiveKit transport adapter (requires `livekit-client` >= 2.9.0):

| Package Manager | Command |
|---|---|
| npm | `npm install pixeer livekit-client` |
| pnpm | `pnpm add pixeer livekit-client` |
| yarn | `yarn add pixeer livekit-client` |
| bun | `bun add pixeer livekit-client` |
| deno | `deno add npm:pixeer npm:livekit-client` |

## Quick Start

### With LiveKit

```typescript
import { createPixeerBridge, createLiveKitTransport } from 'pixeer';

// After connecting to a LiveKit room:
const transport = createLiveKitTransport(room);
const bridge = createPixeerBridge(transport, {
  enableScreenCapture: true,
});

// The AI agent can now call these RPC methods:
//   dom.getContext       → page markdown + interactive elements
//   dom.click            → click by selector or accessible name
//   dom.type             → type into input by selector or name
//   dom.getComponentState → React component props/state
//   screen.capture       → screenshot as base64 JPEG

// Clean up when done:
bridge.dispose();
```

### With a Custom Transport

> **Note:** Only the LiveKit transport is available today. Additional first-party transports (WebSocket, postMessage, etc.) are on the roadmap. In the meantime you can bring your own by implementing the `PixeerTransport` interface:

```typescript
import { createPixeerBridge, type PixeerTransport } from 'pixeer';

const transport: PixeerTransport = {
  onMethod(method, handler) {
    // Wire `handler` to your transport's incoming messages
    mySocket.on(method, async (payload) => {
      const result = await handler(payload);
      mySocket.send(method + ':response', result);
    });
  },
  dispose() {
    // Clean up listeners
  },
};

const bridge = createPixeerBridge(transport);
```

### Using DomService Directly

```typescript
import { DomService } from 'pixeer';

// Get page content as semantic markdown
const markdown = await DomService.getPageContext();

// Find all interactive elements
const elements = await DomService.getInteractiveElements();

// Click by accessible name
await DomService.clickByName('Submit');

// Type into an input
await DomService.typeByName('Email', 'user@example.com');

// Read React component state
const state = await DomService.getComponentState('MyComponent');
```

## API

### `createPixeerBridge(transport, options?)`

Wires DOM understanding and screen capture to a transport. Returns `{ dispose() }`.

| Option | Type | Default | Description |
|---|---|---|---|
| `enableScreenCapture` | `boolean` | `false` | Enable `screen.capture` method |
| `captureQuality` | `number` | `0.8` | JPEG quality (0-1) |

### `createLiveKitTransport(room)`

Creates a `PixeerTransport` backed by LiveKit RPC. This is the only built-in transport currently available — more are coming.

### `DomService`

| Method | Returns | Description |
|---|---|---|
| `getPageContext()` | `Promise<string>` | Semantic markdown of the page |
| `getInteractiveElements()` | `Promise<InteractiveElement[]>` | All interactive elements |
| `findByName(name)` | `Promise<Element \| null>` | Find element by accessible name |
| `click(selector)` | `boolean` | Click by CSS selector |
| `clickByName(name)` | `Promise<boolean>` | Click by accessible name |
| `type(selector, text)` | `boolean` | Type into input by selector |
| `typeByName(name, text)` | `Promise<boolean>` | Type into input by name |
| `getComponentState(name)` | `Promise<ComponentStateResult \| null>` | React component state |

### `ScreenCapture`

```typescript
const capture = new ScreenCapture({ quality: 0.8 });
const base64 = await capture.capture(); // prompts for screen share on first call
capture.dispose(); // stops stream, cleans up
```

## License

MIT
