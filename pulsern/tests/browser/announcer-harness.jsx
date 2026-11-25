/* useAnnouncer standalone: the same message twice must reach the live
   region twice (cleared in between), and the guest trial uses it too. */
import React from "react";
import { createRoot } from "react-dom/client";
import { useAnnouncer } from "../../src/rewards-ui.jsx";
import { QUESTIONS } from "../../src/App.jsx";

function Host() {
  const [region, announce] = useAnnouncer();
  return (
    <div>
      {region}
      <button type="button" onClick={() => announce("3 in a row, On a roll")}>say</button>
    </div>
  );
}
window.QUESTIONS = QUESTIONS;
createRoot(document.getElementById("host")).render(<Host />);
window.T = { ready: true };
