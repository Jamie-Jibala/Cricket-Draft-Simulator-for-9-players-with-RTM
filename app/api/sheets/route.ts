import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { undoLastPick } from '@/lib/draftEngine'
import { initSheetHeaders } from '@/lib/sheets'

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { action, roomId, hostId, draftOrder } = body
    const db = createServiceClient()

    // Verify host
    const { data: room } = await db
      .from('draft_rooms')
      .select('*')
      .eq('id', roomId)
      .single()

    if (!room) return NextResponse.json({ error: 'Room not found' }, { status: 404 })
    if (room.host_id !== hostId) return NextResponse.json({ error: 'Not host' }, { status: 403 })

    switch (action) {
      case 'set_order': {
        // draftOrder = array of team_ids in desired order
        if (!draftOrder?.length) {
          return NextResponse.json({ error: 'draftOrder required' }, { status: 400 })
        }
        await db.from('draft_order').delete().eq('room_id', roomId)
        const rows = draftOrder.map((teamId: string, i: number) => ({
          room_id: roomId,
          position: i + 1,
          team_id: teamId,
        }))
        await db.from('draft_order').insert(rows)

        // Init Google Sheet with team names in draft order
        const { data: teams } = await db
          .from('teams')
          .select('id, team_name')
          .eq('room_id', roomId)
        const nameMap = Object.fromEntries((teams ?? []).map((t) => [t.id, t.team_name]))
        const orderedNames = draftOrder.map((id: string) => nameMap[id] ?? id)
        initSheetHeaders(orderedNames).catch(console.error)

        return NextResponse.json({ success: true })
      }

      case 'start': {
        if (room.status !== 'waiting') {
          return NextResponse.json({ error: 'Draft already started' }, { status: 400 })
        }
        // Verify draft order is set
        const { count } = await db
          .from('draft_order')
          .select('position', { count: 'exact' })
          .eq('room_id', roomId)
        if (!count) {
          return NextResponse.json({ error: 'Set draft order first' }, { status: 400 })
        }
        await db
          .from('draft_rooms')
          .update({ status: 'drafting', timer_active: true, current_pick: 1 })
          .eq('id', roomId)
        return NextResponse.json({ success: true })
      }

      case 'pause': {
        await db
          .from('draft_rooms')
          .update({ status: 'paused', timer_active: false })
          .eq('id', roomId)
        return NextResponse.json({ success: true })
      }

      case 'resume': {
        await db
          .from('draft_rooms')
          .update({ status: 'drafting', timer_active: true })
          .eq('id', roomId)
        return NextResponse.json({ success: true })
      }

      case 'undo': {
        const result = await undoLastPick(roomId)
        if (!result.success) {
          return NextResponse.json({ error: result.error }, { status: 400 })
        }
        return NextResponse.json({ success: true })
      }

      default:
        return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
    }
  } catch (err: any) {
    console.error(err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
