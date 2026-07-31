import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || 'https://dummy.supabase.co';

if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
  // Falling back off the service-role key means every query below runs
  // under RLS instead of bypassing it - queries that join a table with no
  // anon-role SELECT policy (e.g. hotel_stays -> bookings) will silently
  // return zero rows instead of erroring, which looks exactly like a broken
  // search/filter to whoever's staring at the empty list.
  console.warn(
    'SUPABASE_SERVICE_ROLE_KEY not set - falling back to the anon key (or a dummy key). RLS-restricted queries may silently return zero rows.'
  );
}

const supabaseServiceKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  'dummy-key';

export const supabase = createClient(supabaseUrl, supabaseServiceKey);
