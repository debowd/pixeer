// Core — host side
export { DomService } from './dom-service';
export { ScreenCapture } from './screen-capture';
export { createPixeerBridge } from './bridge';
export { formatStaticAppContext, formatFullAppContext } from './context';
export { createMutationTracker } from './mutation-tracker';
export { RefMap } from './ref-map';
export { createWebMCPBridge } from './webmcp-bridge';

// Core — agent side
export { PixeerAgent } from './agent';
export { WebMCPAgent } from './webmcp-agent';
export { VoiceAgent } from './voice';

// Analytics + trace
export { PixeerAnalytics } from './analytics';
export { PixeerTracer, PixeerSpan, newTraceId, newSpanId } from './tracer';
export { ReplayEngine } from './replay';

// Types
export type {
  InteractiveElement,
  ComponentStateResult,
  PixeerTransport,
  PixeerCallerTransport,
  PixeerBridgeOptions,
  PixeerBridge,
  ScrollDirection,
  PixeerAppContext,
  PixeerViewContext,
} from './types';
export type {
  DomDelta,
  DeltaResult,
  MutationTrackerOptions,
  MutationTracker,
} from './mutation-tracker';
export type {
  WebMCPBridgeOptions,
  WebMCPBridgeHandle,
} from './webmcp-bridge';
export type { ScreenCaptureOptions } from './screen-capture';
export type {
  PixeerEvent,
  PixeerEventType,
  PixeerStats,
  TraceEvent,
  TraceEventType,
  OTLPExport,
  PixeerAnalyticsOptions,
} from './analytics';
export type { TimelineEntry, ReplayDiff } from './replay';
export type { SpanOptions } from './tracer';
export type {
  PixeerAgentOptions,
  PageContext,
  ScrollOptions,
  PressKeyOptions,
} from './agent';
export type { WebMCPAgentOptions, WebMCPToolDefinition, WebMCPToolHandler } from './webmcp-agent';
export type { VoiceAgentOptions, SpeakOptions } from './voice';

// Transports
export {
  createLiveKitTransport,
  createPostMessageTransport,
  createBroadcastTransport,
  createWebSocketTransport,
  createPixeerServerTransport,
  createPostMessageCaller,
  createBroadcastCaller,
  createWebSocketCaller,
} from './transports';
export type {
  PostMessageTransportOptions,
  BroadcastTransportOptions,
  WebSocketTransportOptions,
  PixeerServerTransportOptions,
  PostMessageCallerOptions,
  BroadcastCallerOptions,
  WebSocketCallerOptions,
} from './transports';
