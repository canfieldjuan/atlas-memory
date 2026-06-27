import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Create the Supabase admin client without throwing during module load.
 * Next.js evaluates modules while collecting page data during `next build`,
 * and throwing there would fail the entire build if env vars are missing.
 * Instead, we create a proxy that throws when code actually tries to use the
 * client without the required configuration.
 */
function createSupabaseAdmin(): SupabaseClient {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceRoleKey) {
    const errorMessage =
      'Supabase admin client is unavailable. Please set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.';

    if (process.env.NODE_ENV !== 'production') {
      console.warn('[supabaseAdmin] ' + errorMessage);
    }

    return new Proxy(
      {},
      {
        get() {
          throw new Error(errorMessage);
        },
      },
    ) as SupabaseClient;
  }

  return createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export const supabaseAdmin = createSupabaseAdmin();
