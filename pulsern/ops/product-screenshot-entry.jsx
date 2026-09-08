import React from "react";
import { createRoot } from "react-dom/client";
import "@fontsource/archivo/latin-500.css";
import "@fontsource/archivo/latin-700.css";
import "@fontsource/archivo/latin-800.css";
import "@fontsource/ibm-plex-mono/latin-400.css";
import "@fontsource/ibm-plex-mono/latin-600.css";
import App from "../src/App.jsx";

/* Internal-only renderer used by capture-product-screenshots.mjs. It imports
   the real application component and pinned local fonts, and never enters
   Vite's production inputs. */
createRoot(document.getElementById("root")).render(<App />);
