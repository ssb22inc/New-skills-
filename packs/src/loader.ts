import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import type { z } from 'zod';
import { ContextPackSchema, type ContextPack } from './context.js';
import { VerticalPackSchema, type VerticalPack } from './vertical.js';

/** Thrown for every pack problem; the message is written for a human. */
export class PackLoadError extends Error {
  constructor(source: string, detail: string) {
    super(`Failed to load pack "${source}":\n${detail}`);
    this.name = 'PackLoadError';
  }
}

function packsRoot(): string {
  // src/loader.ts lives one level below the packs workspace root.
  return fileURLToPath(new URL('..', import.meta.url));
}

function parsePack<T>(schema: z.ZodType<T>, yamlText: string, source: string): T {
  let raw: unknown;
  try {
    raw = parseYaml(yamlText);
  } catch (err) {
    throw new PackLoadError(source, `not valid YAML — ${(err as Error).message}`);
  }
  const result = schema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  • ${i.path.length > 0 ? i.path.join('.') : '(root)'}: ${i.message}`)
      .join('\n');
    throw new PackLoadError(source, issues);
  }
  return result.data;
}

function readPackFile(path: string): string {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    throw new PackLoadError(path, 'file not found or unreadable');
  }
}

export function parseContextPack(yamlText: string, source: string): ContextPack {
  return parsePack(ContextPackSchema, yamlText, source);
}

export function parseVerticalPack(yamlText: string, source: string): VerticalPack {
  return parsePack(VerticalPackSchema, yamlText, source);
}

export function loadContextPack(marketId: string): ContextPack {
  const path = join(packsRoot(), 'context', `${marketId}.yaml`);
  const pack = parseContextPack(readPackFile(path), path);
  if (pack.market_id !== marketId) {
    throw new PackLoadError(path, `market_id "${pack.market_id}" does not match file name`);
  }
  return pack;
}

export function loadVerticalPack(verticalId: string): VerticalPack {
  const path = join(packsRoot(), 'vertical', `${verticalId}.yaml`);
  const pack = parseVerticalPack(readPackFile(path), path);
  if (pack.vertical_id !== verticalId) {
    throw new PackLoadError(path, `vertical_id "${pack.vertical_id}" does not match file name`);
  }
  return pack;
}
