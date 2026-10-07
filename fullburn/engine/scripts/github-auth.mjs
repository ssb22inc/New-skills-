/** Reads, from GitHub, who authored the commit that added an approval and
 * whether GitHub verified its signature (cross-family finding X5-03). Data
 * only: the decision is `checkApprovalAuthentication` in gate-lib.mjs.
 *
 * Fail closed: anything other than a well-formed 200 response is "no record",
 * which the decision refuses. The API base is GITHUB_API_URL, the variable
 * GitHub Actions sets; the integration suite points it at a local stub. */
export async function fetchCommitAuth({ repo, sha, token, apiUrl = "https://api.github.com", fetchImpl = globalThis.fetch }) {
  if (!/^[\w.-]+\/[\w.-]+$/.test(String(repo)) || !/^[0-9a-f]{40}$/.test(String(sha)) || !token) return null;
  try {
    const res = await fetchImpl(`${String(apiUrl).replace(/\/+$/, "")}/repos/${repo}/commits/${sha}`, {
      headers: { authorization: `Bearer ${token}`, accept: "application/vnd.github+json" },
    });
    if (res.status !== 200) return null;
    return commitAuthFromApi(await res.json());
  } catch {
    return null;
  }
}

/** The two facts the decision needs, from a GitHub "get a commit" body. */
export function commitAuthFromApi(body) {
  if (!body || typeof body !== "object") return null;
  return {
    verified: body?.commit?.verification?.verified === true,
    authorLogin: typeof body?.author?.login === "string" ? body.author.login : null,
  };
}

/** `owner/repo` from a remote URL (https, ssh, or a proxy path ending in it). */
export function repoFromRemote(url) {
  const m = /([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/.exec(String(url ?? "").trim());
  return m ? `${m[1]}/${m[2]}` : null;
}
