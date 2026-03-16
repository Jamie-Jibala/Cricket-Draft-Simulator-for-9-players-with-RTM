import { NextResponse } from 'next/server'
import { createServiceClient, generateDraftCode } from '@/lib/supabase'

export async function POST(req: Request) {
  try {
    const { hostName } = await req.json()
    if (!hostName?.trim()) {
      return NextResponse.json({ error: 'Host name is required' }, { status: 400 })
    }

    const db = createServiceClient()
    const draftCode = generateDraftCode()

    // Create room
    const { data: room, error: roomErr } = await db
      .from('draft_rooms')
      .insert({ draft_code: draftCode, host_id: hostName })
      .select()
      .single()

    if (roomErr) throw roomErr

    // Create host team (position 1 by default, can be reordered)
    const { data: hostTeam, error: teamErr } = await db
      .from('teams')
      .insert({
        room_id: room.id,
        team_name: hostName,
        draft_position: 1,
        is_host: true,
      })
      .select()
      .single()

    if (teamErr) throw teamErr

    return NextResponse.json({ room, team: hostTeam })
  } catch (err: any) {
    console.error(err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
