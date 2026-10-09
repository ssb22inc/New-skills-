/* Registry of concept diagrams. Adding one here is what makes it reachable
   from rationales, the explainer player and the render/review pipeline. */
import { abg } from "./abg.jsx";
import { potassium } from "./potassium.jsx";
import { tonicity } from "./tonicity.jsx";
import { insulin } from "./insulin.jsx";
import { isolation } from "./isolation.jsx";
import { pressureInjury } from "./pressure-injury.jsx";

export const DIAGRAMS = Object.fromEntries([abg, potassium, tonicity, insulin, isolation, pressureInjury].map((d) => [d.id, d]));
export const diagramFor = (id) => DIAGRAMS[id] ?? null;
