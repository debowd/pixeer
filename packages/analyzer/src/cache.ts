import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export interface CacheEntry {
  elements: Record<string, string>;
  model: string;
  timestamp: number;
}

export function hashSource(source: string, model: string): string {
  return crypto.createHash('sha256').update(`${model}\x00${source}`).digest('hex').slice(0, 16);
}

export function readCache(cacheDir: string, key: string): CacheEntry | null {
  const file = path.join(cacheDir, `${key}.json`);
  try {
    const raw = fs.readFileSync(file, 'utf8');
    return JSON.parse(raw) as CacheEntry;
  } catch {
    return null;
  }
}

export function writeCache(cacheDir: string, key: string, entry: CacheEntry): void {
  fs.mkdirSync(cacheDir, { recursive: true });
  fs.writeFileSync(path.join(cacheDir, `${key}.json`), JSON.stringify(entry, null, 2));
}
