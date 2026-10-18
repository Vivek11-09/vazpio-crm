import { SUPABASE_KEY, SUPABASE_URL } from "@/lib/supabase/env";
import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  return createBrowserClient(
    SUPABASE_URL,
    SUPABASE_KEY,
  );
}
