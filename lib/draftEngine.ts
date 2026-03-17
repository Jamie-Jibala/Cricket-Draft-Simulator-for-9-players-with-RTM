import { createServiceClient, getTeamIndexForPick, getRoundForPick } from './supabase'
import { writePick } from './sheets'

export interface PickResult {
  success: boolean
  error?: string
  pick?: Record<string, unknown>
  rtmPending?: boolean
}

// Check if all teams have 16 picks — this is the true end condition
async function isDraftComplete(db: any, roomId: string): Promise<boolean> {
  const { data: teams } = await db
    .from('teams')
    .select('id')
    .eq('room_id', roomId)

  if (!teams?.length) return false

  for (const team of teams) {
    const { count } = await db
      .from('picks')
      .select('id', { count: 'exact', head: true })
      .eq('room_id', roomId)
      .eq('team_id', team.id)
    if ((count ?? 0) < 16) return false
  }
  return true
}

export async function processPick(params: {
  roomId: string
  teamId: string
  playerId: string
}): Promise<PickResult> {
  const db = createServiceClient()
  const { roomId, teamId, playerId } = params

  const { data: room } = await db.from('draft_rooms').select('*').eq('id', roomId).single()
  if (!room) return { success: false, error: 'Room not found' }
  if (room.status !== 'drafting') return { success: false, error: 'Draft is not active' }

  const { data: orderRows } = await db
    .from('draft_order')
    .select('team_id, position, teams(team_name)')
    .eq('room_id', roomId)
    .order('position')
  if (!orderRows?.length) return { success: false, error: 'Draft order not set' }

  const { data: team } = await db.from('teams').select('*').eq('id', teamId).single()
  if (!team) return { success: false, error: 'Team not found' }

  // extra_pick lets a team pick regardless of snake turn order
  const usingExtraPick = !!team.extra_pick
  if (usingExtraPick) {
    await db.from('teams').update({ extra_pick: false }).eq('id', teamId)
  } else {
    const expectedIdx = getTeamIndexForPick(room.current_pick, 9)
    const expectedTeamId = orderRows[expectedIdx]?.team_id
    if (expectedTeamId !== teamId) return { success: false, error: 'Not your turn' }
  }

  const { data: player } = await db
    .from('players').select('*')
    .eq('id', playerId).eq('room_id', roomId).eq('available', true).single()
  if (!player) return { success: false, error: 'Player already drafted or not found' }

  const { error: lockErr } = await db
    .from('players').update({ available: false })
    .eq('id', playerId).eq('available', true)
  if (lockErr) return { success: false, error: 'Player was just picked by someone else' }

  const round = getRoundForPick(room.current_pick)
  const { data: pick, error: pickErr } = await db.from('picks').insert({
    room_id: roomId,
    pick_number: room.current_pick,
    round,
    team_id: teamId,
    player_id: playerId,
    rtm_used: false,
  }).select().single()
  if (pickErr) return { success: false, error: 'Failed to record pick' }

  // Check RTM eligibility — only for normal picks, not extra picks
  if (!usingExtraPick) {
    const { data: prevOwner } = await db
      .from('previous_season').select('team_name')
      .eq('room_id', roomId).ilike('player_name', player.player_name).maybeSingle()

    if (prevOwner) {
      const { data: eligibleTeam } = await db
        .from('teams').select('id, rtm_remaining')
        .eq('room_id', roomId).ilike('team_name', prevOwner.team_name).maybeSingle()

      if (eligibleTeam && eligibleTeam.rtm_remaining > 0 && eligibleTeam.id !== teamId) {
        await db.from('draft_rooms').update({
          status: 'paused',
          timer_active: false,
          rtm_pending: {
            pick_number: room.current_pick,
            player_name: player.player_name,
            player_id: playerId,
            eligible_team_id: eligibleTeam.id,
            drafted_by_team_id: teamId,
            drafter_team_name: team.team_name,
          },
        }).eq('id', roomId)
        return { success: true, pick, rtmPending: true }
      }
    }
  }

  // Advance pick
  await advancePick(db, roomId, room, orderRows, false)

  // Write to Sheets
  const allTeamNames = orderRows.map((o: any) => o.teams?.team_name ?? '')
  const teamPosition = orderRows.findIndex((o: any) => o.team_id === teamId)
  const { count } = await db.from('picks')
    .select('id', { count: 'exact', head: true })
    .eq('room_id', roomId).eq('team_id', teamId)
  writePick({
    teamName: team.team_name,
    playerName: player.player_name,
    pickInTeam: (count ?? 1) as number,
    rtmUsed: false,
    teamColumnIndex: teamPosition,
    allTeamNames,
  }).catch(console.error)

  return { success: true, pick }
}

export async function processRTM(params: {
  roomId: string
  claimingTeamId: string
  pickNumber: number
  action: 'claim' | 'decline'
  isHostOverride?: boolean
}): Promise<PickResult> {
  const db = createServiceClient()
  const { roomId, claimingTeamId, pickNumber, action, isHostOverride = false } = params

  const { data: room } = await db.from('draft_rooms').select('*').eq('id', roomId).single()
  if (!room) return { success: false, error: 'Room not found' }

  let pending: any = null
  try {
    pending = typeof room.rtm_pending === 'string'
      ? JSON.parse(room.rtm_pending)
      : room.rtm_pending
  } catch {}
  if (!pending) return { success: false, error: 'No RTM pending' }
  if (pending.pick_number !== pickNumber) return { success: false, error: 'Pick number mismatch' }
  if (!isHostOverride && pending.eligible_team_id !== claimingTeamId) {
    return { success: false, error: 'This RTM is not for your team' }
  }

  const { data: orderRows } = await db
    .from('draft_order').select('team_id, position, teams(team_name)')
    .eq('room_id', roomId).order('position')
  const allTeamNames = (orderRows ?? []).map((o: any) => o.teams?.team_name ?? '')

  // ── DECLINE ──
  if (action === 'decline') {
    const { data: declinePick } = await db.from('picks')
      .select('*, players(*), teams(*)')
      .eq('room_id', roomId).eq('pick_number', pickNumber).single()

    if (declinePick) {
      const teamPos = (orderRows ?? []).findIndex((o: any) => o.team_id === declinePick.team_id)
      const { count } = await db.from('picks')
        .select('id', { count: 'exact', head: true })
        .eq('room_id', roomId).eq('team_id', declinePick.team_id)
      writePick({
        teamName: (declinePick as any).teams?.team_name ?? '',
        playerName: (declinePick as any).players?.player_name ?? '',
        pickInTeam: (count ?? 1) as number,
        rtmUsed: false,
        teamColumnIndex: teamPos,
        allTeamNames,
      }).catch(console.error)
    }

    // Normal advance — no extra pick needed
    await advancePick(db, roomId, room, orderRows ?? [], false)
    return { success: true }
  }

  // ── CLAIM ──
  const { data: existingPick } = await db.from('picks')
    .select('*, players(*), teams(*)')
    .eq('room_id', roomId).eq('pick_number', pickNumber).single()
  if (!existingPick) return { success: false, error: 'Pick not found' }

  const { data: claimingTeam } = await db.from('teams')
    .select('team_name, rtm_remaining')
    .eq('id', pending.eligible_team_id).single()
  if (!claimingTeam) return { success: false, error: 'Team not found' }
  if (claimingTeam.rtm_remaining <= 0) return { success: false, error: 'No RTM uses remaining' }

  // Transfer pick to claiming team
  await db.from('picks')
    .update({ team_id: pending.eligible_team_id, rtm_used: true })
    .eq('id', existingPick.id)

  // RTM team: decrement RTM, set skip penalty
  await db.from('teams')
    .update({ rtm_remaining: claimingTeam.rtm_remaining - 1, skip_next_pick: true })
    .eq('id', pending.eligible_team_id)

  // Original drafter: grant extra pick
  await db.from('teams')
    .update({ extra_pick: true })
    .eq('id', pending.drafted_by_team_id)

  // Write to Sheets under claiming team
  const teamPos = (orderRows ?? []).findIndex((o: any) => o.team_id === pending.eligible_team_id)
  const { count } = await db.from('picks')
    .select('id', { count: 'exact', head: true })
    .eq('room_id', roomId).eq('team_id', pending.eligible_team_id)
  writePick({
    teamName: claimingTeam.team_name,
    playerName: (existingPick as any).players?.player_name ?? '',
    pickInTeam: (count ?? 1) as number,
    rtmUsed: true,
    teamColumnIndex: teamPos,
    allTeamNames,
  }).catch(console.error)

  // Advance pick — but do NOT apply skip check here
  // The skip will fire naturally when the next snake pick lands on the RTM team
  await advancePick(db, roomId, room, orderRows ?? [], true)

  return { success: true, pick: existingPick }
}

// skipSkipCheck = true when called after RTM claim
// This prevents double-skipping: the RTM team's skip_next_pick
// will fire naturally when the snake lands on them next
async function advancePick(
  db: any,
  roomId: string,
  room: any,
  orderRows: any[],
  skipSkipCheck: boolean
) {
  let nextPick = room.current_pick + 1

  if (!skipSkipCheck && nextPick <= room.total_picks) {
    const nextTeamIdx = getTeamIndexForPick(nextPick, 9)
    const nextTeamId = orderRows[nextTeamIdx]?.team_id
    if (nextTeamId) {
      const { data: nextTeam } = await db.from('teams')
        .select('skip_next_pick').eq('id', nextTeamId).single()
      if (nextTeam?.skip_next_pick) {
        await db.from('teams').update({ skip_next_pick: false }).eq('id', nextTeamId)
        nextPick++
      }
    }
  }

  // End condition: all teams have 16 picks
  const complete = await isDraftComplete(db, roomId)
  const newStatus = complete ? 'completed' : 'drafting'

  await db.from('draft_rooms').update({
    status: newStatus,
    timer_active: newStatus === 'drafting',
    timer_remaining: 60,
    current_pick: nextPick,
    rtm_pending: null,
  }).eq('id', roomId)
}

export async function undoLastPick(roomId: string): Promise<PickResult> {
  const db = createServiceClient()
  const { data: room } = await db.from('draft_rooms').select('*').eq('id', roomId).single()
  if (!room) return { success: false, error: 'Room not found' }

  if (room.rtm_pending) {
    const pending: any = typeof room.rtm_pending === 'string'
      ? JSON.parse(room.rtm_pending) : room.rtm_pending
    if (pending?.player_id) {
      await db.from('players').update({ available: true }).eq('id', pending.player_id)
    }
    await db.from('picks').delete().eq('room_id', roomId).eq('pick_number', pending.pick_number)
    await db.from('draft_rooms').update({
      status: 'drafting',
      timer_active: true,
      timer_remaining: 60,
      rtm_pending: null,
    }).eq('id', roomId)
    return { success: true }
  }

  const lastPickNumber = room.current_pick - 1
  if (lastPickNumber < 1) return { success: false, error: 'No picks to undo' }

  const { data: lastPick } = await db.from('picks').select('*')
    .eq('room_id', roomId).eq('pick_number', lastPickNumber).single()
  if (!lastPick) return { success: false, error: 'Last pick not found' }

  await db.from('players').update({ available: true }).eq('id', lastPick.player_id)
  await db.from('picks').delete().eq('id', lastPick.id)

  if (lastPick.rtm_used) {
    const { data: t } = await db.from('teams')
      .select('rtm_remaining').eq('id', lastPick.team_id).single()
    await db.from('teams').update({
      rtm_remaining: (t?.rtm_remaining ?? 0) + 1,
      skip_next_pick: false,
    }).eq('id', lastPick.team_id)
  }

  await db.from('draft_rooms').update({
    current_pick: lastPickNumber,
    status: 'drafting',
    timer_active: true,
    timer_remaining: 60,
    rtm_pending: null,
  }).eq('id', roomId)

  return { success: true }
}
