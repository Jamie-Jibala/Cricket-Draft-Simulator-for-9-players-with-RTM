import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const code = searchParams.get('code')
  const player = searchParams.get('player')

  if (!code) {
    return NextResponse.json({ error: 'Pass ?code=YOURCODE' })
  }

  const db = createServiceClient()

  const { data: room } = await db
    .from('draft_rooms')
    .select('*')
    .eq('draft_code', code.toUpperCase())
    .single()

  if (!room) return NextResponse.json({ error: 'Room not found' })

  const { data: teams } = await db
    .from('teams')
    .select('id, team_name, rtm_remaining, skip_next_pick, extra_pick')
    .eq('room_id', room.id)

  const { data: prevSeason, count: prevCount } = await db
    .from('previous_season')
    .select('player_name, team_name', { count: 'exact' })
    .eq('room_id', room.id)
    .order('player_name')

  let playerLookup = null
  if (player) {
    const { data: prevOwner } = await db
      .from('previous_season')
      .select('team_name')
      .eq('room_id', room.id)
      .ilike('player_name', player)
      .maybeSingle()

    if (prevOwner) {
      const { data: eligibleTeam } = await db
        .from('teams')
        .select('id, team_name, rtm_remaining')
        .eq('room_id', room.id)
        .ilike('team_name', prevOwner.team_name)
        .maybeSingle()

      playerLookup = {
        searched_for: player,
        previous_owner_found: prevOwner?.team_name ?? null,
        eligible_team_in_draft: eligibleTeam ?? null,
        would_trigger_rtm: !!(eligibleTeam && eligibleTeam.rtm_remaining > 0),
      }
    } else {
      playerLookup = {
        searched_for: player,
        previous_owner_found: null,
        eligible_team_in_draft: null,
        would_trigger_rtm: false,
        reason: 'Player not found in previous_season table',
      }
    }
  }

  return NextResponse.json({
    room: {
      id: room.id,
      draft_code: room.draft_code,
      status: room.status,
      current_pick: room.current_pick,
      rtm_pending: room.rtm_pending,
    },
    teams,
    previous_season_count: prevCount,
    previous_season_records: prevSeason,
    player_lookup: playerLookup,
  })
}
