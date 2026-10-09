/* Transmission-based precautions: contact, droplet, airborne.
   ------------------------------------------------------------------
   Three rows — how it spreads, the classic examples, what to wear, what the
   room needs — on top of standard precautions for every client. The
   examples are the standard NCLEX-RN teaching lists. precautionFor() maps a
   named condition to its precautions (pure, tested), so when a question
   names exactly one condition its row is outlined. */
import React from "react";
import { Frame, G, T, Box, C, Anim, Loop, Flow, OnStep, useDefs, useMotion } from "./kit.jsx";

/* Conditions → precautions. Some need two (varicella: airborne + contact). */
export const CONDITIONS = [
  { re: /\bMRSA\b|methicillin-resistant/i, name: "MRSA", types: ["contact"] },
  { re: /\bVRE\b|vancomycin-resistant/i, name: "VRE", types: ["contact"] },
  { re: /\bC\.?\s*diff(?:icile)?\b|clostridi(?:um|oides) difficile/i, name: "C. difficile", types: ["contact"] },
  { re: /\bscabies\b/i, name: "scabies", types: ["contact"] },
  { re: /\b(?:head )?lice\b|pediculosis/i, name: "lice", types: ["contact"] },
  { re: /\bRSV\b|respiratory syncytial/i, name: "RSV", types: ["contact"] },
  { re: /\binfluenza\b|\bflu\b/i, name: "influenza", types: ["droplet"] },
  { re: /\bpertussis\b|whooping cough/i, name: "pertussis", types: ["droplet"] },
  { re: /\bmumps\b/i, name: "mumps", types: ["droplet"] },
  { re: /\brubella\b|german measles/i, name: "rubella", types: ["droplet"] },
  /* Only meningococcal disease, not "bacterial meningitis" in general:
     pneumococcal meningitis needs standard precautions only, and mapping the
     general term to droplet would teach the wrong precaution. */
  { re: /meningococcal|neisseria meningitidis/i, name: "meningococcal meningitis", types: ["droplet"] },
  { re: /\b[Tt]uberculosis\b|\bTB\b/, name: "tuberculosis", types: ["airborne"] },
  { re: /\bmeasles\b|\brubeola\b/i, name: "measles", types: ["airborne"] },
  { re: /\bvaricella\b|chickenpox|chicken pox/i, name: "chickenpox", types: ["airborne", "contact"] },
];

/* The precautions for the ONE condition named, or null when none or more
   than one is named — a comparison question should not light up one row. */
export function precautionFor(text) {
  const t = String(text ?? "").replace(/german measles/gi, "rubella");
  const hits = CONDITIONS.filter((c) => c.re.test(t));
  return hits.length === 1 ? { condition: hits[0].name, types: hits[0].types } : null;
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
      <text x={x + 19} y={y + 22} textAnchor="middle" fontSize={7.5} fontWeight={700} fill={C.accent} fontFamily="'IBM Plex Mono',monospace">N95</text>
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

/* Droplet: a cough sends large droplets that fall within about 3 feet. */
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
      {/* the ~3 ft reach */}
      <path d={`M${mx},${floor + 4} h30 M${mx},${floor + 1} v6 M${mx + 30},${floor + 1} v6`} stroke={C.muted} strokeWidth={1} />
      <T x={mx + 32} y={floor + 8} size={8.5} weight={700} color={C.muted} mono>3ft</T>
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
    <circle cx={cx} cy={cy} r={13} fill={C.card} stroke={C.teal} strokeWidth={1.2} />
    <g transform={`translate(${cx - 10.5},${cy - 10.5}) scale(0.55)`}>{children}</g>
  </g>
);

function Row({ id, y, title, how, examples, wear, room, scene, badges, highlight }) {
  return (
    <G id={id}>
      <Box x={8} y={y} w={344} h={104} r={10} fill={C.surface} lift />
      {highlight ? <rect x={5} y={y - 3} width={350} height={110} rx={12} fill="none" stroke={C.coral} strokeWidth={2} strokeDasharray="5 4" /> : null}
      {scene(14, y + 7)}
      <Anim on={id} kind="pop" delay={500}>{badges(y + 86)}</Anim>
      <T x={100} y={y + 20} size={12.5} weight={700}>{title}</T>
      <T x={100} y={y + 36} size={10.5} color={C.muted}>{how}</T>
      <T x={100} y={y + 54} size={11}>{examples}</T>
      <T x={100} y={y + 72} size={11}><tspan fontWeight={700} fill={C.accent}>Wear </tspan>{wear}</T>
      <T x={100} y={y + 90} size={11}><tspan fontWeight={700} fill={C.accent}>Room </tspan>{room}</T>
    </G>
  );
}

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
    <path d={`M${x + 10},${y - 3} l8,8 M${x + 18},${y - 3} l-8,8`} stroke={C.coral} strokeWidth={1.8} strokeLinecap="round" />
  </g>
);

export function IsolationDiagram({ params = null, focus = null }) {
  const lit = new Set(params?.types ?? []);
  return (
    <Frame h={442} focus={focus} title="Transmission-based precautions"
      desc="Standard precautions, including hand hygiene, for every client. Contact precautions (spread by touch; MRSA, VRE, C. difficile, scabies, RSV): gown and gloves, private room or cohort, dedicated equipment; soap and water for C. difficile because alcohol rub does not kill its spores. Droplet precautions (large droplets that fall within about 3 feet; influenza, pertussis, mumps, rubella, meningococcal meningitis): surgical mask on entering the room, private room. Airborne precautions (tiny particles that stay in the air; tuberculosis, measles, chickenpox): N95 respirator, negative-pressure room with the door closed. Clients wear a surgical mask when transported on droplet or airborne precautions.">
      <G id="standard">
        <Box x={8} y={6} w={344} h={34} r={10} fill={C.card} lift />
        <HandWash x={24} y={23} />
        <T x={44} y={28} size={11.5}><tspan fontWeight={700} fill={C.accent}>Standard precautions</tspan> for every client — then add:</T>
      </G>
      <Row id="contact" y={50} highlight={lit.has("contact")}
        title="Contact — spread by touch" how="skin, wounds, stool, surfaces, equipment"
        examples="MRSA · VRE · C. diff · scabies · lice · RSV"
        wear="gown + gloves" room="private or cohort; dedicated equipment"
        scene={(x, y) => <ContactScene x={x} y={y} />}
        badges={(cy) => <><Badge cx={36} cy={cy}><Gown x={0} y={0} /></Badge><Badge cx={68} cy={cy}><Glove x={2} y={0} /></Badge></>} />
      <Row id="droplet" y={164} highlight={lit.has("droplet")}
        title="Droplet — large droplets, ~3 ft" how="coughing, sneezing, talking"
        examples="flu · pertussis · mumps · rubella · meningococcal"
        wear="surgical mask on entering the room" room="private; client masks for transport"
        scene={(x, y) => <DropletScene x={x} y={y} />}
        badges={(cy) => <Badge cx={52} cy={cy}><Mask x={0} y={2} /></Badge>} />
      <Row id="airborne" y={278} highlight={lit.has("airborne")}
        title="Airborne — tiny particles hang in air" how="travel on air currents, farther than droplets"
        examples="TB · measles · chickenpox"
        wear="fit-tested N95 respirator" room="negative pressure, door closed"
        scene={(x, y) => <AirborneScene x={x} y={y} />}
        badges={(cy) => <><Badge cx={36} cy={cy}><N95 x={0} y={4} /></Badge><Badge cx={68} cy={cy}><NegRoom x={2} y={0} /></Badge></>} />
      <G id="cdiff">
        <Box x={8} y={392} w={344} h={46} r={10} fill={C.noBg} stroke={C.coral} lift />
        <T x={18} y={411} size={11.5} weight={700} color={C.danger}>C. diff: wash with soap and water</T>
        <T x={18} y={428} size={10.5}>Alcohol rub does not kill its spores.</T>
        <Anim on="cdiff" kind="pop" delay={300}><Soap x={278} y={416} /></Anim>
        <Anim on="cdiff" kind="pop" delay={600}><Rub x={318} y={414} /></Anim>
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
    "Contact precautions (e.g., MRSA, VRE, C. difficile, scabies, lice, RSV) require a gown and gloves, a private room or cohorting, and dedicated equipment.",
    "Droplet precautions (e.g., influenza, pertussis, mumps, rubella, meningococcal meningitis) require a surgical mask on entering the room and a private room; the client wears a surgical mask when transported.",
    "Airborne precautions (e.g., tuberculosis, measles, chickenpox) require a fit-tested N95 respirator and a negative-pressure airborne infection isolation room with the door closed; the client wears a surgical mask when transported.",
    "Chickenpox (varicella) requires both airborne and contact precautions.",
    "Alcohol-based hand rub does not kill C. difficile spores; hands are washed with soap and water.",
  ],
  steps: [
    { key: "standard", focus: ["standard"], caption: "Every client gets standard precautions. Transmission-based precautions are added on top, matched to how the organism spreads.",
      narration: "Every client gets standard precautions. Transmission-based precautions are added on top, and they are matched to how the organism spreads." },
    { key: "contact", focus: ["contact"], caption: "Contact: spread by touch — skin, wounds, stool, surfaces. Gown and gloves, a private room or cohort, and dedicated equipment like a stethoscope that stays in the room.",
      narration: "Contact precautions are for organisms spread by touch — skin, wounds, stool, and surfaces. Wear a gown and gloves. The client needs a private room or a cohort, and dedicated equipment, like a stethoscope that stays in the room." },
    { key: "cdiff", focus: ["contact", "cdiff"], caption: "The C. diff trap: alcohol hand rub does not kill its spores. Wash with soap and water.",
      narration: "Here is the C. diff trap. Alcohol hand rub does not kill its spores, so wash your hands with soap and water." },
    { key: "droplet", focus: ["droplet"], caption: "Droplet: large droplets that fall within about 3 feet — flu, pertussis, mumps, rubella, meningococcal meningitis. Put on a surgical mask as you enter the room.",
      narration: "Droplet precautions are for large droplets that fall within about three feet — influenza, pertussis, mumps, rubella, and meningococcal meningitis. Put on a surgical mask as you enter the room." },
    { key: "airborne", focus: ["airborne"], caption: "Airborne: tiny particles that hang in the air — TB, measles, chickenpox. A fit-tested N95 respirator, and a negative-pressure room with the door kept closed.",
      narration: "Airborne precautions are for tiny particles that hang in the air — tuberculosis, measles, and chickenpox. Wear a fit-tested N-ninety-five respirator, and keep the client in a negative-pressure room with the door closed." },
    { key: "transport", focus: ["droplet", "airborne"], caption: "If a client on droplet or airborne precautions must leave the room, the client wears a surgical mask. Chickenpox needs airborne and contact precautions together.",
      narration: "If a client on droplet or airborne precautions has to leave the room, the client wears a surgical mask. And remember, chickenpox needs airborne and contact precautions together." },
  ],
};
