/* Transmission-based precautions: contact, droplet, airborne.
   ------------------------------------------------------------------
   Three rows — how it spreads, the classic examples, what to wear, what the
   room needs — on top of standard precautions for every client. The
   examples are the standard NCLEX-RN teaching lists. precautionFor() maps a
   named condition to its precautions (pure, tested), so when a question
   names exactly one condition its row is outlined. */
import React from "react";
import { Frame, G, T, Box, C, Anim, Loop, Flow, OnStep, Para, Chip, paraLines, useDefs, useMotion, BODY_TEXT, MIN_TEXT } from "./kit.jsx";

/* Conditions → precautions. A disease NAME is not enough when its form
   decides the precaution (Sol, PR #155 diagram review, rounds 1–2), so each
   entry's qualifiers are tied to the condition itself, and a negated
   qualifier ("not disseminated") does not count:
   - TB: airborne only for suspected or confirmed PULMONARY or LARYNGEAL
     disease; latent and extrapulmonary TB return no row.
   - Rubella: "congenital rubella" is contact; acquired rubella droplet.
   - Zoster: disseminated → airborne + contact; localized in an
     immunocompromised client → airborne + contact until dissemination is
     ruled out; once it is ruled out, or localized in an immunocompetent
     client, standard precautions (no row).
   - Lice: HEAD lice only (contact until 24 hours after effective
     treatment); body and pubic lice are standard precautions.
   Anything the text does not settle returns null: no row is outlined. */
export const CONDITIONS = [
  { re: /\bMRSA\b|methicillin-resistant/i, name: "MRSA", types: ["contact"] },
  { re: /\bVRE\b|vancomycin-resistant/i, name: "VRE", types: ["contact"] },
  { re: /\bC\.?\s*diff(?:icile)?\b|clostridi(?:um|oides) difficile/i, name: "C. difficile", types: ["contact"] },
  { re: /\bscabies\b/i, name: "scabies", types: ["contact"] },
  { re: /\bhead lice\b|pediculosis capitis/i, name: "head lice", types: ["contact"] },
  { re: /\bRSV\b|respiratory syncytial/i, name: "RSV", types: ["contact"] },
  { re: /\binfluenza\b|\bflu\b/i, name: "influenza", types: ["droplet"] },
  { re: /\bpertussis\b|whooping cough/i, name: "pertussis", types: ["droplet"] },
  { re: /\bmumps\b/i, name: "mumps", types: ["droplet"] },
  { re: /\bcongenital rubella(?: syndrome)?\b/i, name: "congenital rubella", types: ["contact"], group: "rubella" },
  { re: /\brubella\b/i, name: "rubella", types: ["droplet"], group: "rubella", unless: /\bcongenital rubella/i },
  /* Only meningococcal disease, not "bacterial meningitis" in general:
     pneumococcal meningitis needs standard precautions only. */
  { re: /meningococcal|neisseria meningitidis/i, name: "meningococcal disease", types: ["droplet"] },
  { re: /\b(?:pulmonary|laryngeal)\s+(?:tuberculosis|TB)\b|\b(?:tuberculosis|TB)\s+(?:of the\s+)?(?:lungs?|larynx)\b/i, name: "pulmonary or laryngeal TB", types: ["airborne"], group: "tb" },
  { re: /\bmeasles\b|\brubeola\b/i, name: "measles", types: ["airborne"] },
  { re: /\bvaricella\b|chickenpox|chicken pox/i, name: "chickenpox", types: ["airborne", "contact"], group: "vzv", unless: /\bzoster\b|\bshingles\b/i },
  { re: /\bdisseminated\s+(?:herpes\s+)?(?:zoster|shingles)\b|\b(?:zoster|shingles)\b[^.;]{0,25}\bdisseminated\b/i, name: "disseminated zoster", types: ["airborne", "contact"], group: "vzv",
    unless: /\bnot disseminated\b|\bnon-?disseminated\b|without dissemination|dissemination\s+(?:has\s+been\s+|was\s+|is\s+)?(?:ruled out|excluded)/i },
  { re: /\b(?:zoster|shingles)\b/i, name: "zoster in an immunocompromised client", types: ["airborne", "contact"], group: "vzv",
    needs: /\bimmuno(?:compromised|suppressed)\b/i,
    unless: /dissemination\s+(?:has\s+been\s+|was\s+|is\s+)?(?:ruled out|excluded)|\bnot disseminated\b|without dissemination|\blocalized\b[^.;]*\bimmunocompetent\b|\bimmunocompetent\b/i },
];
/* Mentions that name a condition the text does not assert the client has
   now. "Rule out" means suspected (still counted); "ruled out" means
   excluded. Vaccination, immunity and exposure are not an infection. */
const NOT_CURRENT_BEFORE = /\b(?:no|not|without|denies|negative for|ruled out|history of|hx of|past|previous|prior|resolved|vaccinated against|immuni[sz]ed against|immune to|exposed to|exposure to)\b[^.;:]{0,30}$/i;
const NOT_CURRENT_AFTER = /^[^.;:]{0,25}\b(?:was ruled out|has been ruled out|ruled out|excluded|negative|resolved|vaccin\w*|immuni[sz]ation|shot|titer|exposure)\b/i;
function currentMatch(re, t) {
  const g = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g");
  for (const m of t.matchAll(g)) {
    if (!NOT_CURRENT_BEFORE.test(t.slice(0, m.index)) && !NOT_CURRENT_AFTER.test(t.slice(m.index + m[0].length))) return true;
  }
  return false;
}
/* The precautions for the ONE condition the text asserts, or null when
   none, more than one, or not enough is said — a comparison question
   should not light up one row, and a guess must not either. */
export function precautionFor(text) {
  const t = String(text ?? "").replace(/german measles/gi, "rubella");
  const hits = CONDITIONS.filter((c) => currentMatch(c.re, t) && (!c.needs || currentMatch(c.needs, t)) && !(c.unless && c.unless.test(t)));
  /* one hit per group (zoster entries overlap): the most specific wins */
  const byGroup = new Map();
  for (const h of hits) if (!byGroup.has(h.group ?? h.name)) byGroup.set(h.group ?? h.name, h);
  const chosen = [...byGroup.values()];
  if (chosen.length !== 1) return null;
  /* A TB, zoster or lice mention that did not qualify still leaves the
     form unsettled ("active TB" alone, "lice" with no site): no row. */
  const c = chosen[0];
  if (/\b(?:tuberculosis|TB)\b/i.test(t) && (c.group !== "tb" || /\blatent\b|\bLTBI\b|extrapulmonary/i.test(t))) return null;
  if (/\b(?:zoster|shingles)\b/i.test(t) && c.group !== "vzv") return null;
  if (/\b(?:lice|pediculosis)\b/i.test(t) && c.name !== "head lice") return null;
  return { condition: c.name, types: c.types };
}

/* ---- simple PPE glyphs, drawn in the app palette ---- */
const stroke = { fill: "none", stroke: C.teal, strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round" };
function Gown({ x, y }) {
  return <path {...stroke} d={`M${x + 9},${y} h12 l3,5 l7,4 l-4,8 l-5,-2 v22 h-20 v-22 l-5,2 l-4,-8 l7,-4 z`} />;
}
function Glove({ x, y }) {
  return <path {...stroke} d={`M${x + 4},${y + 36} v-14 l-4,-7 a2.5,2.5 0 0 1 4,-2 l3,4 v-14 a2.4,2.4 0 0 1 4.8,0 v10 v-13 a2.4,2.4 0 0 1 4.8,0 v13 v-11 a2.4,2.4 0 0 1 4.8,0 v11 v-8 a2.3,2.3 0 0 1 4.6,0 v19 c0,5 -3,10 -7,10 z`} />;
}
function Mask({ x, y }) {
  return (
    <g>
      <rect x={x + 6} y={y + 6} width={26} height={20} rx={6} {...stroke} />
      <path {...stroke} d={`M${x + 10},${y + 12} h18 M${x + 10},${y + 17} h18 M${x + 10},${y + 22} h18`} strokeWidth={1.1} />
      <path {...stroke} d={`M${x + 6},${y + 10} q-6,6 0,12 M${x + 32},${y + 10} q6,6 0,12`} />
    </g>
  );
}
function N95({ x, y }) {
  return (
    <g>
      <path {...stroke} d={`M${x + 4},${y + 22} q15,-24 30,0 q-15,10 -30,0 z`} />
      <path {...stroke} d={`M${x + 4},${y + 18} q-4,-10 15,-12 q19,2 15,12`} strokeWidth={1.2} />
    </g>
  );
}
function NegRoom({ x, y }) {
  return (
    <g>
      <rect x={x + 4} y={y + 2} width={30} height={34} rx={3} {...stroke} />
      <circle cx={x + 28} cy={y + 20} r={1.6} fill={C.teal} />
      <path {...stroke} d={`M${x - 6},${y + 12} h8 M${x - 6},${y + 26} h8`} />
      <path {...stroke} d={`M${x + 1},${y + 9} l3,3 l-3,3 M${x + 1},${y + 23} l3,3 l-3,3`} />
    </g>
  );
}

/* ---- transmission scenes ----
   Each row opens with a small scene of HOW the organism spreads, which is
   what decides the precaution. Germs and particles are drawn in the lab
   ink tone (a hazard, not an error, so not coral). Static views show the
   scene still; on its step it moves. */
const GERM = C.labInk;

/* A client in profile, facing right. `masked` puts a surgical mask on
   (the transport step). */
function Profile({ x, y, masked = false }) {
  return (
    <g>
      <path d={`M${x - 12},${y + 26} q0,-12 12,-13 q12,1 12,13`} fill={C.teal} fillOpacity={0.18} stroke={C.teal} strokeWidth={1.3} />
      <circle cx={x} cy={y} r={8.5} fill={C.card} stroke={C.teal} strokeWidth={1.4} />
      <path d={`M${x + 8},${y - 2} l3,3 l-2.6,1`} fill="none" stroke={C.teal} strokeWidth={1.3} strokeLinejoin="round" />
      {masked ? (
        <OnStep on="transport" kind="pop" delay={300}>
          <rect x={x + 2} y={y - 1} width={10} height={8} rx={2.5} fill={C.card} stroke={C.accent} strokeWidth={1.4} />
          <path d={`M${x + 2},${y + 1} l-7,-3 M${x + 2},${y + 5} l-7,2`} stroke={C.accent} strokeWidth={0.9} />
        </OnStep>
      ) : null}
    </g>
  );
}

function SceneCard({ x, y, children }) {
  const u = useDefs();
  return (
    <g>
      <rect x={x} y={y} width={80} height={62} rx={8} fill={u("teal-soft")} stroke={C.line} />
      {children}
    </g>
  );
}

/* Contact: a gloved hand touches a contaminated rail and carries germs. */
function ContactScene({ x, y }) {
  const rail = y + 46;
  const germs = [[x + 18, rail - 3], [x + 30, rail - 2.5], [x + 47, rail - 3], [x + 60, rail - 2.5]];
  const hand = (
    <g>
      <path d={`M${x + 34},${y + 6} v14 l-4,-4 a2.2,2.2 0 0 0 -3,3 l7,9 h12 l2,-8 v-10 a2,2 0 0 0 -4,0 v6 v-8 a2,2 0 0 0 -4,0 v7 v-8 a2,2 0 0 0 -4,0 z`}
        fill={C.card} stroke={C.teal} strokeWidth={1.3} strokeLinejoin="round" />
    </g>
  );
  return (
    <SceneCard x={x} y={y}>
      <rect x={x + 8} y={rail} width={64} height={5} rx={2.5} fill={C.muted} fillOpacity={0.35} />
      {germs.map(([gx, gy], i) => <circle key={i} cx={gx} cy={gy} r={2} fill={GERM} />)}
      <WhileStep on="contact"
        moving={<g><animateTransform attributeName="transform" type="translate" values="0,-6;0,8;0,8;0,-6" keyTimes="0;0.4;0.6;1" dur="2.4s" repeatCount="indefinite" />{hand}
          <circle cx={x + 40} cy={y + 34} r={1.8} fill={GERM}><animate attributeName="opacity" values="0;0;1;1" keyTimes="0;0.45;0.6;1" dur="2.4s" repeatCount="indefinite" /></circle></g>}
        still={hand} />
    </SceneCard>
  );
}

/* Droplet: a cough sends larger droplets a short distance. No fixed
   distance is drawn: droplets can travel farther than a textbook cutoff,
   and a bracket would teach a safe boundary (Sol, PR #155). */
function DropletScene({ x, y }) {
  const mx = x + 27, my = y + 21, floor = y + 52;
  const arcs = [13, 20, 27].map((reach) => `M${mx},${my} q${reach * 0.5},-8 ${reach},${floor - my - 4}`);
  return (
    <SceneCard x={x} y={y}>
      <Profile x={x + 17} y={y + 22} masked />
      {[[mx + 12, floor - 6], [mx + 19, floor - 3], [mx + 26, floor - 5]].map(([dx, dy], i) => <circle key={i} cx={dx} cy={dy} r={2.6} fill={GERM} fillOpacity={0.8} />)}
      <Loop on="droplet">
        {arcs.map((d, i) => <Flow key={i} d={d} n={2} dur={1.6 + i * 0.2} r={2.6} color={GERM} shape="dot" />)}
      </Loop>
    </SceneCard>
  );
}

/* Airborne: tiny particles drift and hang across the whole room. */
const AIR_DOTS = [[34, 14], [44, 30], [52, 12], [58, 40], [66, 22], [70, 50], [40, 46], [62, 8], [74, 34], [48, 54]];
function AirborneScene({ x, y }) {
  const mx = x + 27, my = y + 21;
  const paths = [
    `M${mx},${my} C${x + 40},${y + 4} ${x + 55},${y + 30} ${x + 78},${y + 12}`,
    `M${mx},${my} C${x + 38},${y + 40} ${x + 58},${y + 6} ${x + 78},${y + 40}`,
    `M${mx},${my} C${x + 42},${y + 24} ${x + 60},${y + 56} ${x + 78},${y + 26}`,
  ];
  return (
    <SceneCard x={x} y={y}>
      <Profile x={x + 17} y={y + 22} masked />
      {AIR_DOTS.map(([dx, dy], i) => <circle key={i} cx={x + dx} cy={y + dy} r={1.1} fill={GERM} fillOpacity={0.75} />)}
      <Loop on="airborne">
        {paths.map((d, i) => <Flow key={i} d={d} n={3} dur={4 + i * 0.6} r={1.2} color={GERM} shape="dot" />)}
      </Loop>
    </SceneCard>
  );
}

/* Moving vs still, without motion markup in static renders. */
function WhileStep({ on, moving, still }) {
  const { stepKey, live } = useMotion();
  const keys = Array.isArray(on) ? on : [on];
  return (
    <>
      <Loop on={on}>{moving}</Loop>
      {live && keys.includes(stepKey) ? null : still}
    </>
  );
}

/* A PPE glyph shrunk into a round "wear" badge. */
const Badge = ({ cx, cy, children }) => (
  <g>
    <circle cx={cx} cy={cy} r={14} fill={C.card} stroke={C.teal} strokeWidth={1.2} />
    <g transform={`translate(${cx - 11},${cy - 11}) scale(0.58)`}>{children}</g>
  </g>
);

/* One precaution row. The scene and its PPE badges sit on the left; the
   text column on the right wraps at the canvas's reading sizes, and the
   row grows to fit it. A row the question's condition needs is outlined in
   teal and labelled — a requirement, not an error, so not coral. */
const TX = 104, TW = 238, LH = 1.3;
export function rowHeight(r) {
  const n = paraLines(r.how, TW, MIN_TEXT).length * MIN_TEXT * LH
    + [r.examples, r.wear, r.room].reduce((a, t, i) => a + paraLines(`${["Examples", "Wear", "Room"][i]} ${t}`, TW).length * BODY_TEXT * LH, 0);
  return Math.max(124, Math.ceil(30 + n + 14));
}
function Row({ id, y, r, scene, badges, highlight }) {
  const h = rowHeight(r);
  let ty = y + 46;
  const block = (lead, text) => {
    const at = ty;
    ty += paraLines(`${lead} ${text}`, TW).length * BODY_TEXT * LH;
    return <Para x={TX} y={at} w={TW} lead={lead} text={text} />;
  };
  const howAt = y + 42;
  const howLines = paraLines(r.how, TW, MIN_TEXT).length;
  ty = howAt + howLines * MIN_TEXT * LH + 6;
  return (
    <G id={id}>
      <Box x={8} y={y} w={344} h={h} r={10} fill={C.surface} lift />
      {highlight ? <rect className="dg-solid" x={5} y={y - 3} width={350} height={h + 6} rx={12} fill="none" stroke={C.accent} strokeWidth={2.4} /> : null}
      {scene(14, y + 10)}
      <Anim on={id} kind="pop" delay={500}>{badges(y + 96)}</Anim>
      <T x={TX} y={y + 24} size={15} weight={700}>{r.title}</T>
      <Para x={TX} y={howAt} w={TW} size={MIN_TEXT} color={C.muted} text={r.how} />
      {block("Examples", r.examples)}
      {block("Wear", r.wear)}
      {block("Room", r.room)}
      {highlight ? <Chip x={346} y={y + 4} anchor="end" size={MIN_TEXT} color="accent" fill={C.card} text="Needed for this client" /> : null}
    </G>
  );
}

export const ROWS = {
  contact: { title: "Contact: spread by touch", how: "Skin, wounds, stool, surfaces and shared equipment",
    examples: "MRSA, VRE, C. diff, scabies, head lice, RSV, congenital rubella", wear: "gown and gloves", room: "single room or cohort; dedicated equipment" },
  droplet: { title: "Droplet: close-range spread", how: "Larger droplets from coughing, sneezing and talking",
    examples: "influenza, pertussis, mumps, acquired rubella, meningococcal disease", wear: "surgical mask on entering the room",
    room: "single room preferred, or cohort with the same pathogen" },
  airborne: { title: "Airborne: stays in the air", how: "Tiny particles hang in the air and travel on air currents",
    examples: "pulmonary or laryngeal TB, measles, chickenpox (+\u00a0contact)", wear: "fit-tested N95 respirator",
    room: "negative-pressure isolation room, door closed" },
};

/* Hand hygiene for the standard row; soap vs alcohol rub for C. diff. */
const HandWash = ({ x, y }) => (
  <g fill="none" stroke={C.teal} strokeWidth={1.3} strokeLinecap="round" strokeLinejoin="round">
    <path d={`M${x - 4},${y + 9} v-8 l-3,-3 a1.6,1.6 0 0 1 2.4,-2 l2.6,2.6 v-8 a1.5,1.5 0 0 1 3,0 v6 v-7.5 a1.5,1.5 0 0 1 3,0 v7.5 v-6 a1.5,1.5 0 0 1 3,0 v6 v-4 a1.5,1.5 0 0 1 3,0 v8 c0,4 -2,7 -5,7 z`} fill={C.card} />
    <path d={`M${x + 12},${y - 10} C${x + 13.5},${y - 8} ${x + 14.5},${y - 6.5} ${x + 14.5},${y - 5.5} A2.5,2.5 0 1 1 ${x + 9.5},${y - 5.5} C${x + 9.5},${y - 6.5} ${x + 10.5},${y - 8} ${x + 12},${y - 10} Z`} fill={C.teal} fillOpacity={0.35} />
  </g>
);
const Soap = ({ x, y }) => (
  <g>
    <rect x={x - 9} y={y - 5} width={18} height={11} rx={4} fill={C.card} stroke={C.teal} strokeWidth={1.4} />
    {[[x - 7, y - 8], [x - 1, y - 10], [x + 5, y - 8.5]].map(([bx, by], i) => <circle key={i} cx={bx} cy={by} r={2} fill="none" stroke={C.teal} strokeWidth={1} />)}
    <path d={`M${x + 12},${y + 2} l3,3 l6,-7`} fill="none" stroke={C.teal} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
  </g>
);
const Rub = ({ x, y }) => (
  <g>
    <path d={`M${x - 5},${y - 4} h10 v12 a2,2 0 0 1 -2,2 h-6 a2,2 0 0 1 -2,-2 z M${x - 2},${y - 4} v-3 h5 l2,2`} fill={C.card} stroke={C.muted} strokeWidth={1.3} strokeLinejoin="round" />
    <path d={`M${x + 10},${y - 3} l8,8 M${x + 18},${y - 3} l-8,8`} stroke={C.danger} strokeWidth={2} strokeLinecap="round" />
  </g>
);

const DESC = "Standard precautions, including hand hygiene, for every client; transmission-based precautions are added on top. "
  + "Contact precautions (spread by touch: skin, wounds, stool, surfaces; for example MRSA, VRE, C. difficile, scabies, head lice, RSV, congenital rubella): gown and gloves, a single room or cohort, dedicated equipment; for C. difficile, hands are washed with soap and water because alcohol rub is not effective against its spores. "
  + "Droplet precautions (larger respiratory droplets spread at close range by coughing, sneezing and talking; for example influenza, pertussis, mumps, acquired rubella, meningococcal disease): surgical mask on entering the room; a single room is preferred, or cohorting with the same pathogen. "
  + "Airborne precautions (tiny particles that stay in the air; for example suspected or confirmed pulmonary or laryngeal tuberculosis, measles, chickenpox): fit-tested N95 respirator, negative-pressure airborne infection isolation room with the door closed. Chickenpox and disseminated zoster need airborne and contact precautions together. "
  + "On droplet or airborne precautions, the client wears a surgical mask when transported; the N95 respirator is for staff.";

export function IsolationDiagram({ params = null, focus = null }) {
  const lit = new Set(params?.types ?? []);
  const y1 = 64, y2 = y1 + rowHeight(ROWS.contact) + 10, y3 = y2 + rowHeight(ROWS.droplet) + 10;
  const yT = y3 + rowHeight(ROWS.airborne) + 10, yC = yT + 66;
  return (
    <Frame h={yC + 70} focus={focus} title="Transmission-based precautions" desc={DESC}
      regions={{ standard: [0, 56], contact: [y1 - 14, y1 + rowHeight(ROWS.contact) + 4], droplet: [y2 - 14, y2 + rowHeight(ROWS.droplet) + 4],
        airborne: [y3 - 14, y3 + rowHeight(ROWS.airborne) + 4], transport: [yT, yT + 56], cdiff: [yC, yC + 62] }}>
      <G id="standard">
        <Box x={8} y={6} w={344} h={50} r={10} fill={C.card} lift />
        <HandWash x={26} y={31} />
        <T x={48} y={27} size={BODY_TEXT} weight={700} color={C.accent}>Standard precautions for every client</T>
        <T x={48} y={46} size={MIN_TEXT} color={C.muted}>then add the precautions for how it spreads</T>
      </G>
      <Row id="contact" y={y1} r={ROWS.contact} highlight={lit.has("contact")}
        scene={(x, y) => <ContactScene x={x} y={y} />}
        badges={(cy) => <><Badge cx={36} cy={cy}><Gown x={0} y={0} /></Badge><Badge cx={70} cy={cy}><Glove x={2} y={0} /></Badge></>} />
      <Row id="droplet" y={y2} r={ROWS.droplet} highlight={lit.has("droplet")}
        scene={(x, y) => <DropletScene x={x} y={y} />}
        badges={(cy) => <Badge cx={53} cy={cy}><Mask x={0} y={2} /></Badge>} />
      <Row id="airborne" y={y3} r={ROWS.airborne} highlight={lit.has("airborne")}
        scene={(x, y) => <AirborneScene x={x} y={y} />}
        badges={(cy) => <><Badge cx={36} cy={cy}><N95 x={0} y={4} /></Badge><Badge cx={70} cy={cy}><NegRoom x={2} y={0} /></Badge></>} />
      {/* Shared by droplet AND airborne (Sol: only the droplet row said it). */}
      <G id="transport">
        <Box x={8} y={yT} w={344} h={56} r={10} fill={C.card} stroke={C.teal} lift />
        <T x={18} y={yT + 22} size={BODY_TEXT} weight={700} color={C.accent}>Transport: droplet or airborne</T>
        <T x={18} y={yT + 42} size={MIN_TEXT}>The client wears a surgical mask; the N95 is for staff.</T>
      </G>
      <G id="cdiff">
        <Box x={8} y={yC} w={344} h={62} r={10} fill={C.noBg} stroke={C.coral} lift />
        <T x={18} y={yC + 23} size={BODY_TEXT} weight={700} color={C.danger}>C. diff: soap and water</T>
        <T x={18} y={yC + 44} size={MIN_TEXT}>Alcohol rub is not effective on its spores.</T>
        <Anim on="cdiff" kind="pop" delay={300}><Soap x={274} y={yC + 24} /></Anim>
        <Anim on="cdiff" kind="pop" delay={600}><Rub x={316} y={yC + 22} /></Anim>
      </G>
    </Frame>
  );
}

export const isolation = {
  id: "isolation",
  title: "Isolation precautions",
  concepts: ["isolation-ppe"],
  Diagram: IsolationDiagram,
  example: null,
  textCases: [{ condition: "MRSA", types: ["contact"] }, { condition: "chickenpox", types: ["airborne", "contact"] }, { condition: "influenza", types: ["droplet"] }],
  facts: [
    "Standard precautions apply to every client; transmission-based precautions are added on top of them.",
    "Contact precautions (e.g., MRSA, VRE, C. difficile, scabies, head lice, RSV, congenital rubella) require a gown and gloves, a single room or cohorting, and dedicated equipment. Head lice need contact precautions until 24 hours after effective treatment; body and pubic lice need standard precautions.",
    "Droplet precautions (e.g., influenza, pertussis, mumps, acquired rubella, meningococcal disease) require a surgical mask on entering the room; a single room is preferred, or cohorting with clients who have the same pathogen when a single room is not available.",
    "Respiratory droplets spread mainly at close range; there is no fixed distance at which transmission stops.",
    "Airborne precautions (e.g., suspected or confirmed pulmonary or laryngeal tuberculosis, measles, chickenpox) require a fit-tested N95 respirator and a negative-pressure airborne infection isolation room with the door closed.",
    "Chickenpox (varicella) and disseminated zoster require airborne AND contact precautions. Localized zoster in an immunocompromised client requires airborne and contact precautions until dissemination is ruled out; localized zoster in an immunocompetent client, or once dissemination is ruled out, with the lesions covered, needs standard precautions.",
    "Latent tuberculosis infection is not contagious and needs no isolation; extrapulmonary tuberculosis without pulmonary or laryngeal involvement needs standard precautions (draining lesions are managed separately). Congenital rubella needs contact precautions; acquired rubella needs droplet precautions.",
    "On droplet or airborne precautions, the client wears a surgical mask when transported out of the room; the N95 respirator is worn by staff.",
    "Alcohol-based hand rub is not effective against C. difficile spores; hands are washed with soap and water.",
  ],
  steps: [
    { key: "standard", focus: ["standard"], caption: "Every client gets standard precautions. Transmission-based precautions are added on top, matched to how the organism spreads.",
      narration: "Every client gets standard precautions. Transmission-based precautions are added on top, and they are matched to how the organism spreads." },
    { key: "contact", focus: ["contact"], caption: "Contact: spread by touch, through skin, wounds, stool and surfaces, as with MRSA, C. diff, head lice and congenital rubella. Gown and gloves, a single room or cohort, and dedicated equipment such as a stethoscope that stays in the room.",
      narration: "Contact precautions are for organisms spread by touch, through skin, wounds, stool, and surfaces, as with MRSA, C. diff, head lice, and congenital rubella. Wear a gown and gloves. The client needs a single room or a cohort, and dedicated equipment, such as a stethoscope that stays in the room." },
    { key: "cdiff", focus: ["contact", "cdiff"], caption: "The C. diff trap: alcohol hand rub is not effective against its spores. Wash with soap and water.",
      narration: "Here is the C. diff trap. Alcohol hand rub is not effective against its spores, so wash your hands with soap and water." },
    { key: "droplet", focus: ["droplet"], caption: "Droplet: larger droplets spread at close range by coughing, sneezing and talking, as with influenza, pertussis, mumps, acquired rubella and meningococcal disease. Put on a surgical mask as you enter the room. A single room is preferred; clients with the same pathogen can share.",
      narration: "Droplet precautions are for larger droplets that spread at close range when a client coughs, sneezes, or talks, as with influenza, pertussis, mumps, acquired rubella, and meningococcal disease. Put on a surgical mask as you enter the room. A single room is preferred, and clients with the same pathogen can share a room." },
    { key: "airborne", focus: ["airborne"], caption: "Airborne: tiny particles that hang in the air, as with pulmonary or laryngeal TB, measles and chickenpox. A fit-tested N95 respirator, and a negative-pressure room with the door kept closed. Chickenpox also needs contact precautions: gown and gloves.",
      narration: "Airborne precautions are for tiny particles that hang in the air, as with pulmonary or laryngeal tuberculosis, measles, and chickenpox. Wear a fit-tested N-ninety-five respirator, and keep the client in a negative-pressure room with the door closed. Chickenpox also needs contact precautions, so add a gown and gloves." },
    { key: "transport", focus: ["droplet", "airborne", "transport"], caption: "If a client on droplet or airborne precautions must leave the room, the client wears a surgical mask; the N95 respirator is for staff. Chickenpox needs airborne and contact precautions together.",
      narration: "If a client on droplet or airborne precautions has to leave the room, the client wears a surgical mask. The N-ninety-five respirator is for staff. And remember, chickenpox needs airborne and contact precautions together." },
  ],
};
