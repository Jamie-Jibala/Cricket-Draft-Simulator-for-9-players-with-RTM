import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

export async function POST(
  req: Request,
  { params }: { params: { code: string } }
) {
  try {
    const { teamName } = await req.json()
    const code = params.code.toUpperCase()

    if (!teamName?.trim()) {
      return NextResponse.json({ error: 'Team name required' }, { status: 400 })
    }

    const db = createServiceClient()

    // Find room
    const { data: room, error: roomErr } = await db
      .from('draft_rooms')
      .select('*')
      .eq('draft_code', code)
      .single()

    if (roomErr || !room) {
      return NextResponse.json({ error: 'Draft room not found' }, { status: 404 })
    }
    if (room.status !== 'waiting') {
      return NextResponse.json({ error: 'Draft has already started' }, { status: 400 })
    }

    // Check team count
    const { count } = await db
      .from('teams')
      .select('id', { count: 'exact' })
      .eq('room_id', room.id)

    if ((count ?? 0) >= 9) {
      return NextResponse.json({ error: 'Room is full (9 teams max)' }, { status: 400 })
    }

    // Check name collision
    const { data: existing } = await db
      .from('teams')
      .select('id')
      .eq('room_id', room.id)
      .ilike('team_name', teamName)
      .single()

    if (existing) {
      return NextResponse.json({ error: 'Team name already taken' }, { status: 409 })
    }

    // Join
    const { data: team, error: teamErr } = await db
      .from('teams')
      .insert({
        room_id: room.id,
        team_name: teamName,
        draft_position: (count ?? 0) + 1,
      })
      .select()
      .single()

    if (teamErr) throw teamErr

    return NextResponse.json({ room, team })
  } catch (err: any) {
    console.error(err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
