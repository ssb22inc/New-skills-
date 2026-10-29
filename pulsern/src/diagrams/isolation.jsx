/* Transmission-based precautions: contact, droplet, airborne.
   ------------------------------------------------------------------
   Three rows — how it spreads, the classic examples, what to wear, what the
   room needs — on top of standard precautions for every client. The
   examples are the standard NCLEX-RN teaching lists.

   The diagram is a concept explainer only: it never outlines a row as
   "needed for this client". Reading that from question text kept attaching
   negation, treatment, test results or another person's status to the
   wrong condition (Sol, rounds 1–5), and a wrong outline teaches the wrong
   precaution with the authority of a picture. */
import React from "react";
import { Frame, G, T, Box, C, Anim, Loop, Flow, OnStep, Para, Chip, paraLines, useDefs, useMotion, BODY_TEXT, MIN_TEXT } from "./kit.jsx";

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
        moving={<g><animateTransform attributeName="transform" type="translate" values="0,-4;0,18;0,18;0,-4" keyTimes="0;0.4;0.6;1" dur="2.4s" repeatCount="indefinite" />{hand}
          <circle cx={x + 41} cy={y + 27} r={1.8} fill={GERM}><animate attributeName="opacity" values="0;0;1;1" keyTimes="0;0.45;0.6;1" dur="2.4s" repeatCount="indefinite" /></circle></g>}
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
function Row({ id, y, r, scene, badges }) {
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
      {scene(14, y + 10)}
      <Anim on={id} kind="pop" delay={500}>{badges(y + 96)}</Anim>
      <T x={TX} y={y + 24} size={15} weight={700}>{r.title}</T>
      <Para x={TX} y={howAt} w={TW} size={MIN_TEXT} color={C.muted} text={r.how} />
      {block("Examples", r.examples)}
      {block("Wear", r.wear)}
      {block("Room", r.room)}
    </G>
  );
}

export const ROWS = {
  contact: { title: "Contact: spread by touch", how: "Skin, wounds, stool, surfaces and shared equipment",
    examples: "MRSA, VRE, C. diff, scabies, head lice, RSV, congenital rubella", wear: "gown and gloves", room: "single room preferred, or cohort: same pathogen, compatible precautions; dedicated equipment" },
  droplet: { title: "Droplet: close-range spread", how: "Larger droplets from coughing, sneezing and talking",
    examples: "influenza, pertussis, mumps, acquired rubella, meningococcal disease", wear: "surgical mask on entering the room",
    room: "single room preferred, or cohort: same pathogen, compatible precautions" },
  airborne: { title: "Airborne: stays in the air", how: "Tiny particles hang in the air and travel on air currents",
    examples: "pulmonary or laryngeal TB, measles, chickenpox (+\u00a0contact)", wear: "fit-tested N95 respirator",
    room: "negative-pressure isolation room, door closed" },
};

/* Hand hygiene for the standard row; soap and water for C. diff. No
   crossed-out rub bottle: it read as a blanket ban (Sol, round 10). */
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

const DESC = "Standard precautions, including hand hygiene, for every client; transmission-based precautions are added on top. "
  + "Contact precautions (spread by touch: skin, wounds, stool, surfaces; for example MRSA, VRE, C. difficile, scabies, head lice, RSV, congenital rubella): gown and gloves; a single room preferred, or a cohort with clients who have the same pathogen and compatible precautions, and if neither is possible infection prevention decides the placement; dedicated equipment; for C. difficile, soap and water is the expected NCLEX answer, because washing physically removes spores that alcohol rub does not reliably inactivate; current CDC and facility guidance set when alcohol rub is still used. "
  + "Droplet precautions (larger respiratory droplets spread at close range by coughing, sneezing and talking; for example influenza, pertussis, mumps, acquired rubella, meningococcal disease): surgical mask on entering the room; a single room is preferred, or cohorting with clients who have the same pathogen and compatible precautions; if neither is possible, infection prevention decides the placement. "
  + "Airborne precautions (tiny particles that stay in the air; for example suspected or confirmed pulmonary or laryngeal tuberculosis, measles, chickenpox): fit-tested N95 respirator, negative-pressure airborne infection isolation room with the door closed. Chickenpox and disseminated zoster need airborne and contact precautions together. "
  + "On droplet or airborne precautions, the client wears a surgical mask when transported, if tolerated, and chickenpox or zoster lesions are covered; used gown and gloves are removed and hands cleaned before transport, with clean PPE for later handling if needed; escort respiratory protection follows pathogen guidance and facility policy.";

export function IsolationDiagram({ focus = null }) {
  const y1 = 64, y2 = y1 + rowHeight(ROWS.contact) + 10, y3 = y2 + rowHeight(ROWS.droplet) + 10;
  const yT = y3 + rowHeight(ROWS.airborne) + 10, yC = yT + 102;
  return (
    <Frame h={yC + 88} focus={focus} title="Transmission-based precautions" desc={DESC}
      regions={{ standard: [0, 56], contact: [y1 - 14, y1 + rowHeight(ROWS.contact) + 4], droplet: [y2 - 14, y2 + rowHeight(ROWS.droplet) + 4],
        airborne: [y3 - 14, y3 + rowHeight(ROWS.airborne) + 4], transport: [yT, yT + 92], cdiff: [yC, yC + 80] }}>
      <G id="standard">
        <Box x={8} y={6} w={344} h={50} r={10} fill={C.card} lift />
        <HandWash x={26} y={31} />
        <T x={48} y={27} size={BODY_TEXT} weight={700} color={C.accent}>Standard precautions for every client</T>
        <T x={48} y={46} size={MIN_TEXT} color={C.muted}>then add the precautions for how it spreads</T>
      </G>
      <Row id="contact" y={y1} r={ROWS.contact}
        scene={(x, y) => <ContactScene x={x} y={y} />}
        badges={(cy) => <><Badge cx={36} cy={cy}><Gown x={0} y={0} /></Badge><Badge cx={70} cy={cy}><Glove x={2} y={0} /></Badge></>} />
      <Row id="droplet" y={y2} r={ROWS.droplet}
        scene={(x, y) => <DropletScene x={x} y={y} />}
        badges={(cy) => <Badge cx={53} cy={cy}><Mask x={0} y={2} /></Badge>} />
      <Row id="airborne" y={y3} r={ROWS.airborne}
        scene={(x, y) => <AirborneScene x={x} y={y} />}
        badges={(cy) => <><Badge cx={36} cy={cy}><N95 x={0} y={4} /></Badge><Badge cx={70} cy={cy}><NegRoom x={2} y={0} /></Badge></>} />
      {/* Shared by droplet AND airborne (Sol: only the droplet row said it). */}
      <G id="transport">
        <Box x={8} y={yT} w={344} h={92} r={10} fill={C.card} stroke={C.teal} lift />
        <T x={18} y={yT + 22} size={BODY_TEXT} weight={700} color={C.accent}>Transport: droplet or airborne</T>
        <T x={18} y={yT + 42} size={MIN_TEXT}>The client wears a surgical mask if tolerated.</T>
        <T x={18} y={yT + 61} size={MIN_TEXT}>Chickenpox or zoster: cover the lesions too.</T>
        <T x={18} y={yT + 80} size={MIN_TEXT}>Staff: used gown and gloves off, hands clean.</T>
      </G>
      <G id="cdiff">
        <Box x={8} y={yC} w={344} h={80} r={10} fill={C.noBg} stroke={C.coral} lift />
        <T x={18} y={yC + 23} size={BODY_TEXT} weight={700} color={C.danger}>C. diff: soap and water</T>
        <T x={18} y={yC + 44} size={MIN_TEXT}>Washing removes spores; alcohol rub doesn't</T>
        <T x={18} y={yC + 62} size={MIN_TEXT}>kill them. Facility policy sets when rub is used.</T>
        <Anim on="cdiff" kind="pop" delay={300}><Soap x={316} y={yC + 24} /></Anim>
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
  facts: [
    "Standard precautions apply to every client; transmission-based precautions are added on top of them.",
    "Contact precautions (e.g., MRSA, VRE, C. difficile, scabies, head lice, RSV, congenital rubella) require a gown and gloves and dedicated equipment; a single room is preferred, or cohorting with clients who have the same pathogen and compatible additional precautions, and if neither is possible, infection prevention determines an appropriate placement with additional safeguards. Head lice need contact precautions until 24 hours after effective treatment; body and pubic lice need standard precautions.",
    "Droplet precautions (e.g., influenza, pertussis, mumps, acquired rubella, meningococcal disease) require a surgical mask on entering the room; a single room is preferred, or cohorting with clients who have the same pathogen and compatible additional precautions; if neither is possible, infection prevention determines an appropriate placement with additional safeguards.",
    "Respiratory droplets spread mainly at close range; there is no fixed distance at which transmission stops.",
    "Airborne precautions (e.g., suspected or confirmed pulmonary or laryngeal tuberculosis, measles, chickenpox) require a fit-tested N95 respirator and a negative-pressure airborne infection isolation room with the door closed.",
    "Chickenpox (varicella) and disseminated zoster require airborne AND contact precautions. Localized zoster in an immunocompromised client requires airborne and contact precautions until dissemination is ruled out; localized zoster in an immunocompetent client, or once dissemination is ruled out, with the lesions covered, needs standard precautions.",
    "Latent tuberculosis infection is not contagious and needs no isolation; extrapulmonary tuberculosis without pulmonary or laryngeal involvement needs standard precautions (draining lesions are managed separately). Congenital rubella needs contact precautions; acquired rubella needs droplet precautions.",
    "On droplet or airborne precautions, the client wears a surgical mask, if tolerated, when transported out of the room, and affected varicella or zoster lesions are covered; used gown and gloves are removed and hand hygiene performed before transport, with clean PPE for later handling when indicated; respiratory protection for the escort follows pathogen-specific guidance and facility policy.",
    "Alcohol-based hand rub does not reliably inactivate C. difficile spores; washing with soap and water physically removes them, and soap and water is the expected NCLEX answer for C. difficile. Current CDC and facility guidance determine when alcohol-based hand rub is still used in routine care (for example, when hands are not visibly soiled outside an outbreak).",
  ],
  steps: [
    { key: "standard", focus: ["standard"], caption: "Every client gets standard precautions. Transmission-based precautions are added on top, matched to how the organism spreads.",
      narration: "Every client gets standard precautions. Transmission-based precautions are added on top, and they are matched to how the organism spreads." },
    { key: "contact", focus: ["contact"], caption: "Contact: spread by touch, through skin, wounds, stool and surfaces, as with MRSA, C. diff, head lice and congenital rubella. Gown and gloves, a single room if possible or a cohort with the same pathogen and compatible precautions (otherwise infection prevention decides), and dedicated equipment such as a stethoscope that stays in the room.",
      narration: "Contact precautions are for organisms spread by touch, through skin, wounds, stool, and surfaces, as with MRSA, C. diff, head lice, and congenital rubella. Wear a gown and gloves. A single room is preferred, or a cohort with clients who have the same pathogen and compatible precautions; if neither is possible, infection prevention decides the placement. The client also needs dedicated equipment, such as a stethoscope that stays in the room." },
    { key: "cdiff", focus: ["contact", "cdiff"], caption: "The C. diff trap: for exam questions, the answer is soap and water, because washing physically removes the spores that alcohol hand rub does not reliably kill. In practice, CDC and facility policy set when alcohol rub is still used.",
      narration: "Here is the C. diff trap. On the exam, the answer is soap and water, because washing physically removes the spores that alcohol hand rub doesn't reliably kill. In practice, CDC and facility policy set when alcohol rub is still used." },
    { key: "droplet", focus: ["droplet"], caption: "Droplet: larger droplets spread at close range by coughing, sneezing and talking, as with influenza, pertussis, mumps, acquired rubella and meningococcal disease. Put on a surgical mask as you enter the room. A single room is preferred, or a cohort with the same pathogen and compatible precautions; otherwise infection prevention decides.",
      narration: "Droplet precautions are for larger droplets that spread at close range when a client coughs, sneezes, or talks, as with influenza, pertussis, mumps, acquired rubella, and meningococcal disease. Put on a surgical mask as you enter the room. A single room is preferred, or a cohort with clients who have the same pathogen and compatible precautions. If neither is possible, infection prevention decides the placement." },
    { key: "airborne", focus: ["airborne"], caption: "Airborne: tiny particles that hang in the air, as with pulmonary or laryngeal TB, measles and chickenpox. A fit-tested N95 respirator, and a negative-pressure room with the door kept closed. Chickenpox also needs contact precautions: gown and gloves.",
      narration: "Airborne precautions are for tiny particles that hang in the air, as with pulmonary or laryngeal tuberculosis, measles, and chickenpox. Wear a fit-tested N-ninety-five respirator, and keep the client in a negative-pressure room with the door closed. Chickenpox also needs contact precautions, so add a gown and gloves." },
    { key: "transport", focus: ["droplet", "airborne", "transport"], caption: "If a client on droplet or airborne precautions must leave the room, the client wears a surgical mask if tolerated, and chickenpox or zoster lesions are covered; before leaving, staff remove used gown and gloves and clean their hands, using clean PPE for later handling if needed; escort respiratory protection follows the pathogen guidance and facility policy. Chickenpox needs airborne and contact precautions together.",
      narration: "If a client on droplet or airborne precautions has to leave the room, the client wears a surgical mask if they can tolerate it, and any chickenpox or zoster lesions are covered. Before transport, staff take off a used gown and gloves and clean their hands, and put on clean protection later if it is needed. Whether the escort wears a respirator follows the guidance for that infection and facility policy. And remember, chickenpox needs airborne and contact precautions together." },
  ],
};
