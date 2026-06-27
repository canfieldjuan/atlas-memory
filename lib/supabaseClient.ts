import { createClient } from '@supabase/supabase-js';

// Use placeholder values during build when env vars aren't available
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://xxxxxxxxxxxxx.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'public-anon-key-placeholder';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
  console.warn('[supabaseClient] Missing Supabase environment variables. Using placeholders for build.');
}

// Client for user-facing operations (respects RLS)
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  realtime: {
    timeout: 30000, // 30 seconds timeout for slow connections
    params: {
      eventsPerSecond: 10
    }
  },
  global: {
    headers: {
      'x-application-name': 'five5-training-monitor'
    }
  }
});

// Service role client for server-side operations (bypasses RLS)
// Used for: model config lookup at runtime, system operations
export const supabaseAdmin = supabaseServiceKey
  ? createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    })
  : null;
