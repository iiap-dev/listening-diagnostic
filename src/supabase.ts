import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://xktjrzbcdlygzvjtcgfr.supabase.co'
const supabasePublishableKey = 'sb_publishable_v_M1lz9FtmzV5IrCIpkWOg_LSKMzhy5'

export const supabase = createClient(
  supabaseUrl,
  supabasePublishableKey,
)