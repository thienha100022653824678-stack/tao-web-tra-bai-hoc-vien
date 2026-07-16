import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// Admin-web talks ONLY to DB A today (NEXT_PUBLIC_SUPABASE_URL +
// SUPABASE_SERVICE_ROLE_KEY) via ./supabase.ts. The V2 runtime switch is
// persisted in Supabase B `site_config` (keys v2_active_mode + v2_kill_switch),
// the same DB the Portal (student-web) already reads via its lmsSupabaseAdmin.
//
// This NEW client mirrors the Portal pattern (student-web/src/lib/supabase.ts):
// it reads LMS_SUPABASE_URL + LMS_SUPABASE_SERVICE_ROLE_KEY and is a graceful
// `null` when either is missing — so a deploy that has not yet been given DB B
// credentials fails CLOSED to V1 (see v2-runtime-controller.ts) instead of
// crashing. Admin never talks to DB B for any V1 behavior; this client is only
// used to read/flip the shared runtime mode.
//
// This client MUST ONLY be used in server-side files (API routes, middleware,
// runtime controller) — never shipped to the browser.

const lmsSupabaseUrl = process.env.LMS_SUPABASE_URL || '';
const lmsSupabaseServiceRoleKey = process.env.LMS_SUPABASE_SERVICE_ROLE_KEY || '';

export const lmsSupabaseAdmin: SupabaseClient | null =
  lmsSupabaseUrl && lmsSupabaseServiceRoleKey
    ? createClient(lmsSupabaseUrl, lmsSupabaseServiceRoleKey, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      })
    : null;

/**
 * Assert that the LMS (DB B) admin client is configured. Throws
 * `'LMS Supabase is not configured'` when `lmsSupabaseAdmin` is null — i.e.
 * when LMS_SUPABASE_URL / LMS_SUPABASE_SERVICE_ROLE_KEY are not set. The
 * runtime controller catches this and fails CLOSED to V1 with source
 * `lms_supabase_not_configured`, so a misconfigured Admin never accidentally
 * serves V2 behavior.
 */
export function assertLmsSupabase(): SupabaseClient {
  if (!lmsSupabaseAdmin) {
    throw new Error('LMS Supabase is not configured');
  }
  return lmsSupabaseAdmin;
}
