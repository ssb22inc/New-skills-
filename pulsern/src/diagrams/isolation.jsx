/* Transmission-based precautions: contact, droplet, airborne.
   ------------------------------------------------------------------
   Three rows — how it spreads, the classic examples, what to wear, what the
   room needs — on top of standard precautions for every client. The
   examples are the standard NCLEX-RN teaching lists. precautionFor() maps a
   named condition to its precautions (pure, tested), so when a question
   names exactly one condition its row is outlined. */
import React from "react";
import { Frame, G, T, Box, C } from "./kit.jsx";

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

function Row({ id, y, title, how, examples, wear, room, icons, highlight }) {
  return (
    <G id={id}>
      <Box x={8} y={y} w={344} h={104} r={10} fill={C.surface} />
      {highlight ? <rect x={5} y={y - 3} width={350} height={110} rx={12} fill="none" stroke={C.coral} strokeWidth={2} strokeDasharray="5 4" /> : null}
      <g>{icons}</g>
      <T x={100} y={y + 20} size={12.5} weight={700}>{title}</T>
      <T x={100} y={y + 36} size={10.5} color={C.muted}>{how}</T>
      <T x={100} y={y + 54} size={11}>{examples}</T>
      <T x={100} y={y + 72} size={11}><tspan fontWeight={700} fill={C.accent}>Wear </tspan>{wear}</T>
      <T x={100} y={y + 90} size={11}><tspan fontWeight={700} fill={C.accent}>Room </tspan>{room}</T>
    </G>
  );
}

export function IsolationDiagram({ params = null, focus = null }) {
  const lit = new Set(params?.types ?? []);
  return (
    <Frame h={442} focus={focus} title="Transmission-based precautions"
      desc="Standard precautions for every client. Contact precautions (spread by touch; MRSA, VRE, C. difficile, scabies, RSV): gown and gloves, private room or cohort, dedicated equipment; soap and water for C. difficile. Droplet precautions (large droplets within about 3 feet; influenza, pertussis, mumps, rubella, meningococcal meningitis): surgical mask on entering the room, private room. Airborne precautions (tiny particles that stay in the air; tuberculosis, measles, chickenpox): N95 respirator, negative-pressure room with the door closed. Clients wear a surgical mask when transported on droplet or airborne precautions.">
      <G id="standard">
        <Box x={8} y={6} w={344} h={34} r={10} fill={C.card} />
        <T x={18} y={28} size={11.5}><tspan fontWeight={700} fill={C.accent}>Standard precautions</tspan> for every client — then add:</T>
      </G>
      <Row id="contact" y={50} highlight={lit.has("contact")}
        title="Contact — spread by touch" how="skin, wounds, stool, surfaces, equipment"
        examples="MRSA · VRE · C. diff · scabies · lice · RSV"
        wear="gown + gloves" room="private or cohort; dedicated equipment"
        icons={<><Gown x={20} y={64} /><Glove x={56} y={64} /></>} />
      <Row id="droplet" y={164} highlight={lit.has("droplet")}
        title="Droplet — large droplets, ~3 ft" how="coughing, sneezing, talking"
        examples="flu · pertussis · mumps · rubella · meningococcal"
        wear="surgical mask on entering the room" room="private; client masks for transport"
        icons={<Mask x={36} y={182} />} />
      <Row id="airborne" y={278} highlight={lit.has("airborne")}
        title="Airborne — tiny particles hang in air" how="travel on air currents, farther than droplets"
        examples="TB · measles · chickenpox"
        wear="fit-tested N95 respirator" room="negative pressure, door closed"
        icons={<><N95 x={12} y={294} /><NegRoom x={60} y={292} /></>} />
      <G id="cdiff">
        <Box x={8} y={392} w={344} h={46} r={10} fill={C.noBg} stroke={C.coral} />
        <T x={18} y={411} size={11.5} weight={700} color={C.danger}>C. diff: wash with soap and water</T>
        <T x={18} y={428} size={10.5}>Alcohol rub does not kill its spores.</T>
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
