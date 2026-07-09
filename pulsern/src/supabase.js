import { createClient } from "@supabase/supabase-js";

/* The client may hold ONLY these two values (CLAUDE.md rule 2). */
export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);
