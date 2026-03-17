import { createClient } from '@supabase/supabase-js'

export type DraftStatus = 'waiting' | 'drafting' | 'paused' | 'completed'

export interface DraftRoom {
  id: string
  draft_code: string
  host_id: string
  status: DraftStatus
  current_pick: number
  total_picks: number
  timer_remaining: number
  timer_active: boolean
  rtm_pending: string | null
  created_at: string
  updated_at: string
}

export interface Team {
  id: string
  room_id: string
  team_name: string
  draft_position: number
  rtm_remaining: number
  skip_next_pick: boolean
  extra_pick: boolean
  is_host: boolean
}

export interface Player {
  id: string
  room_id: string
  player_id: string
  player_name: string
  role: string
  ipl_team: string
  available: boolean
}

export interface Pick {
  id: string
  room_id: string
  pick_number: number
  round: number
  team_id: string
  player_id: string
  rtm_used: boolean
  timestamp: string
  teams?: Team
  players?: Player
}

export interface PreviousSeason {
  id: string
  room_id: string
  player_name: string
  team_name: string
}

// Browser client (anon key)
export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// Server client (service role — only import in API routes)
export function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

// Snake draft helpers
export function getTeamIndexForPick(pickNumber: number, numTeams = 9): number {
  const zeroIndex = pickNumber - 1
  const round = Math.floor(zeroIndex / numTeams)
  const posInRound = zeroIndex % numTeams
  return round % 2 === 0 ? posInRound : numTeams - 1 - posInRound
}

export function getRoundForPick(pickNumber: number, numTeams = 9): number {
  return Math.floor((pickNumber - 1) / numTeams) + 1
}

export function generateDraftCode(): string {
  return Math.random().toString(36).substring(2, 8).toUpperCase()
}
