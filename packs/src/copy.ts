import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { PackLoadError, packsRoot } from './loader.js';
import type { ContextPack } from './context.js';

/**
 * THE LOCALIZATION ENGINE (CLAUDE.md data rules).
 *
 * "No hardcoded user-facing strings. All copy goes through the
 *  localization engine and is driven by Context Pack directives. Zero
 *  hardcoded fallbacks — a missing pack field is a load error, not a
 *  silent default."
 *
 * Every sentence Sycamore says to a seller or a buyer is looked up here
 * by key. Resolution is three-deep and stops at the first hit:
 *
 *   1. packs/copy/market/<market_id>.yaml   — this market's own voice
 *   2. packs/copy/<language.primary>.yaml   — the exact tag, e.g. en-JM
 *   3. packs/copy/<base language>.yaml      — e.g. en
 *
 * A key present in none of the three throws. There is deliberately no
 * fourth level: code has no copy to fall back TO, which is the whole
 * point — a market cannot silently ship in another market's words.
 */

export class CopyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CopyError';
  }
}

/** A loaded, flattened catalogue: "shoebox.sold" → "You sold {sales}." */
export type CopyCatalogue = {
  readonly marketId: string;
  readonly language: string;
  readonly keys: ReadonlyMap<string, string>;
};

function flatten(node: unknown, prefix: string, out: Map<string, string>): void {
  if (node === null || node === undefined) return;
  if (typeof node === 'string') {
    out.set(prefix, node.trim());
    return;
  }
  if (typeof node !== 'object') {
    throw new CopyError(`copy key "${prefix}" must be a string, got ${typeof node}`);
  }
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    flatten(value, prefix ? `${prefix}.${key}` : key, out);
  }
}

function readCatalogueFile(path: string): Map<string, string> | null {
  let text: string;
  try {
    text = readFileSync(path, 'utf8');
  } catch {
    return null; // an absent layer is fine; an absent KEY is not
  }
  let raw: unknown;
  try {
    raw = parseYaml(text);
  } catch (err) {
    throw new PackLoadError(path, `not valid YAML — ${(err as Error).message}`);
  }
  const flat = new Map<string, string>();
  flatten(raw, '', flat);
  return flat;
}

/** e.g. "en-JM" → "en" */
export function baseLanguageOf(tag: string): string {
  return tag.split('-')[0]!;
}

const cache = new Map<string, CopyCatalogue>();

/**
 * Load the catalogue for a market. Cached per market — catalogues are
 * files on disk, immutable for a process's lifetime.
 */
export function loadCopy(pack: ContextPack): CopyCatalogue {
  const cached = cache.get(pack.market_id);
  if (cached) return cached;

  const root = join(packsRoot(), 'copy');
  const tag = pack.language.primary;
  const base = baseLanguageOf(tag);

  const baseKeys = readCatalogueFile(join(root, `${base}.yaml`));
  if (!baseKeys) {
    throw new PackLoadError(
      join(root, `${base}.yaml`),
      `no base copy catalogue for language "${base}" — every market's language ` +
        `needs one before that market can say anything`,
    );
  }
  const tagKeys = tag === base ? null : readCatalogueFile(join(root, `${tag}.yaml`));
  const marketKeys = readCatalogueFile(join(root, 'market', `${pack.market_id}.yaml`));

  // Most specific wins; base fills the rest.
  const keys = new Map<string, string>(baseKeys);
  for (const layer of [tagKeys, marketKeys]) {
    if (!layer) continue;
    for (const [k, v] of layer) keys.set(k, v);
  }

  const catalogue: CopyCatalogue = { marketId: pack.market_id, language: tag, keys };
  cache.set(pack.market_id, catalogue);
  return catalogue;
}

/** Test seam: catalogues are cached, and a test may rewrite files. */
export function clearCopyCache(): void {
  cache.clear();
}

const PLACEHOLDER = /\{([a-z_]+)\}/g;

/**
 * Render one line of copy. A missing key throws; a placeholder with no
 * value throws. Copy that reaches a seller reading "undefined" is a bug,
 * so it is made impossible rather than discouraged.
 */
export function t(
  catalogue: CopyCatalogue,
  key: string,
  vars: Record<string, string | number> = {},
): string {
  const template = catalogue.keys.get(key);
  if (template === undefined) {
    throw new CopyError(
      `no copy for "${key}" in market "${catalogue.marketId}" (${catalogue.language}) — ` +
        `add it to packs/copy/${baseLanguageOf(catalogue.language)}.yaml`,
    );
  }
  return template.replace(PLACEHOLDER, (_match, name: string) => {
    const value = vars[name];
    if (value === undefined) {
      throw new CopyError(`copy "${key}" needs a value for {${name}}`);
    }
    return String(value);
  });
}

/** Convenience for services that hold a pack rather than a catalogue. */
export function translator(pack: ContextPack) {
  const catalogue = loadCopy(pack);
  return (key: string, vars?: Record<string, string | number>) => t(catalogue, key, vars);
}

export type Translator = ReturnType<typeof translator>;

/**
 * Every key the base English catalogue defines. The completeness test
 * uses this to prove no language ships with holes in it.
 */
export function catalogueKeys(language: string): string[] {
  const flat = readCatalogueFile(join(packsRoot(), 'copy', `${language}.yaml`));
  if (!flat) throw new PackLoadError(`copy/${language}.yaml`, 'catalogue not found');
  return [...flat.keys()].sort();
}
