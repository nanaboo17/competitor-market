import { createClient } from '@supabase/supabase-js'

// This frontend is intentionally pinned to the market-research Supabase project.
// The publishable key is safe to expose in client-side code and remains protected by RLS.
const url = 'https://ynrwjaxkzlzbcuwaamix.supabase.co'
const key = 'sb_publishable_AtMK3rTp1kVkhULgABDYqQ_-BkPLVT1'

export const supabase = createClient(url, key)
