/* Concept diagrams inside a rationale — only the Astra-confirmed ones.
   ------------------------------------------------------------------
   Everything heavy (the pairing map, the drawings, the player) is loaded on
   demand, so the app's first load is unchanged for students who never open
   a rationale. If any of it fails to load, the rationale simply stands on
   its own: a diagram is an enhancement, never a dependency. */
import React from "react";
import { fingerprint } from "./diagrams/fingerprint.js";

/* At most two diagrams under one rationale: more is a wall, not a help. */
export const MAX_PER_QUESTION = 2;

/* Pure: which diagrams, with which values, for this exact question. */
export function pairsFor(map, q, registry) {
  if (!map?.pairs || !q || q.id == null) return [];
  const entries = map.pairs[String(q.id)];
  if (!Array.isArray(entries)) return [];
  const fp = fingerprint(q);
  return entries
    .filter((e) => e && e.f === fp && registry?.[e.d])
    .slice(0, MAX_PER_QUESTION)
    .map((e) => ({ diagram: registry[e.d], params: e.p ?? null }));
}

export function ConceptExplainers({ q }) {
  const [mods, setMods] = React.useState(null);
  React.useEffect(() => {
    let live = true;
    Promise.all([import("./diagrams/item-map.json"), import("./diagrams/index.js"), import("./explainer.jsx")])
      .then(([map, reg, ex]) => { if (live) setMods({ map: map.default ?? map, registry: reg.DIAGRAMS, Explainer: ex.Explainer }); })
      .catch(() => { /* the rationale stands alone */ });
    return () => { live = false; };
  }, []);
  if (!mods) return null;
  const pairs = pairsFor(mods.map, q, mods.registry);
  if (!pairs.length) return null;
  const { Explainer } = mods;
  return pairs.map(({ diagram, params }) => (
    <Explainer key={`${q.id}-${diagram.id}`} diagram={diagram} params={params} />
  ));
}
