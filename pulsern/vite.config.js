import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { injectSearchVerification } from "./ops/search-verification.mjs";

function searchConsoleVerification() {
  return {
    name: "pulsern-search-console-verification",
    transformIndexHtml(html, context) {
      if (context?.path !== "/index.html") return html;
      return injectSearchVerification(html, process.env.GOOGLE_SITE_VERIFICATION);
    },
  };
}

export default defineConfig(({ mode }) => ({
  plugins: [react(), searchConsoleVerification()],
  build: {
    rollupOptions: {
      input: {
        marketing: fileURLToPath(new URL("./index.html", import.meta.url)),
        app: fileURLToPath(new URL("./app/index.html", import.meta.url)),
      },
    },
  },
  define: mode === "test" ? {
    "import.meta.env.VITE_SUPABASE_URL": JSON.stringify("http://127.0.0.1:54321"),
    "import.meta.env.VITE_SUPABASE_ANON_KEY": JSON.stringify("public-test-placeholder"),
  } : undefined,
  test: {
    environment: "node",
    include: ["tests/**/*.test.{js,jsx}"],
    passWithNoTests: true,
  },
}));
