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

  // 5b. Check RTM eligibility — look up previous season ownership
  // 5b. Check RTM eligibility — look up previous season ownership
  const { data: prevOwner } = await db
    .from('previous_season')
    .select('team_name')
    .eq('room_id', roomId)
    .ilike('player_name', player.player_name)
    .maybeSingle()

  if (prevOwner) {
    const { data: eligibleTeam } = await db
      .from('teams')
      .select('id, rtm_remaining')
      .eq('room_id', roomId)
      .ilike('team_name', prevOwner.team_name)
      .maybeSingle()

    if (eligibleTeam && eligibleTeam.rtm_remaining > 0 && eligibleTeam.id !== teamId) {
      // Pause draft — do NOT advance pick counter yet
      // do NOT write to Google Sheets yet
      // current_pick stays the same so original drafter goes again if RTM is claimed
      await db.from('draft_rooms').update({
        status: 'paused',
        timer_active: false,
        rtm_pending: JSON.stringify({
          pick_number: room.current_pick,
          player_name: player.player_name,
          player_id: playerId,
          eligible_team_id: eligibleTeam.id,
          drafted_by_team_id: teamId,
          drafter_team_name: team.team_name,
        })
      }).eq('id', roomId)

      return { success: true, pick, rtmPending: true }
    }
  }

  // 6. Advance pick counter
  let nextPick = room.current_pick + 1

  if (nextPick <= room.total_picks) {
    const nextTeamIndex = getTeamIndexForPick(nextPick, 9)
    const nextTeamId = orderRows[nextTeamIndex]?.team_id
    const { data: nextTeam } = await db
      .from('teams')
      .select('skip_next_pick')
      .eq('id', nextTeamId)
      .single()

    if (nextTeam?.skip_next_pick) {
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
 * Process an RTM decision: claim or decline.
 * Can also be triggered by host as override.
 */
export async function processRTM(params: {
  roomId: string
  claimingTeamId: string
  pickNumber: number
  action: 'claim' | 'decline'
  isHostOverride?: boolean
}): Promise<PickResult> {
  const db = createServiceClient()
  const { roomId, claimingTeamId, pickNumber, action, isHostOverride = false } = params

  const { data: room } = await db
    .from('draft_rooms')
    .select('*')
    .eq('id', roomId)
    .single()

  if (!room) return { success: false, error: 'Room not found' }

  // Parse rtm_pending
  let pending: any = null
  try { pending = room.rtm_pending ? JSON.parse(room.rtm_pending) : null } catch {}
  if (!pending) return { success: false, error: 'No RTM pending' }

  if (pending.pick_number !== pickNumber) return { success: false, error: 'Pick number mismatch' }

  if (!isHostOverride && pending.eligible_team_id !== claimingTeamId) {
    return { success: false, error: 'This RTM is not for your team' }
  }

  if (action === 'decline') {
    await advanceAfterRTMDecision(db, roomId, room)
    return { success: true }
  }

  // --- CLAIM ---
  const { data: existingPick } = await db
    .from('picks')
    .select('*, players(*), teams(*)')
    .eq('room_id', roomId)
    .eq('pick_number', pickNumber)
    .single()

  if (!existingPick) return { success: false, error: 'Pick not found' }

  const { data: claimingTeam } = await db
    .from('teams')
    .select('team_name, rtm_remaining')
    .eq('id', pending.eligible_team_id)
    .single()

  if (!claimingTeam) return { success: false, error: 'Team not found' }
  if (claimingTeam.rtm_remaining <= 0) return { success: false, error: 'No RTM uses remaining' }

  // Transfer pick to claiming team
  await db
    .from('picks')
    .update({ team_id: pending.eligible_team_id, rtm_used: true })
    .eq('id', existingPick.id)

  // Decrement RTM count and set skip_next_pick penalty
  await db
    .from('teams')
    .update({ rtm_remaining: claimingTeam.rtm_remaining - 1, skip_next_pick: true })
    .eq('id', pending.eligible_team_id)

  await advanceAfterRTMDecision(db, roomId, room)

  return { success: true, pick: existingPick }
}

async function advanceAfterRTMDecision(
  db: any,
  roomId: string,
  room: any,
  rtmClaimed: boolean,
  pending: any,
  orderRows: any[]
) {
  // If RTM was CLAIMED:
  //   - original drafter picks again (current_pick stays the same)
  //   - RTM team skips their next turn (already set via skip_next_pick)
  // If RTM was DECLINED:
  //   - normal advance, original drafter does NOT get another pick
  let nextPick = room.current_pick + 1

  if (rtmClaimed) {
    // Don't advance — original drafter gets their pick back
    nextPick = room.current_pick
  } else {
    // Normal advance — check if next team needs to skip
    if (nextPick <= room.total_picks) {
      const nextTeamIndex = getTeamIndexForPick(nextPick, 9)
      const nextTeamId = orderRows[nextTeamIndex]?.team_id
      const { data: nextTeam } = await db
        .from('teams')
        .select('skip_next_pick')
        .eq('id', nextTeamId)
        .single()
      if (nextTeam?.skip_next_pick) {
        await db.from('teams').update({ skip_next_pick: false }).eq('id', nextTeamId)
        nextPick++
      }
    }
  }

  const newStatus = nextPick > room.total_picks ? 'completed' : 'drafting'
  await db.from('draft_rooms').update({
    status: newStatus,
    timer_active: newStatus === 'drafting',
    timer_remaining: 60,
    current_pick: nextPick,
    rtm_pending: null,
  }).eq('id', roomId)
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
    const { data: t } = await db
      .from('teams')
      .select('rtm_remaining')
      .eq('id', lastPick.team_id)
      .single()
    await db.from('teams').update({
      rtm_remaining: (t?.rtm_remaining ?? 0) + 1,
      skip_next_pick: false,
    }).eq('id', lastPick.team_id)
  }

  // Clear any pending RTM and roll back pick counter
  await db
    .from('draft_rooms')
    .update({
      current_pick: lastPickNumber,
      status: 'drafting',
      timer_remaining: 60,
      rtm_pending: null,
    })
    .eq('id', roomId)

  return { success: true }
}
