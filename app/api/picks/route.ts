import { NextResponse } from 'next/server'
import { processPick } from '@/lib/draftEngine'

export async function POST(req: Request) {
  try {
    const { roomId, teamId, playerId } = await req.json()

    if (!roomId || !teamId || !playerId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const result = await processPick({ roomId, teamId, playerId })

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 409 })
    }

    return NextResponse.json(result)
  } catch (err: any) {
    console.error(err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
