/* The shipped guest trial, standalone: questions, rationale, toolkit, and
   the save-your-progress moment, checked in a real browser. */
import React from "react";
import { createRoot } from "react-dom/client";
import GuestTrial from "../../src/guest.jsx";
import { QUESTIONS } from "../../src/App.jsx";

window.QUESTIONS = QUESTIONS; // lets a test pick the right answer

window.T = { signUps: 0, signIns: 0 };
createRoot(document.getElementById("host")).render(
  <GuestTrial onSignUp={() => { window.T.signUps++; }} onSignIn={() => { window.T.signIns++; }} />
);
window.T.ready = true;
