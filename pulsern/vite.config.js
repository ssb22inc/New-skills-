import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => ({
  plugins: [react()],
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
