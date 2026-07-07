import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Two clients, deliberately separated by trust boundary:
 *
 * - `supabaseAdmin()` uses the service-role key and bypasses RLS. It must only
 *   ever run on the server (API routes, Inngest functions). Importing it into a
 *   client component would leak the key into the browser bundle, so we throw if
 *   the env var is missing rather than silently falling back.
 * - `supabaseBrowser()` uses the public anon key and is safe in the browser.
 *
 * We're not using Supabase Auth in Phase 1 (access is gated by a shared secret),
 * so there are no cookies/sessions to thread through — plain clients are enough.
 * If we add multi-user auth later, swap these for `@supabase/ssr` helpers.
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

function requireEnv(value: string | undefined, name: string): string {
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

// Cache the admin client across hot-reloads / lambda invocations in the module scope.
let adminClient: SupabaseClient | null = null;

/** Server-only client with full DB access. Never import into a client component. */
export function supabaseAdmin(): SupabaseClient {
  if (adminClient) return adminClient;

  const url = requireEnv(SUPABASE_URL, "NEXT_PUBLIC_SUPABASE_URL");
  const serviceKey = requireEnv(
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    "SUPABASE_SERVICE_ROLE_KEY",
  );

  adminClient = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return adminClient;
}

/** Browser/anon client. Safe to use in client components. */
export function supabaseBrowser(): SupabaseClient {
  const url = requireEnv(SUPABASE_URL, "NEXT_PUBLIC_SUPABASE_URL");
  const anonKey = requireEnv(ANON_KEY, "NEXT_PUBLIC_SUPABASE_ANON_KEY");
  return createClient(url, anonKey);
}
