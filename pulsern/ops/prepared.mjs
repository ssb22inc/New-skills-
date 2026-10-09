/* Data handed from an untrusted "prepare" job to a trusted, paid one.
   ------------------------------------------------------------------
   The paid workflows (narration, diagram review, diagram pairing) hold
   credentials. They never run the selected branch's code: a job with no
   secrets checks the branch out and writes plain JSON (and, for the review,
   PNG frames); the job with the secrets runs the DEFAULT branch's scripts
   and reads that JSON as data (Astra, PR #134 review, round 21: the
   narration job ran a feature branch's ops/narrate.mjs with the production
   service-role key in its environment).

   Everything read here is validated: ids that become file paths must be
   plain slugs, strings are bounded, and anything unexpected is refused. */
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { expectedFrames, frameLabel, imagePlan, reviewData } from "./review-diagrams-lib.mjs";

export const SLUG = /^[a-z0-9][a-z0-9-]{0,62}$/;
const MAX_TEXT = 20_000;

export function fail(why) { throw new Error(`prepared data refused: ${why}`); }
export const slug = (v, what) => (typeof v === "string" && SLUG.test(v) ? v : fail(`${what} ${JSON.stringify(v)} is not a plain id`));
export const text = (v, what, max = MAX_TEXT) => (typeof v === "string" && v.length <= max ? v : fail(`${what} is not a string of at most ${max} characters`));
export const list = (v, what, max = 10_000) => (Array.isArray(v) && v.length <= max ? v : fail(`${what} is not a list of at most ${max}`));

/* The commit a checkout is at. Prepared data carries the commit it was
   made from, and the paid job refuses data made from any other commit
   than the one it is about to write to — so frames rendered from one tree
   can never be approved under another's key (Astra, PR #134 review, round
   22: the two jobs each checked out the moving branch name). */
export const headCommit = (dir = ".") => execFileSync("git", ["rev-parse", "HEAD"], { cwd: dir, encoding: "utf8" }).trim();

export function readPrepared(file, kind, { into = null } = {}) {
  let data;
  try { data = JSON.parse(readFileSync(file, "utf8")); } catch (e) { fail(`${file} is not readable JSON (${e.message})`); }
  if (!data || typeof data !== "object" || data.kind !== kind) fail(`${file} is not a "${kind}" file`);
  if (typeof data.commit !== "string" || !/^[0-9a-f]{40}$/.test(data.commit)) fail(`${file} does not say which commit it was made from`);
  if (into != null) {
    const at = headCommit(into);
    if (at !== data.commit) fail(`${file} was made from ${data.commit.slice(0, 12)}, but the checkout to write to is at ${at.slice(0, 12)}`);
  }
  return data;
}

/* Narration: the steps to record, as data. */
export function narrationPlan(data) {
  const ids = new Set();
  const diagrams = list(data.diagrams, "diagrams", 200).map((d) => {
    const id = slug(d?.id, "diagram id");
    if (ids.has(id)) fail(`diagram ${id} appears twice`);
    ids.add(id);
    const keys = new Set();
    const steps = list(d.steps, `${id} steps`, 100).map((s) => {
      const key = slug(s?.key, `${id} step key`);
      if (keys.has(key)) fail(`${id}/${key} appears twice`);
      keys.add(key);
      return { key, narration: text(s.narration, `${id}/${key} narration`, 4000) };
    });
    return { id, steps };
  });
  return diagrams;
}

/* Diagram review: each diagram's words as data, and how many frames it has.
   Frame files are always <dir>/<id>/<n>.png — the trusted side builds the
   paths itself and checks each is a PNG; nothing from the data names a file. */
const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
export function reviewPlan(data) {
  const ids = new Set();
  return list(data.diagrams, "diagrams", 200).map((d) => {
    const id = slug(d?.id, "diagram id");
    if (ids.has(id)) fail(`diagram ${id} appears twice`);
    ids.add(id);
    const keys = new Set();
    return {
      id,
      title: text(d.title, `${id} title`, 300),
      facts: list(d.facts, `${id} facts`, 200).map((f, i) => text(f, `${id} fact ${i + 1}`, 2000)),
      workedCaption: d.workedCaption == null ? null : text(d.workedCaption, `${id} worked caption`, 4000),
      steps: list(d.steps, `${id} steps`, 100).map((s) => {
        const key = slug(s?.key, `${id} step key`);
        if (keys.has(key)) fail(`${id}/${key} appears twice`);
        keys.add(key);
        return {
          key, dynamic: s.dynamic === true,
          focus: list(s.focus ?? [], `${id}/${key} focus`, 50).map((x) => text(x, `${id}/${key} focus`, 100)),
          caption: s.caption == null ? null : text(s.caption, `${id}/${key} caption`, 4000),
          narration: s.narration == null ? null : text(s.narration, `${id}/${key} narration`, 4000),
        };
      }),
      images: list(d.images, `${id} images`, 400).map((im) => ({ theme: im?.theme, key: im?.key })),
    };
  }).map((d) => {
    /* The frame set is decided here, not by the data: every step and the
       overview, in both themes, in order, no more and no fewer. Labels are
       generated, never copied (round 22: an empty or light-only set was
       accepted). */
    const want = expectedFrames(d.steps.map((s) => s.key));
    if (d.images.length !== want.length || want.some((w, i) => d.images[i].theme !== w.theme || d.images[i].key !== w.key)) {
      fail(`${d.id} must have exactly ${want.length} frames (${want.map((w) => `${w.theme}/${w.key}`).join(", ")}), in that order`);
    }
    return { ...d, images: want.map((w, n) => ({ ...w, label: frameLabel(w.theme, w.key), n })) };
  });
}
export function readFrame(dir, id, n, maxBytes = 8 * 1024 * 1024) {
  const buf = readFileSync(`${dir}/${slug(id, "diagram id")}/${Number(n)}.png`);
  if (buf.length > maxBytes || !buf.subarray(0, 8).equals(PNG_SIG)) fail(`${id} frame ${n} is not a PNG under ${maxBytes} bytes`);
  return buf;
}

/* Diagram pairing: the diagrams' words, exactly as the app fingerprints
   them (absent fields stay absent), and the matcher's proposals per
   question. Proposals are only candidates: every one is still confirmed by
   the reviewer and re-checked against the question before it ships. */
const plainValues = (v, what, depth = 0) => {
  if (depth > 4) fail(`${what} is nested too deeply`);
  if (v === null || typeof v === "number" || typeof v === "boolean") return v;
  if (typeof v === "string") return text(v, what, 500);
  if (Array.isArray(v)) return list(v, what, 50).map((x) => plainValues(x, what, depth + 1));
  if (typeof v === "object") return Object.fromEntries(Object.entries(v).slice(0, 50).map(([k, x]) => [text(k, what, 60), plainValues(x, what, depth + 1)]));
  fail(`${what} holds an unsupported value`);
};
export function mapPlan(data) {
  const ids = new Set();
  const diagrams = list(data.diagrams, "diagrams", 200).map((d) => {
    const id = slug(d?.id, "diagram id");
    if (ids.has(id)) fail(`diagram ${id} appears twice`);
    ids.add(id);
    const out = { id, title: text(d.title, `${id} title`, 300), facts: list(d.facts, `${id} facts`, 200).map((f, i) => text(f, `${id} fact ${i + 1}`, 2000)) };
    out.steps = list(d.steps, `${id} steps`, 100).map((s) => {
      const st = { key: slug(s?.key, `${id} step key`) };
      if (s.dynamic === true) st.dynamic = true;
      /* undefined, null and text are kept exactly: the app fingerprints them. */
      if (s.caption !== undefined) st.caption = s.caption === null ? null : text(s.caption, `${id}/${st.key} caption`, 4000);
      if (s.narration !== undefined) st.narration = s.narration === null ? null : text(s.narration, `${id}/${st.key} narration`, 4000);
      return st;
    });
    return out;
  });
  if (!data.proposals || typeof data.proposals !== "object" || Array.isArray(data.proposals)) fail("proposals is not an object");
  const proposals = new Map();
  for (const [qid, ps] of Object.entries(data.proposals)) {
    if (!/^\d{1,12}$/.test(qid)) fail(`question id ${JSON.stringify(qid)} is not a number`);
    proposals.set(Number(qid), list(ps, `proposals for ${qid}`, 20).map((p) => {
      const d = slug(p?.d, `proposal for ${qid}`);
      if (!ids.has(d)) fail(`proposal for ${qid} names unknown diagram ${d}`);
      return p.p == null ? { d } : { d, p: plainValues(p.p, `values for ${qid}/${d}`) };
    }));
  }
  return { diagrams: Object.fromEntries(diagrams.map((d) => [d.id, d])), proposals };
}

/* Local and prepared runs reach the reviewer through this one builder, so
   the same diagram and frames give the same labelled prompt and the same
   cache key either way (Astra, PR #134 review, round 23: local runs sent
   "Image N: undefined" and could never share CI's cache). */
export function reviewEntries(raw) {
  const plan = reviewPlan({ diagrams: raw.map((r) => JSON.parse(JSON.stringify(r.data))) });
  return plan.map((data, i) => ({ data, pngs: raw[i].pngs }));
}

/* A local run's entries: the registry's diagrams and their rendered frames,
   through the same builder as a prepared run. */
export function localEntries(diagrams, gallery, readFile, only = null) {
  return reviewEntries(diagrams.filter((d) => !only || d.id === only).map((d) => {
    const plan = imagePlan(d, gallery);
    return { data: reviewData(d, plan), pngs: plan.map((p) => readFile(p.file)) };
  }));
}
