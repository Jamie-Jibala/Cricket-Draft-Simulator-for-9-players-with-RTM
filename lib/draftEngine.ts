import { createServiceClient, getTeamIndexForPick, getRoundForPick } from './supabase'
import { writePick } from './sheets'

export interface PickResult {
  success: boolean
  error?: string
  pick?: Record<string, unknown>
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

  // 3. Check if team must skip
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
    .eq('available', true) // double-check (optimistic lock)

  if (lockErr) return { success: false, error: 'Player was just picked by someone else' }

  // 5. Insert pick record
  const round = getRoundForPick(room.current_pick)
  const { data: pick, error: pickErr } = await db
    .from('picks')
    .insert({
      room_id: roomId,
      pick_number: room.current_pick,
      round,
      team_id: teamId,
      player_id: playerId,
      rtm_used: rtmUsed,
    })
    .select()
    .single()

  if (pickErr) return { success: false, error: 'Failed to record pick' }

  // 6. Advance pick counter
  let nextPick = room.current_pick + 1

  // Check if next team needs to skip
  if (nextPick <= room.total_picks) {
    const nextTeamIndex = getTeamIndexForPick(nextPick, 9)
    const nextTeamId = orderRows[nextTeamIndex]?.team_id
    const { data: nextTeam } = await db
      .from('teams')
      .select('skip_next_pick')
      .eq('id', nextTeamId)
      .single()

    if (nextTeam?.skip_next_pick) {
      // Clear skip flag, advance again
      await db.from('teams').update({ skip_next_pick: false }).eq('id', nextTeamId)
      nextPick++
    }
  }

  const newStatus = nextPick > room.total_picks ? 'completed' : 'drafting'

  await db
    .from('draft_rooms')
    .update({ current_pick: nextPick, timer_remaining: 60, status: newStatus })
    .eq('id', roomId)

  // 7. Write to Google Sheets (non-blocking)
  const { data: allTeams } = await db
    .from('draft_order')
    .select('position, teams(team_name)')
    .eq('room_id', roomId)
    .order('position')

  if (allTeams) {
    const teamPosition = orderRows.findIndex((o) => o.team_id === teamId)
    const teamPickCount = await db
      .from('picks')
      .select('id', { count: 'exact' })
      .eq('room_id', roomId)
      .eq('team_id', teamId)

    writePick({
      teamName: team.team_name,
      playerName: player.player_name,
      pickInTeam: (teamPickCount.count ?? 1) as number,
      rtmUsed,
      teamColumnIndex: teamPosition,
      allTeamNames: allTeams.map((t: any) => t.teams?.team_name ?? ''),
    }).catch(console.error)
  }

  return { success: true, pick }
}

/**
 * Process an RTM claim.
 * The claiming team must have previously owned the player.
 */
export async function processRTM(params: {
  roomId: string
  claimingTeamId: string
  pickNumber: number // the pick being RTM'd
}): Promise<PickResult> {
  const db = createServiceClient()
  const { roomId, claimingTeamId, pickNumber } = params

  // Find the pick at that pick_number
  const { data: existingPick } = await db
    .from('picks')
    .select('*, players(*), teams(*)')
    .eq('room_id', roomId)
    .eq('pick_number', pickNumber)
    .single()

  if (!existingPick) return { success: false, error: 'Pick not found' }
  if (existingPick.rtm_used) return { success: false, error: 'RTM already used on this pick' }

  // Verify claiming team owned this player last season
  const { data: prevOwner } = await db
    .from('previous_season')
    .select('team_name')
    .eq('room_id', roomId)
    .ilike('player_name', existingPick.players.player_name)
    .single()

  if (!prevOwner) return { success: false, error: 'Player has no previous season record' }

  const { data: claimingTeam } = await db
    .from('teams')
    .select('team_name, rtm_remaining')
    .eq('id', claimingTeamId)
    .single()

  if (!claimingTeam) return { success: false, error: 'Team not found' }

  if (prevOwner.team_name.toLowerCase() !== claimingTeam.team_name.toLowerCase()) {
    return { success: false, error: 'You did not own this player last season' }
  }

  if (claimingTeam.rtm_remaining <= 0) {
    return { success: false, error: 'No RTM uses remaining' }
  }

  // Transfer: update pick's team_id and mark rtm_used
  await db
    .from('picks')
    .update({ team_id: claimingTeamId, rtm_used: true })
    .eq('id', existingPick.id)

  // Decrement claiming team's RTM count
  await db
    .from('teams')
    .update({ rtm_remaining: claimingTeam.rtm_remaining - 1, skip_next_pick: true })
    .eq('id', claimingTeamId)

  // The drafting team that lost the player picks again — re-insert their turn
  // This is handled by skip_next_pick on the RTM team (they skip next round)
  // The original drafting team's current pick is already next in queue

  return { success: true, pick: existingPick }
}

/**
 * Undo the last pick. Host only.
 */
export async function undoLastPick(roomId: string): Promise<PickResult> {
  const db = createServiceClient()

  const { data: room } = await db
    .from('draft_rooms')
    .select('current_pick, status')
    .eq('id', roomId)
    .single()

  if (!room) return { success: false, error: 'Room not found' }

  const lastPickNumber = room.current_pick - 1
  if (lastPickNumber < 1) return { success: false, error: 'No picks to undo' }

  const { data: lastPick } = await db
    .from('picks')
    .select('*')
    .eq('room_id', roomId)
    .eq('pick_number', lastPickNumber)
    .single()

  if (!lastPick) return { success: false, error: 'Last pick not found' }

  // Restore player availability
  await db.from('players').update({ available: true }).eq('id', lastPick.player_id)

  // Delete pick
  await db.from('picks').delete().eq('id', lastPick.id)

  // If RTM was used, restore RTM counter and clear skip
  if (lastPick.rtm_used) {
   const { data: t } = await db.from('teams').select('rtm_remaining').eq('id', lastPick.team_id).single()
await db.from('teams').update({
  rtm_remaining: (t?.rtm_remaining ?? 0) + 1,
  skip_next_pick: false,
}).eq('id', lastPick.team_id)
  }

  // Roll back current pick
  await db
    .from('draft_rooms')
    .update({ current_pick: lastPickNumber, status: 'drafting', timer_remaining: 60 })
    .eq('id', roomId)

  return { success: true }
}
