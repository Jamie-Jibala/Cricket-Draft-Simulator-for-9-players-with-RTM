import { createServiceClient, getTeamIndexForPick, getRoundForPick } from './supabase'
import { writePick } from './sheets'

export interface PickResult {
  success: boolean
  error?: string
  pick?: Record<string, unknown>
  rtmPending?: boolean
}

/**
 * Atomically process a draft pick.
 * All validation is server-side; clients only see the result.
 */
export async function processPick(params: {
  roomId: string
  teamId: string
  playerId: string
  rtmUsed?: boolean
}): Promise<PickResult> {
  const db = createServiceClient()
  const { roomId, teamId, playerId, rtmUsed = false } = params

  // 1. Load room state
  const { data: room, error: roomErr } = await db
    .from('draft_rooms')
    .select('*')
    .eq('id', roomId)
    .single()

  if (roomErr || !room) return { success: false, error: 'Room not found' }
  if (room.status !== 'drafting') return { success: false, error: 'Draft is not active' }

  // 2. Verify it is this team's turn
  const { data: orderRows } = await db
    .from('draft_order')
    .select('team_id, position')
    .eq('room_id', roomId)
    .order('position')

  if (!orderRows) return { success: false, error: 'Draft order not set' }

  const teamIndex = getTeamIndexForPick(room.current_pick, 9)
  const currentTeamId = orderRows[teamIndex]?.team_id

  if (currentTeamId !== teamId) {
    return { success: false, error: 'Not your turn' }
  }

  // 3. Load team
  const { data: team } = await db
    .from('teams')
    .select('*')
    .eq('id', teamId)
    .single()

  if (!team) return { success: false, error: 'Team not found' }

  // 4. Lock player atomically (optimistic lock via available flag)
  const { data: player, error: playerErr } = await db
    .from('players')
    .select('*')
    .eq('id', playerId)
    .eq('room_id', roomId)
    .eq('available', true)
    .single()

  if (playerErr || !player) {
    return { success: false, error: 'Player already drafted or not found' }
  }

  // Mark player unavailable immediately
  const { error: lockErr } = await db
    .from('players')
    .update({ available: false })
    .eq('id', playerId)
    .eq('available', true)

  if (lockErr) return { success: false, error: 'Player was just picked by someone else'
