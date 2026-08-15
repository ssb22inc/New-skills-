/** Shared `git diff --name-status` parsing (adversary finding R2-06).
 *
 * Both gates previously used `line.split("\t")` with `path: rest.at(-1)`, so a
 * rename (`R097<TAB>old<TAB>new`) mapped to "modified" with only the NEW path
 * retained — the old path silently left the protected set, and a standing FAIL
 * report could be renamed out of existence while the append-only check passed.
 * Renames and copies keep BOTH sides here. */
export function parseNameStatus(diffText) {
  const out = [];
  for (const line of diffText.split("\n")) {
    if (!line.trim()) continue;
    const parts = line.split("\t");
    const code = parts[0];
    if (/^R/.test(code) && parts.length >= 3) {
      out.push({ status: "renamed", oldPath: parts[1], path: parts[2] });
      continue;
    }
    if (/^C/.test(code) && parts.length >= 3) {
      // A copy adds a new path and leaves the source untouched.
      out.push({ status: "added", path: parts[2] });
      continue;
    }
    const path = parts[parts.length - 1];
    if (code === "A") out.push({ status: "added", path });
    else if (code === "D") out.push({ status: "deleted", path });
    else out.push({ status: "modified", path });
  }
  return out;
}
