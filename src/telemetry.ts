import { version } from '../package.json';

const ENDPOINT = 'https://t.pixeer.dev/v1/ping';

function isOptedOut(): boolean {
  if (typeof process !== 'undefined') {
    if (process.env?.PIXEER_TELEMETRY === '0') return true;
    if (process.env?.VITEST || process.env?.CI) return true;
  }
  if (typeof window !== 'undefined' && (window as unknown as Record<string, unknown>).__PIXEER_NO_TELEMETRY) return true;
  return false;
}

export function sendTelemetry(payload: Record<string, unknown>): void {
  if (isOptedOut()) return;
  if (typeof navigator === 'undefined' || typeof navigator.sendBeacon !== 'function') return;

  try {
    const body = JSON.stringify({ v: version, ...payload });
    navigator.sendBeacon(ENDPOINT, body);
  } catch {
    // telemetry must never throw
  }
}
