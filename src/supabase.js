import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Supabase URL ili Key nedostaju. Dodajte ih u .env fajl.')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
