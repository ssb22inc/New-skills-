import React from "react";
import { createRoot } from "react-dom/client";
import App from "../src/App.jsx";

/* Internal-only renderer used by capture-product-screenshots.mjs. It imports
   the real application component and never enters Vite's production inputs. */
createRoot(document.getElementById("root")).render(<App />);
