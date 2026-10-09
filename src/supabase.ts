import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://xktjrzbcdlygzvjtcgfr.supabase.co'
const supabasePublishableKey = 'sb_publishable_v_M1lz9FtmzV5IrCIpkWOg_LSKMzhy5'

export const supabase = createClient(
  supabaseUrl,
  supabasePublishableKey,
)

let anonymousSignInPromise: Promise<void> | null = null

export const ensureSupabaseSession = async () => {
  const { data, error } = await supabase.auth.getSession()

  if (error) {
    throw error
  }

  if (data.session) {
    return
  }

  if (!anonymousSignInPromise) {
    anonymousSignInPromise = (async () => {
      const { data, error } = await supabase.auth.signInAnonymously()

      if (error) {
        throw error
      }

      if (!data.session) {
        throw new Error('Supabase session was not created.')
      }
    })().finally(() => {
      anonymousSignInPromise = null
    })
  }

  await anonymousSignInPromise
}
