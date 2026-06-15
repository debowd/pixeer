import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { hashSource, readCache, writeCache } from '../cache.js';

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pixeer-cache-test-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('hashSource', () => {
  it('returns a 16-char hex string', () => {
    const h = hashSource('const x = 1', 'claude-sonnet-4-6');
    expect(h).toMatch(/^[0-9a-f]{16}$/);
  });

  it('produces different hashes for different sources', () => {
    const a = hashSource('const a = 1', 'model');
    const b = hashSource('const b = 2', 'model');
    expect(a).not.toBe(b);
  });

  it('produces different hashes for different models', () => {
    const a = hashSource('same source', 'model-a');
    const b = hashSource('same source', 'model-b');
    expect(a).not.toBe(b);
  });

  it('is deterministic', () => {
    expect(hashSource('src', 'm')).toBe(hashSource('src', 'm'));
  });
});

describe('readCache / writeCache', () => {
  it('returns null for missing entry', () => {
    expect(readCache(tmpDir, 'nonexistent')).toBeNull();
  });

  it('round-trips a cache entry', () => {
    const entry = { elements: { 'Save': 'Saves the document' }, model: 'claude-sonnet-4-6', timestamp: 1000 };
    writeCache(tmpDir, 'abc123', entry);
    const read = readCache(tmpDir, 'abc123');
    expect(read).toEqual(entry);
  });

  it('creates the cache directory if it does not exist', () => {
    const nested = path.join(tmpDir, 'nested', 'deep');
    writeCache(nested, 'k', { elements: {}, model: 'm', timestamp: 0 });
    expect(fs.existsSync(nested)).toBe(true);
  });
});
