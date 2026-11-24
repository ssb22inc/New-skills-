/* Hand-drawn line icons for the bottom tab bar, in the app palette
   (currentColor). Decorative: every tab keeps its text label. */
const P = { fill: "none", stroke: "currentColor", strokeWidth: 1.9, strokeLinecap: "round", strokeLinejoin: "round" };

export function TabIcon({ name }) {
  return (
    <svg className="tab-ico" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false">
      {name === "today" && <><circle cx="12" cy="12" r="8.5" {...P} /><path d="M10 8.6v6.8l5.4-3.4z" {...P} /></>}
      {name === "qbank" && <><rect x="4.5" y="3.5" width="15" height="17" rx="2.5" {...P} /><path d="M8.5 9h7M8.5 13h7M8.5 17h4" {...P} /></>}
      {name === "case" && <><rect x="5" y="4.5" width="14" height="16" rx="2.5" {...P} /><path d="M9 4.5V3h6v1.5" {...P} /><path d="M7.5 13h2l1.4-3 2.2 6 1.4-3h2" {...P} /></>}
      {name === "cards" && <><rect x="3.5" y="7" width="13" height="13" rx="2.2" {...P} /><path d="M7.5 7V5.5A2 2 0 0 1 9.5 3.5h9a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2" {...P} /></>}
      {name === "stats" && <><path d="M4 20h16" {...P} /><path d="M7 16v-4M12 16V7M17 16v-6" {...P} /></>}
    </svg>
  );
}
