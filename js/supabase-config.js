/* ============================================
   本 (HON) — SUPABASE CLIENT SETUP
   The publishable key below is meant to be public —
   Supabase's own docs call it "safe to use in a
   browser." Row Level Security (see supabase/migrations/)
   is what actually protects the data, not key secrecy.
   ============================================ */

const HON_SUPABASE_URL = 'https://utlkzpabshnekjnpsuky.supabase.co';
const HON_SUPABASE_ANON_KEY = 'sb_publishable_iPFQ81hDr8T29RL5Gkc3cA_nR7lU_Ka';

const honSupabase = window.supabase.createClient(HON_SUPABASE_URL, HON_SUPABASE_ANON_KEY);
