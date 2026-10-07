/** Shared `git diff --name-status` parsing (adversary finding R2-06).
 *
 * Both gates previously used `line.split("\t")` with `path: rest.at(-1)`, so a
 * rename (`R097<TAB>old<TAB>new`) mapped to "modified" with only the NEW path
 * retained — the old path silently left the protected set, and a standing FAIL
 * report could be renamed out of existence while the append-only check passed.
 * Renames and copies keep BOTH sides here.
 *
 * Git QUOTES any path containing a space, quote, backslash or non-ASCII byte
 * (`"fullburn/config/src/a b.ts"`, `"…\303\251.ts"`), so a literal comparison
 * against CLASS2_PATTERNS missed it and the file walked out of the protected
 * set (adversary finding R3-CP-08). Callers should prefer the NUL-separated
 * form — parseNameStatusZ — which git never quotes; this text parser unquotes
 * as a fallback for anything still using the human-readable output. */
function unquoteGitPath(p) {
  if (typeof p !== "string" || !p.startsWith('"') || !p.endsWith('"')) return p;
  const body = p.slice(1, -1);
  let out = "";
  for (let i = 0; i < body.length; i++) {
    if (body[i] !== "\\") {
      out += body[i];
      continue;
    }
    const next = body[++i];
    if (next >= "0" && next <= "7") {
      out += String.fromCharCode(parseInt(body.slice(i, i + 3), 8));
      i += 2;
    } else if (next === "n") out += "\n";
    else if (next === "t") out += "\t";
    else out += next;
  }
  // Octal escapes are UTF-8 bytes; recover the original characters.
  try {
    return decodeURIComponent(escape(out));
  } catch {
    return out;
  }
}

/** Parse `git diff --name-status -z -M` output: fields are NUL-separated and
 * never quoted, so no unquoting guesswork is involved. */
export function parseNameStatusZ(buf) {
  const f = buf.split("\0").filter((x) => x !== "");
  const out = [];
  for (let i = 0; i < f.length; ) {
    const code = f[i++];
    if (/^[RC]/.test(code)) {
      const oldPath = f[i++];
      const path = f[i++];
      out.push(code.startsWith("R") ? { status: "renamed", oldPath, path } : { status: "added", path });
      continue;
    }
    const path = f[i++];
    if (code === "A") out.push({ status: "added", path });
    else if (code === "D") out.push({ status: "deleted", path });
    else out.push({ status: "modified", path });
  }
  return out;
}

export function parseNameStatus(diffText) {
  const out = [];
  for (const line of diffText.split("\n")) {
    if (!line.trim()) continue;
    const parts = line.split("\t");
    const code = parts[0];
    if (/^R/.test(code) && parts.length >= 3) {
      out.push({ status: "renamed", oldPath: unquoteGitPath(parts[1]), path: unquoteGitPath(parts[2]) });
      continue;
    }
    if (/^C/.test(code) && parts.length >= 3) {
      // A copy adds a new path and leaves the source untouched.
      out.push({ status: "added", path: unquoteGitPath(parts[2]) });
      continue;
    }
    const path = unquoteGitPath(parts[parts.length - 1]);
    if (code === "A") out.push({ status: "added", path });
    else if (code === "D") out.push({ status: "deleted", path });
    else out.push({ status: "modified", path });
  }
  return out;
}
