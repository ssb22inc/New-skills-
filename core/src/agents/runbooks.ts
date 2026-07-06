import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { z } from 'zod';
import { GOLDEN_VITALS } from './watchman.js';

/**
 * P27 — runbooks are versioned files, not prompts. The Fixer can only
 * ever do what a runbook lists, and a runbook can only list these:
 */
export const RUNBOOK_ACTIONS = ['reroute', 'restart', 'retry', 'pause'] as const;
export type RunbookAction = (typeof RUNBOOK_ACTIONS)[number];

export const RunbookSchema = z
  .object({
    id: z.string().min(1),
    version: z.number().int().positive(),
    title: z.string().min(1),
    trigger: z
      .object({
        vital: z.enum(GOLDEN_VITALS),
        direction: z.enum(['up', 'down']),
      })
      .strict(),
    actions: z.array(z.enum(RUNBOOK_ACTIONS)).min(1),
    notes: z.string(),
  })
  .strict();

export type Runbook = z.infer<typeof RunbookSchema>;

export class RunbookLoadError extends Error {
  constructor(source: string, detail: string) {
    super(`Failed to load runbook "${source}":\n${detail}`);
    this.name = 'RunbookLoadError';
  }
}

export function runbooksRoot(): string {
  if (process.env.SYCAMORE_RUNBOOKS_DIR) return process.env.SYCAMORE_RUNBOOKS_DIR;
  return fileURLToPath(new URL('runbooks/', import.meta.url));
}

export function loadRunbooks(rootDir = runbooksRoot()): Runbook[] {
  const files = readdirSync(rootDir).filter((f) => f.endsWith('.yaml'));
  return files.map((file) => {
    let raw: unknown;
    try {
      raw = parseYaml(readFileSync(join(rootDir, file), 'utf8'));
    } catch (err) {
      throw new RunbookLoadError(file, `not valid YAML — ${(err as Error).message}`);
    }
    const result = RunbookSchema.safeParse(raw);
    if (!result.success) {
      const issues = result.error.issues
        .map((i) => `  • ${i.path.length > 0 ? i.path.join('.') : '(root)'}: ${i.message}`)
        .join('\n');
      throw new RunbookLoadError(file, issues);
    }
    return result.data;
  });
}
