import { NextResponse } from 'next/server'
import { createServiceClient, getTeamIndexForPick } from '@/lib/supabase'

/**
 * Called every second by a Vercel cron job (or a lightweight client-side ping).
 * Decrements timer; on expiry, auto-advances the pick (skips current team).
 *
 * Cron config in vercel.json:
 * { "crons": [{ "path": "/api/timer-tick", "schedule": "* * * * *" }] }
 *
 * For sub-minute resolution, the client-side TimerBar handles display.
 * This endpoint ensures server state stays authoritative.
 */
export async function POST(req: Request) {
  try {
    const { roomId } = await req.json()
    const db = createServiceClient()

    const { data: room } = await db
      .from('draft_rooms')
      .select('*')
      .eq('id', roomId)
      .single()

    if (!room || room.status !== 'drafting' || !room.timer_active) {
      return NextResponse.json({ skipped: true })
    }

    const newTimer = room.timer_remaining - 1

    if (newTimer > 0) {
      await db.from('draft_rooms').update({ timer_remaining: newTimer }).eq('id', roomId)
      return NextResponse.json({ timer: newTimer })
    }

    // Timer expired — auto-skip current team (insert a "no pick" and advance)
    const { data: orderRows } = await db
      .from('draft_order')
      .select('team_id, position')
      .eq('room_id', roomId)
      .order('position')

    if (!orderRows?.length) return NextResponse.json({ error: 'No order' })

    const teamIndex = getTeamIndexForPick(room.current_pick, 9)
    const skippedTeamId = orderRows[teamIndex]?.team_id

    // Log the auto-skip as a null pick (no player_id) — treated as a skipped pick
    await db.from('picks').insert({
      room_id: roomId,
      pick_number: room.current_pick,
      round: Math.floor((room.current_pick - 1) / 9) + 1,
      team_id: skippedTeamId,
      player_id: null,
      rtm_used: false,
    })

    const nextPick = room.current_pick + 1
    const newStatus = nextPick > room.total_picks ? 'completed' : 'drafting'

    await db.from('draft_rooms').update({
      current_pick: nextPick,
      timer_remaining: 60,
      status: newStatus,
    }).eq('id', roomId)

    return NextResponse.json({ autoSkipped: true, skippedTeam: skippedTeamId })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
