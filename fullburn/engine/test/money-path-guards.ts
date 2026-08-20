import { readFileSync } from "node:fs";

/** THE MONEY PATH'S GUARD POPULATION, ENUMERATED FROM SOURCE.
 *
 * The unreachable-guard sweep had a hand-written list of sixteen entries. Its
 * PREDICATE was fixed after R11-02 and works; its POPULATION was never touched, so
 * it measured sixteen guards against a money path carrying forty-seven — twelve
 * of them measured blind, including every one of the six in `llm()` (adversary
 * finding R12-02). Meanwhile `CLAUDE.md` and ledger L30 both said the sweep
 * drove EVERY money-path guard.
 *
 * Human ruling 2026-08-19: "Enumerate the guards programmatically and make the
 * sweep FAIL if its entry count doesn't match the enumerated count. Coverage
 * must be proven by execution, not asserted in prose."
 *
 * So the list is no longer a list. Every `throw new …` on the money path is read
 * out of the source, and the sweep must account for each one — by DRIVING it, or
 * by naming the ledger row that discloses why it cannot be driven. A guard added
 * tomorrow fails the sweep the day it lands, which is the only way a coverage
 * claim stays true. */

export const MONEY_PATH_SOURCES = [
  "engine/src/spend-meter.ts",
  "engine/src/spend-ledger.ts",
  "engine/src/gateway.ts",
  "config/src/caps.ts",
] as const;

export interface ThrowGuard {
  /** Workspace-relative source file. */
  readonly file: string;
  /** The error class thrown. */
  readonly error: string;
  /** The literal parts of the thrown message, interpolation holes removed. This
   * is the guard's identity: it is what the guard SAYS when it fires, so an
   * entry that matches it is a claim about runtime behaviour rather than about
   * the shape of a line. */
  readonly signature: string;
  /** 1-indexed line, for the failure message only — never for identity. */
  readonly line: number;
}

/** Scan from `open` (the index of `(`) to its matching `)`, honouring strings,
 * template literals and nested parens. Returns the argument text. */
function argumentText(src: string, open: number): string {
  let depth = 0;
  let i = open;
  while (i < src.length) {
    const c = src[i]!;
    if (c === '"' || c === "'" || c === "`") {
      const quote = c;
      i += 1;
      while (i < src.length) {
        if (src[i] === "\\") {
          i += 2;
          continue;
        }
        if (src[i] === quote) break;
        // A template hole can contain the delimiter, so it is skipped as a unit
        // rather than scanned character by character.
        if (quote === "`" && src[i] === "$" && src[i + 1] === "{") {
          let holes = 1;
          i += 2;
          while (i < src.length && holes > 0) {
            if (src[i] === "{") holes += 1;
            else if (src[i] === "}") holes -= 1;
            i += 1;
          }
          continue;
        }
        i += 1;
      }
      i += 1;
      continue;
    }
    if (c === "(") depth += 1;
    else if (c === ")") {
      depth -= 1;
      if (depth === 0) return src.slice(open + 1, i);
    }
    i += 1;
  }
  return "";
}

/** The literal text of every string/template in an argument list, holes removed
 * and whitespace collapsed. Concatenated pieces become one signature. */
function literalParts(args: string): string {
  const out: string[] = [];
  let i = 0;
  while (i < args.length) {
    const c = args[i]!;
    if (c !== '"' && c !== "'" && c !== "`") {
      i += 1;
      continue;
    }
    const quote = c;
    i += 1;
    let piece = "";
    while (i < args.length) {
      if (args[i] === "\\") {
        piece += args[i + 1] === "n" ? " " : args[i + 1] ?? "";
        i += 2;
        continue;
      }
      if (args[i] === quote) {
        i += 1;
        break;
      }
      if (quote === "`" && args[i] === "$" && args[i + 1] === "{") {
        let holes = 1;
        i += 2;
        while (i < args.length && holes > 0) {
          if (args[i] === "{") holes += 1;
          else if (args[i] === "}") holes -= 1;
          i += 1;
        }
        piece += " "; // a hole matches anything, and is matched by nothing
        continue;
      }
      piece += args[i];
      i += 1;
    }
    out.push(piece);
  }
  return out.join("").replace(/\s+/g, " ").trim();
}

export function enumerateThrowGuards(file: string, source: string): ThrowGuard[] {
  const guards: ThrowGuard[] = [];
  for (const m of source.matchAll(/throw new (\w+)\s*\(/g)) {
    const open = m.index! + m[0].length - 1;
    guards.push({
      file,
      error: m[1]!,
      signature: literalParts(argumentText(source, open)),
      line: source.slice(0, m.index!).split("\n").length,
    });
  }
  return guards;
}

/** Every money-path guard, read from the tree. `root` is the workspace root. */
export function moneyPathGuards(root: URL): ThrowGuard[] {
  return MONEY_PATH_SOURCES.flatMap((f) => enumerateThrowGuards(f, readFileSync(new URL(f, root), "utf8")));
}
