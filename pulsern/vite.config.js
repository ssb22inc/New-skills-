import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { injectSearchVerification } from "./ops/search-verification.mjs";

function searchConsoleVerification() {
  return {
    name: "pulsern-search-console-verification",
    transformIndexHtml(html) {
      return injectSearchVerification(html, process.env.GOOGLE_SITE_VERIFICATION);
    },
  };
}

export default defineConfig(({ mode }) => ({
  plugins: [react(), searchConsoleVerification()],
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
