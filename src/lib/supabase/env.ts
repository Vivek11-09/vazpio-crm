// Supabase connection settings. Accepts both the names this project sets by hand and the names the
// Vercel ↔ Supabase integration creates (NEXT_PUBLIC_SUPABASE_ANON_KEY), so connecting the
// database through the integration works without renaming anything.
// Each variable is written out in full so Next.js can embed it in the browser bundle at build time.
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";

export const SUPABASE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "";

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error(
    "Supabase is not configured: set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY " +
      "(or NEXT_PUBLIC_SUPABASE_ANON_KEY) in the Vercel project, then redeploy.",
  );
}
